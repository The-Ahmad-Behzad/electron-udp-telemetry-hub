/**
 * electron/preload.js
 *
 * The ONLY surface the renderer ever touches. contextIsolation is on and
 * nodeIntegration is off (see main.js BrowserWindow webPreferences), so the
 * renderer has zero direct access to Node/Electron internals -- everything
 * goes through this whitelisted, typed bridge.
 *
 * Note the pattern for `onTelemetryBatch`: it returns an unsubscribe
 * function rather than leaving raw ipcRenderer listeners attached, so React
 * effects can clean up properly instead of stacking duplicate listeners on
 * every re-render (a common source of the exact IPC/memory issues this
 * project is meant to demonstrate solving correctly).
 */

'use strict';

const { contextBridge, ipcRenderer } = require('electron');

function bridgeChannel(channel) {
  return (callback) => {
    const listener = (_event, payload) => callback(payload);
    ipcRenderer.on(channel, listener);
    return () => ipcRenderer.removeListener(channel, listener);
  };
}

contextBridge.exposeInMainWorld('gatewayApi', {
  // Streams batched telemetry (readings + malformed-packet flags + stats).
  onTelemetryBatch: bridgeChannel('telemetry:batch'),
  // Fires when the UDP server (re)binds.
  onServerStatus: bridgeChannel('telemetry:serverStatus'),

  getServerInfo: () => ipcRenderer.invoke('telemetry:getServerInfo'),
  setPort: (port) => ipcRenderer.invoke('telemetry:setPort', port),
  getSnapshot: () => ipcRenderer.invoke('telemetry:getSnapshot'),

  // Bidirectional control: ask main to dispatch a UDP command datagram.
  sendCommand: (targetHost, targetPort, deviceId, command) =>
    ipcRenderer.invoke('control:sendCommand', { targetHost, targetPort, deviceId, command }),

  exportCsv: () => ipcRenderer.invoke('logs:exportCsv'),
});
