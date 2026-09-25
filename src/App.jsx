import React, { useEffect, useRef, useState, useCallback } from 'react';
import DeviceCard from './components/DeviceCard.jsx';
import NetworkHealthPanel from './components/NetworkHealthPanel.jsx';
import ControlPanel from './components/ControlPanel.jsx';
import LogsPanel from './components/LogsPanel.jsx';
import { capPush } from './lib/capArray.js';

const CHART_WINDOW = 150; // points kept per device for charting
const MALFORMED_LOG_MAX = 200;
const COMMIT_INTERVAL_MS = 500; // renderer render cadence, decoupled from the 100ms IPC flush

export default function App() {
  const [devices, setDevices] = useState({}); // { [deviceId]: { points: [], latest } }
  const [malformedLog, setMalformedLog] = useState([]);
  const [stats, setStats] = useState({ packetsPerSec: 0, kbPerSec: 0, validCount: 0, malformedCount: 0, deviceCount: 0 });
  const [serverInfo, setServerInfo] = useState({ port: null, host: null, listening: false });
  const [statsHistory, setStatsHistory] = useState([]); // packets/sec over time, for the throughput chart

  // Data arrives via IPC as fast as every 100ms. We do NOT setState directly
  // in the listener -- that would tie React's render rate to the IPC flush
  // rate. Instead we buffer into refs and commit to state on a slower,
  // fixed interval (COMMIT_INTERVAL_MS) below. This is the renderer-side
  // half of the IPC-bottleneck mitigation described in the project README.
  const pendingDevices = useRef(new Map());
  const pendingMalformed = useRef([]);
  const latestStats = useRef(stats);

  useEffect(() => {
    let unsubBatch = () => {};
    let unsubStatus = () => {};

    if (window.gatewayApi) {
      window.gatewayApi.getServerInfo().then((info) => setServerInfo((s) => ({ ...s, ...info, listening: true })));
      window.gatewayApi.getSnapshot().then(({ devices: snap }) => {
        const initial = {};
        for (const [id, points] of Object.entries(snap)) {
          const tail = points.slice(-CHART_WINDOW);
          initial[id] = { points: tail, latest: tail[tail.length - 1] || null };
        }
        setDevices(initial);
      });

      unsubBatch = window.gatewayApi.onTelemetryBatch((batch) => {
        for (const item of batch.items) {
          if (item.kind === 'reading') {
            const arr = pendingDevices.current.get(item.deviceId) || [];
            arr.push(item);
            pendingDevices.current.set(item.deviceId, arr);
          } else if (item.kind === 'malformed') {
            pendingMalformed.current.push(item);
          }
        }
        latestStats.current = batch.stats;
      });

      unsubStatus = window.gatewayApi.onServerStatus((info) => {
        setServerInfo((s) => ({ ...s, ...info }));
      });
    }

    return () => {
      unsubBatch();
      unsubStatus();
    };
  }, []);

  // The throttled commit: drains whatever accumulated in the refs into
  // React state at a fixed, human-perceptible cadence.
  //
  // IMPORTANT: setState updater functions are never invoked synchronously --
  // React queues them and calls them during the next render pass, which
  // happens AFTER this whole interval callback returns. So we must capture
  // each ref's contents into a plain local variable and reset the ref
  // BEFORE calling setState, then have the updater close over that local
  // (stable) value -- never over `ref.current` itself, since by the time
  // the updater actually runs, `.current` will already point at whatever
  // we reset it to below.
  useEffect(() => {
    const id = setInterval(() => {
      if (pendingDevices.current.size > 0) {
        const newDeviceData = pendingDevices.current;
        pendingDevices.current = new Map(); // fresh Map -- do NOT .clear() the captured one
        setDevices((prev) => {
          const next = { ...prev };
          for (const [deviceId, newPoints] of newDeviceData.entries()) {
            const existing = next[deviceId]?.points || [];
            const points = capPush(existing, newPoints, CHART_WINDOW);
            next[deviceId] = { points, latest: newPoints[newPoints.length - 1] };
          }
          return next;
        });
      }

      if (pendingMalformed.current.length > 0) {
        const newMalformed = pendingMalformed.current;
        pendingMalformed.current = [];
        setMalformedLog((prev) => capPush(prev, newMalformed, MALFORMED_LOG_MAX));
      }

      const statsSnapshot = latestStats.current;
      setStats(statsSnapshot);
      setStatsHistory((prev) => capPush(prev, [{ t: Date.now(), pps: statsSnapshot.packetsPerSec }], 60));
    }, COMMIT_INTERVAL_MS);

    return () => clearInterval(id);
  }, []);

  const handlePortChange = useCallback(async (port) => {
    const res = await window.gatewayApi.setPort(port);
    if (res.ok) setServerInfo((s) => ({ ...s, port: res.port }));
    return res;
  }, []);

  const deviceIds = Object.keys(devices).sort();

  return (
    <div className="min-h-screen bg-[#0b0f14] p-6 space-y-6">
      <header className="flex items-center justify-between border-b border-slate-800 pb-4">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-white">Enterprise IoT Telemetry Gateway</h1>
          <p className="text-sm text-slate-400">Live UDP ingest &middot; Control Dashboard</p>
        </div>
        <div className="flex items-center gap-2 text-sm">
          <span className={`h-2.5 w-2.5 rounded-full ${serverInfo.listening ? 'bg-emerald-400' : 'bg-slate-600'}`} />
          <span className="text-slate-300">
            {serverInfo.listening ? `Listening on ${serverInfo.host}:${serverInfo.port}` : 'Server offline'}
          </span>
        </div>
      </header>

      <NetworkHealthPanel stats={stats} statsHistory={statsHistory} serverInfo={serverInfo} onPortChange={handlePortChange} />

      <section>
        <h2 className="mb-3 text-sm font-medium uppercase tracking-wide text-slate-400">Devices ({deviceIds.length})</h2>
        {deviceIds.length === 0 ? (
          <div className="rounded-lg border border-dashed border-slate-800 p-8 text-center text-slate-500">
            No telemetry yet. Start <code className="text-slate-400">udp_simulator.js</code> to see live devices here.
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
            {deviceIds.map((id) => (
              <DeviceCard key={id} deviceId={id} data={devices[id]} />
            ))}
          </div>
        )}
      </section>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <ControlPanel deviceIds={deviceIds} />
        <LogsPanel malformedLog={malformedLog} />
      </div>
    </div>
  );
}
