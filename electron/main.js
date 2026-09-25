/**
 * electron/main.js
 *
 * Owns three responsibilities:
 *   1. Electron window bootstrap.
 *   2. Native UDP server (dgram) ingesting high-frequency telemetry,
 *      decoding it via shared/packetSchema, storing it in bounded
 *      per-device ring buffers, and flushing BATCHED updates to the
 *      renderer on a fixed interval (IPC_FLUSH_INTERVAL_MS) -- this is
 *      the fix for Electron's IPC-bottleneck weak point: the renderer
 *      never sees more than one IPC message per flush window, no matter
 *      how fast packets actually arrive.
 *   3. A UDP *client* for bidirectional control: the renderer asks (via
 *      secure IPC) to send a command to a target device, and this
 *      process dispatches the actual UDP datagram.
 */

'use strict';

const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('node:path');
const fs = require('node:fs');
const dgram = require('node:dgram');

const { decodePacket } = require('../shared/packetSchema');
const { RingBuffer } = require('../shared/ringBuffer');
const config = require('../shared/config');

// ---------------------------------------------------------------------------
// Telemetry state (main-process-owned, authoritative)
// ---------------------------------------------------------------------------

/** @type {Map<string, RingBuffer>} deviceId -> ring buffer of decoded readings */
const deviceHistory = new Map();

/** Every decoded reading this session, for CSV export (bounded separately). */
const sessionLog = new RingBuffer(50000);

/** Packets pending flush to the renderer since the last IPC send. */
let pendingBatch = [];

/** Sliding-window counters for throughput analytics. */
const throughput = {
  windowStart: Date.now(),
  packetsInWindow: 0,
  bytesInWindow: 0,
  packetsPerSec: 0,
  kbPerSec: 0,
};

let malformedCount = 0;
let validCount = 0;
let currentPort = config.TELEMETRY_PORT;

let mainWindow = null;
let udpServer = null;
let controlSocket = null;

// ---------------------------------------------------------------------------
// UDP telemetry server
// ---------------------------------------------------------------------------

function getOrCreateHistory(deviceId) {
  let rb = deviceHistory.get(deviceId);
  if (!rb) {
    rb = new RingBuffer(config.RING_BUFFER_SIZE);
    deviceHistory.set(deviceId, rb);
  }
  return rb;
}

function startUdpServer(port = currentPort) {
  if (udpServer) {
    udpServer.close();
  }

  udpServer = dgram.createSocket('udp4');

  udpServer.on('message', (msg, rinfo) => {
    // Throughput accounting happens for every packet, valid or not --
    // a malformed-packet storm is itself a signal worth surfacing.
    throughput.packetsInWindow += 1;
    throughput.bytesInWindow += msg.length;

    const decoded = decodePacket(msg);

    if (!decoded.valid) {
      malformedCount += 1;
      pendingBatch.push({ kind: 'malformed', reason: decoded.reason, from: rinfo.address, at: Date.now() });
      return;
    }

    validCount += 1;
    const reading = { ...decoded, kind: 'reading' };
    getOrCreateHistory(decoded.deviceId).push(reading);
    sessionLog.push(reading);
    pendingBatch.push(reading);
  });

  udpServer.on('error', (err) => {
    console.error('[udp-server] error:', err);
    pendingBatch.push({ kind: 'server-error', message: err.message, at: Date.now() });
  });

  udpServer.on('listening', () => {
    const addr = udpServer.address();
    console.log(`[udp-server] listening on udp://${addr.address}:${addr.port}`);
    if (mainWindow) {
      mainWindow.webContents.send('telemetry:serverStatus', { listening: true, port: addr.port });
    }
  });

  udpServer.bind(port, config.TELEMETRY_HOST);
  currentPort = port;
}

// Rolling throughput computation, independent of the IPC flush cadence so
// packets/sec and KB/s stay accurate even if the flush interval changes.
setInterval(() => {
  const now = Date.now();
  const elapsedSec = (now - throughput.windowStart) / 1000;
  if (elapsedSec > 0) {
    throughput.packetsPerSec = Math.round(throughput.packetsInWindow / elapsedSec);
    throughput.kbPerSec = Number((throughput.bytesInWindow / 1024 / elapsedSec).toFixed(2));
  }
  throughput.windowStart = now;
  throughput.packetsInWindow = 0;
  throughput.bytesInWindow = 0;
}, config.THROUGHPUT_WINDOW_MS);

// The IPC-batching heartbeat: this interval is the ONLY place that talks to
// the renderer about telemetry. Ingest rate and render rate are fully
// decoupled by this queue-and-flush.
setInterval(() => {
  if (!mainWindow || pendingBatch.length === 0) return;
  mainWindow.webContents.send('telemetry:batch', {
    items: pendingBatch,
    stats: {
      packetsPerSec: throughput.packetsPerSec,
      kbPerSec: throughput.kbPerSec,
      validCount,
      malformedCount,
      deviceCount: deviceHistory.size,
    },
  });
  pendingBatch = [];
}, config.IPC_FLUSH_INTERVAL_MS);

// ---------------------------------------------------------------------------
// UDP control client (bidirectional: renderer -> main -> remote device)
// ---------------------------------------------------------------------------

function getControlSocket() {
  if (!controlSocket) controlSocket = dgram.createSocket('udp4');
  return controlSocket;
}

ipcMain.handle('control:sendCommand', async (_event, { targetHost, targetPort, deviceId, command }) => {
  if (!targetHost || !targetPort || !command) {
    return { ok: false, error: 'targetHost, targetPort and command are required' };
  }
  const payload = JSON.stringify({
    type: command,
    deviceId: deviceId || null,
    issuedAt: Date.now(),
    nonce: Math.random().toString(36).slice(2),
  });

  return new Promise((resolve) => {
    getControlSocket().send(Buffer.from(payload, 'utf8'), Number(targetPort), targetHost, (err) => {
      if (err) {
        resolve({ ok: false, error: err.message });
      } else {
        resolve({ ok: true, sentAt: Date.now(), payload });
      }
    });
  });
});

// ---------------------------------------------------------------------------
// Misc IPC: server config, on-demand snapshot, CSV export
// ---------------------------------------------------------------------------

ipcMain.handle('telemetry:getServerInfo', () => ({
  port: currentPort,
  host: config.TELEMETRY_HOST,
  flushIntervalMs: config.IPC_FLUSH_INTERVAL_MS,
}));

ipcMain.handle('telemetry:setPort', (_event, port) => {
  try {
    startUdpServer(Number(port));
    return { ok: true, port: Number(port) };
  } catch (err) {
    return { ok: false, error: err.message };
  }
});

ipcMain.handle('telemetry:getSnapshot', () => {
  const devices = {};
  for (const [id, rb] of deviceHistory.entries()) {
    devices[id] = rb.toArray().slice(-200); // recent tail only; full history stays server-side
  }
  return { devices, malformedCount, validCount };
});

ipcMain.handle('logs:exportCsv', async () => {
  if (!mainWindow) return { ok: false, error: 'no window' };

  const { canceled, filePath } = await dialog.showSaveDialog(mainWindow, {
    title: 'Export telemetry log (CSV)',
    defaultPath: path.join(app.getPath('documents'), `telemetry-log-${Date.now()}.csv`),
    filters: [{ name: 'CSV', extensions: ['csv'] }],
  });
  if (canceled || !filePath) return { ok: false, error: 'canceled' };

  const rows = sessionLog.toArray();
  const header = 'deviceId,timestamp,isoTime,temperature,cpuUsage,status\n';
  const body = rows
    .map((r) => `${r.deviceId},${r.timestamp},${new Date(r.timestamp).toISOString()},${r.temperature.toFixed(2)},${r.cpuUsage.toFixed(2)},${r.status}`)
    .join('\n');

  await fs.promises.writeFile(filePath, header + body, 'utf8');
  return { ok: true, filePath, rowCount: rows.length };
});

// ---------------------------------------------------------------------------
// Window bootstrap
// ---------------------------------------------------------------------------

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    backgroundColor: '#0b0f14',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  const devServerUrl = process.env.VITE_DEV_SERVER_URL;
  if (devServerUrl) {
    mainWindow.loadURL(devServerUrl);
    mainWindow.webContents.openDevTools({ mode: 'detach' });
  } else {
    mainWindow.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));
  }
}

app.whenReady().then(() => {
  createWindow();
  startUdpServer();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (udpServer) udpServer.close();
  if (controlSocket) controlSocket.close();
  if (process.platform !== 'darwin') app.quit();
});
