/**
 * Appends `items` to `arr` and trims from the front so it never exceeds
 * `max`. This is the renderer-side counterpart to shared/ringBuffer.js --
 * kept as a plain-array helper (not the class) because chart-visible
 * windows here are small (hundreds of points) and React/Recharts already
 * expects plain arrays, so there is no allocation win from a class-based
 * circular buffer on this side of the boundary.
 */
export function capPush(arr, items, max) {
  const next = items.length >= max ? items.slice(-max) : arr.concat(items);
  return next.length > max ? next.slice(next.length - max) : next;
}
