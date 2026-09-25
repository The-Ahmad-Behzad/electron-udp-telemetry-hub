'use strict';

module.exports = {
  // Port the Electron main-process UDP server listens on for telemetry ingest.
  TELEMETRY_PORT: Number(process.env.TELEMETRY_PORT) || 41234,
  // Host the telemetry server binds to.
  TELEMETRY_HOST: process.env.TELEMETRY_HOST || '127.0.0.1',
  // How often (ms) the main process flushes buffered packets to the renderer.
  // This is the single knob controlling the IPC-batching strategy: ingest can
  // run at any rate, but the renderer only ever receives updates at this cadence.
  IPC_FLUSH_INTERVAL_MS: 100,
  // Ring buffer depth per device, derived from retention window / sample rate.
  // Default retention: 5 minutes @ ~10 samples/sec/device = 3000 samples.
  RING_BUFFER_SIZE: 3000,
  // Rolling window (ms) used to compute packets/sec and KB/s throughput.
  THROUGHPUT_WINDOW_MS: 2000,
};
