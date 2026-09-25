/**
 * udp_simulator.js
 *
 * Standalone test harness -- simulates 3 enterprise IoT devices streaming
 * binary telemetry packets over UDP every 100ms to the Electron gateway's
 * UDP server. Run this alongside the desktop app to exercise it end to end.
 *
 * Deliberately introduces anomalies so the dashboard's alerting/health
 * logic has something real to catch:
 *   - "spike"    : temperature/CPU briefly jump to dangerous levels
 *   - "dropout"  : device silently stops sending for a few cycles
 *   - "malformed": a structurally broken/corrupted packet is sent, to
 *                  exercise the checksum-validation / malformed-packet path
 *
 * Usage:
 *   node udp_simulator.js
 *   node udp_simulator.js --port 41234 --host 127.0.0.1 --interval 100
 */

'use strict';

const dgram = require('dgram');
const { encodePacket, PACKET_SIZE } = require('./shared/packetSchema');
const defaultConfig = require('./shared/config');

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    if (argv[i].startsWith('--')) {
      const key = argv[i].slice(2);
      const val = argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : true;
      out[key] = val;
      if (val !== true) i++;
    }
  }
  return out;
}

const args = parseArgs(process.argv.slice(2));
const HOST = args.host || defaultConfig.TELEMETRY_HOST;
const PORT = Number(args.port) || defaultConfig.TELEMETRY_PORT;
const INTERVAL_MS = Number(args.interval) || 100;
const CONTROL_PORT = Number(args['control-port']) || 41235;

const DEVICES = [
  { deviceId: 'DEV-A001', baseTemp: 42, baseCpu: 30 },
  { deviceId: 'DEV-B002', baseTemp: 55, baseCpu: 45 },
  { deviceId: 'DEV-C003', baseTemp: 38, baseCpu: 20 },
];

const socket = dgram.createSocket('udp4');

// Second socket: stands in for "the remote devices' command receivers" so
// the dashboard's Control Panel (main -> UDP client -> here) is actually
// end-to-end testable, not just fire-and-forget into the void.
const controlListener = dgram.createSocket('udp4');
controlListener.on('message', (msg, rinfo) => {
  try {
    const cmd = JSON.parse(msg.toString('utf8'));
    console.log(`[control-listener] received ${cmd.type} for ${cmd.deviceId || '(broadcast)'} from ${rinfo.address}:${rinfo.port}`);
  } catch {
    console.log(`[control-listener] received non-JSON control packet (${msg.length} bytes) from ${rinfo.address}:${rinfo.port}`);
  }
});
controlListener.bind(CONTROL_PORT, HOST, () => {
  console.log(`[control-listener] standing in for device command receivers on udp://${HOST}:${CONTROL_PORT}`);
});

let sentCount = 0;
let malformedSentCount = 0;
let dropoutCount = 0;

// Per-device transient state so anomalies play out over several cycles
// instead of flickering on/off every tick (more realistic).
const state = new Map(
  DEVICES.map((d) => [
    d.deviceId,
    { spikeCyclesLeft: 0, dropoutCyclesLeft: 0 },
  ])
);

function jitter(base, amount) {
  return base + (Math.random() * 2 - 1) * amount;
}

function buildReading(device) {
  const s = state.get(device.deviceId);
  let temperature = jitter(device.baseTemp, 2);
  let cpuUsage = jitter(device.baseCpu, 5);
  let status = 'OK';

  // Roll for a new spike if none is active (~1.5% chance per tick).
  if (s.spikeCyclesLeft === 0 && Math.random() < 0.015) {
    s.spikeCyclesLeft = 5 + Math.floor(Math.random() * 10); // 0.5s - 1.5s of spike
  }
  if (s.spikeCyclesLeft > 0) {
    temperature = jitter(device.baseTemp + 35, 5); // dangerous overheat
    cpuUsage = jitter(95, 4); // pegged CPU
    status = temperature > device.baseTemp + 40 ? 'CRITICAL' : 'WARN';
    s.spikeCyclesLeft -= 1;
  }

  cpuUsage = Math.min(100, Math.max(0, cpuUsage));

  return {
    deviceId: device.deviceId,
    timestamp: Date.now(),
    temperature,
    cpuUsage,
    status,
  };
}

function maybeStartDropout(device) {
  const s = state.get(device.deviceId);
  if (s.dropoutCyclesLeft === 0 && Math.random() < 0.008) {
    s.dropoutCyclesLeft = 10 + Math.floor(Math.random() * 20); // 1s - 3s silent
  }
}

function sendMalformedPacket(device) {
  // Occasionally corrupt an otherwise well-formed packet (flips a byte
  // after checksum is computed) or send a garbage-length buffer -- both
  // should be rejected and flagged by the gateway's decoder.
  if (Math.random() < 0.5) {
    const buf = encodePacket(buildReading(device));
    buf[Math.floor(Math.random() * (PACKET_SIZE - 1))] ^= 0xff; // corrupt a byte
    return buf;
  }
  return Buffer.alloc(Math.floor(Math.random() * PACKET_SIZE)); // wrong length
}

function tick() {
  for (const device of DEVICES) {
    const s = state.get(device.deviceId);

    maybeStartDropout(device);
    if (s.dropoutCyclesLeft > 0) {
      s.dropoutCyclesLeft -= 1;
      dropoutCount += 1;
      continue; // simulate the device going silent
    }

    // ~0.7% of live packets are sent malformed to test the validation path.
    const sendMalformed = Math.random() < 0.007;
    const payload = sendMalformed ? sendMalformedPacket(device) : encodePacket(buildReading(device));

    socket.send(payload, PORT, HOST, (err) => {
      if (err) console.error(`[simulator] send error for ${device.deviceId}:`, err.message);
    });

    sentCount += 1;
    if (sendMalformed) malformedSentCount += 1;
  }
}

const timer = setInterval(tick, INTERVAL_MS);

const statsTimer = setInterval(() => {
  console.log(
    `[simulator] sent=${sentCount} malformed=${malformedSentCount} dropoutTicks=${dropoutCount} -> ${HOST}:${PORT}`
  );
}, 5000);

console.log(`[simulator] streaming ${DEVICES.length} devices every ${INTERVAL_MS}ms to udp://${HOST}:${PORT}`);
console.log('[simulator] devices:', DEVICES.map((d) => d.deviceId).join(', '));
console.log('[simulator] Ctrl+C to stop.');

process.on('SIGINT', () => {
  clearInterval(timer);
  clearInterval(statsTimer);
  socket.close();
  controlListener.close(() => process.exit(0));
});
