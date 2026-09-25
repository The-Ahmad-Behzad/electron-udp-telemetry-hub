# Changelog

## 2026-09-26 — Initial build

- **Research/architecture pass**: identified the three core risks (GC
  pressure from packet parsing, main→renderer IPC bottleneck, React
  re-render storms) and settled the mitigation for each before writing
  code (batched binary ingest → ring buffers → interval-flushed IPC →
  ref-buffered/throttled React commits).
- **Decision (user-delegated to engineering judgment): binary wire
  format.** Chose a fixed 27-byte binary packet layout over JSON for the
  telemetry hot path specifically because the brief called out GC
  pressure from packet strings as a named risk to solve; binary avoids
  the per-packet string/object allocation entirely and the fixed size
  gives free structural validation. JSON was kept for control commands
  (low-frequency, benefits from readability over leanness).
- `shared/packetSchema.js`: binary codec, unit-verified via inline Node
  script (encode → decode round-trip, checksum-corruption detection,
  bad-length detection all confirmed).
- `shared/ringBuffer.js`: bounded circular buffer, used both server-side
  (per-device history + session log) and conceptually mirrored
  client-side (`src/lib/capArray.js`) for chart windows.
- `udp_simulator.js`: 3 simulated devices at 100ms, anomaly injection
  (spikes, dropouts, malformed/corrupted packets), plus a control-port
  listener added so the dashboard's outbound UDP control commands are
  actually observable end-to-end, not fire-and-forget.
  Verified live over real UDP sockets (127.0.0.1) in-sandbox: 147/147
  packets decoded valid over a 3s run at 50ms interval; a REBOOT control
  command sent through the same send/receive path used by
  `electron/main.js` was correctly received and logged.
- `electron/main.js`: dgram server with decode/validate/batch pipeline,
  dgram control client, `ipcMain.handle` surface for server info,
  port rebind, snapshot, CSV export. `contextIsolation`/`sandbox`
  enabled, `nodeIntegration` disabled.
- `electron/preload.js`: `contextBridge` surface (`window.gatewayApi`),
  including an unsubscribe-returning event bridge pattern to avoid
  listener buildup across renderer re-renders.
- `src/App.jsx` + components: ref-buffered IPC intake, 500ms throttled
  state commit, per-device charts (Recharts), network health panel with
  live port rebind, control panel, CSV-export audit log panel.
- Renderer build verified with `vite build` in-sandbox (834 modules,
  clean build, no errors) before packaging for delivery.
- Packaged as a zip for delivery since this session has no filesystem
  MCP connector with access to the user's local `E:\` drive (see chat
  for details) — user to unzip into `E:\electron-udp-gateway`.

## 2026-09-26 — Bug fix: malformed-packet log never populated

- **Symptom** (caught by user via screenshot): Network Health showed a
  live, growing malformed-packet count (e.g. 43), but the Audit Log panel
  always read "No malformed packets observed yet." Device charts looked
  fine, masking that they had the same underlying bug.
- **Root cause**: in `src/App.jsx`'s 500ms commit loop, `setMalformedLog`
  and `setDevices` were called with updater functions that read
  `pendingMalformed.current` / `pendingDevices.current`, and the very
  next line reset that same ref. React never invokes a functional
  `setState` updater synchronously -- it's deferred to the next render
  pass, which happens after the interval callback returns. So by the
  time the updater actually ran, the ref had already been reset, and the
  updater always saw empty data. `malformedLog` therefore never grew
  past its initial `[]`. `devices` had the identical bug but it was
  invisible because a one-time `getSnapshot()` call at mount pre-fills
  each device with up to 200 historical points, making the charts look
  populated/alive even though they'd likely been frozen since mount.
- **Fix**: capture each ref's contents into a local variable and reset
  the ref *before* calling `setState`, so the updater closes over the
  stable local value instead of `ref.current`. Applied to both the
  malformed-log path and the device-history path (using a fresh `Map`
  instead of `.clear()` for the latter, so the captured reference isn't
  mutated out from under the pending updater).
- Re-verified with a clean `vite build` after the fix.

### Open items for a follow-up pass
- Compiled Tailwind (PostCSS) build to replace the CDN script.
- Incremental/streaming CSV export for very long sessions.
- Optional: switch control-command payloads to signed/authenticated
  packets if this ever leaves a trusted LAN.
