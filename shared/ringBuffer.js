/**
 * shared/ringBuffer.js
 *
 * Fixed-capacity circular buffer. Used on both sides of the IPC boundary
 * (main process for the authoritative per-device history / CSV export,
 * renderer for the chart-visible window) so that neither side's memory
 * grows unbounded under continuous high-frequency ingest -- the #1 leak
 * pattern in naive "just push() forever" telemetry dashboards.
 *
 * Plain JS, no Node-specific APIs, so it works unmodified in the
 * renderer (Vite/browser context) and the main process (CJS/Node).
 */

'use strict';

class RingBuffer {
  /** @param {number} capacity */
  constructor(capacity) {
    this.capacity = capacity;
    this.buf = new Array(capacity);
    this.head = 0; // next write index
    this.size = 0; // number of valid entries
  }

  push(item) {
    this.buf[this.head] = item;
    this.head = (this.head + 1) % this.capacity;
    if (this.size < this.capacity) this.size += 1;
  }

  /** Returns entries oldest -> newest as a plain array (for charting/export). */
  toArray() {
    if (this.size < this.capacity) return this.buf.slice(0, this.size);
    return this.buf.slice(this.head).concat(this.buf.slice(0, this.head));
  }

  get length() {
    return this.size;
  }
}

module.exports = { RingBuffer };
