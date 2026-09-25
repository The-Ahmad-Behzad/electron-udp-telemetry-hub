# Architecture Diagram

This file preserves the text-based architecture diagram for screen readers, searchability, and text-based processing.

```
 3x simulated devices          Electron MAIN process            Electron RENDERER (React)
 (udp_simulator.js)                                              via contextBridge
┌──────────────────┐   UDP    ┌───────────────────────────┐  IPC  ┌───────────────────────┐
│ dgram client      │ ───────▶│ dgram server (dynamic port)│──────▶│ App.jsx                │
│ binary packets    │ 10Hz/dev│  - decode + validate       │batch  │  - buffered in refs     │
│ every 100ms       │         │  - per-device ring buffers │every  │  - committed to state   │
│ + anomalies       │         │  - throughput accounting   │100ms  │    every 500ms          │
└──────────────────┘         │  - batches pending packets  │       │  - DeviceCard charts    │
        ▲                    │                             │       │  - NetworkHealthPanel   │
        │ UDP command        │  UDP client (control)       │◀──────│  - ControlPanel (send)  │
        └────────────────────│  ipcMain.handle('control:*')│invoke │  - LogsPanel (CSV export)│
                              └───────────────────────────┘       └───────────────────────┘
```
