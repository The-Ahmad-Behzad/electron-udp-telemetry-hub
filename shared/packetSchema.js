/**
 * shared/packetSchema.js
 *
 * Binary wire format for high-frequency telemetry packets.
 *
 * WHY BINARY (vs JSON) for telemetry:
 *   JSON.parse/stringify on every packet at 10-300+ Hz allocates a new
 *   string + object graph per packet, which is the primary GC-pressure
 *   source under sustained UDP load. A fixed-width binary layout lets us
 *   read numeric fields directly out of the incoming Buffer with typed
 *   accessors (no intermediate string), and the fixed size lets us
 *   validate a packet's shape (and therefore flag malformed packets)
 *   before we even look at its contents.
 *
 * Control commands (reboot, ping, etc.) are NOT on this hot path -- they
 * are low-frequency, operator-triggered, and benefit far more from being
 * human-readable/loggable than from being lean. Those stay JSON and are
 * handled separately in electron/main.js.
 *
 * Layout (27 bytes total, all multi-byte fields big-endian):
 *   [0]      magic byte      uint8   0xA7 (protocol/version sentinel)
 *   [1..8]   deviceId        8 bytes ASCII, NUL-padded
 *   [9..16]  timestamp       double  epoch millis
 *   [17..20] temperature     float32 degrees C
 *   [21..24] cpuUsage        float32 percent (0-100)
 *   [25]     status          uint8   0=OK 1=WARN 2=CRITICAL 3=OFFLINE
 *   [26]     checksum        uint8   XOR of bytes [0..25]
 */

'use strict';

const MAGIC_BYTE = 0xA7;
const DEVICE_ID_BYTES = 8;

const OFFSET_MAGIC = 0;
const OFFSET_DEVICE_ID = 1;
const OFFSET_TIMESTAMP = OFFSET_DEVICE_ID + DEVICE_ID_BYTES; // 9
const OFFSET_TEMPERATURE = OFFSET_TIMESTAMP + 8; // 17
const OFFSET_CPU = OFFSET_TEMPERATURE + 4; // 21
const OFFSET_STATUS = OFFSET_CPU + 4; // 25
const OFFSET_CHECKSUM = OFFSET_STATUS + 1; // 26
const PACKET_SIZE = OFFSET_CHECKSUM + 1; // 27

const STATUS_CODES = { OK: 0, WARN: 1, CRITICAL: 2, OFFLINE: 3 };
const STATUS_NAMES = ['OK', 'WARN', 'CRITICAL', 'OFFLINE'];

function computeChecksum(buf) {
  let x = 0;
  for (let i = 0; i < OFFSET_CHECKSUM; i++) x ^= buf[i];
  return x;
}

/**
 * Encode a telemetry reading into a fixed-size Buffer.
 * @param {{deviceId:string, timestamp:number, temperature:number, cpuUsage:number, status:string}} reading
 * @returns {Buffer}
 */
function encodePacket(reading) {
  const buf = Buffer.alloc(PACKET_SIZE);
  buf.writeUInt8(MAGIC_BYTE, OFFSET_MAGIC);
  buf.write(String(reading.deviceId).slice(0, DEVICE_ID_BYTES), OFFSET_DEVICE_ID, DEVICE_ID_BYTES, 'ascii');
  buf.writeDoubleBE(reading.timestamp, OFFSET_TIMESTAMP);
  buf.writeFloatBE(reading.temperature, OFFSET_TEMPERATURE);
  buf.writeFloatBE(reading.cpuUsage, OFFSET_CPU);
  buf.writeUInt8(STATUS_CODES[reading.status] ?? STATUS_CODES.OK, OFFSET_STATUS);
  buf.writeUInt8(computeChecksum(buf), OFFSET_CHECKSUM);
  return buf;
}

/**
 * Decode + validate a raw UDP payload.
 * Never throws -- always returns a result object so the caller (the UDP
 * server's hot `message` handler) can branch on `.valid` without a
 * try/catch on every packet.
 * @param {Buffer} buf
 */
function decodePacket(buf) {
  if (!Buffer.isBuffer(buf) || buf.length !== PACKET_SIZE) {
    return { valid: false, reason: 'BAD_LENGTH', size: buf ? buf.length : 0 };
  }
  if (buf.readUInt8(OFFSET_MAGIC) !== MAGIC_BYTE) {
    return { valid: false, reason: 'BAD_MAGIC' };
  }
  const expected = computeChecksum(buf);
  const actual = buf.readUInt8(OFFSET_CHECKSUM);
  if (expected !== actual) {
    return { valid: false, reason: 'CHECKSUM_MISMATCH' };
  }

  const deviceId = buf.toString('ascii', OFFSET_DEVICE_ID, OFFSET_DEVICE_ID + DEVICE_ID_BYTES).replace(/\0+$/, '');
  const statusCode = buf.readUInt8(OFFSET_STATUS);

  return {
    valid: true,
    deviceId,
    timestamp: buf.readDoubleBE(OFFSET_TIMESTAMP),
    temperature: buf.readFloatBE(OFFSET_TEMPERATURE),
    cpuUsage: buf.readFloatBE(OFFSET_CPU),
    status: STATUS_NAMES[statusCode] || 'OK',
  };
}

module.exports = {
  PACKET_SIZE,
  MAGIC_BYTE,
  STATUS_CODES,
  STATUS_NAMES,
  encodePacket,
  decodePacket,
};
