import React, { useState } from 'react';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';

function StatTile({ label, value, accent }) {
  return (
    <div className="rounded-lg border border-slate-800 bg-slate-900/50 p-4">
      <div className="text-xs uppercase tracking-wide text-slate-500">{label}</div>
      <div className={`mt-1 font-mono text-2xl ${accent || 'text-slate-100'}`}>{value}</div>
    </div>
  );
}

export default function NetworkHealthPanel({ stats, statsHistory, serverInfo, onPortChange }) {
  const [portInput, setPortInput] = useState('');
  const [portMsg, setPortMsg] = useState('');

  const malformedRatio = stats.validCount + stats.malformedCount > 0
    ? ((stats.malformedCount / (stats.validCount + stats.malformedCount)) * 100).toFixed(2)
    : '0.00';

  async function applyPort(e) {
    e.preventDefault();
    if (!portInput) return;
    const res = await onPortChange(Number(portInput));
    setPortMsg(res.ok ? `Server rebound on port ${res.port}` : `Failed: ${res.error}`);
  }

  return (
    <section className="space-y-3">
      <h2 className="text-sm font-medium uppercase tracking-wide text-slate-400">Network Health</h2>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatTile label="Packets / sec" value={stats.packetsPerSec} accent="text-sky-400" />
        <StatTile label="Throughput" value={`${stats.kbPerSec} KB/s`} accent="text-sky-400" />
        <StatTile label="Malformed rate" value={`${malformedRatio}%`} accent={Number(malformedRatio) > 2 ? 'text-rose-400' : 'text-slate-100'} />
        <StatTile label="Active devices" value={stats.deviceCount} />
      </div>

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
        <div className="rounded-lg border border-slate-800 bg-slate-900/50 p-4 lg:col-span-2">
          <div className="mb-2 text-xs uppercase tracking-wide text-slate-500">Packets/sec (last ~30s)</div>
          <div className="h-28">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={statsHistory} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
                <XAxis dataKey="t" tick={false} axisLine={{ stroke: '#1e293b' }} />
                <YAxis tick={{ fontSize: 10, fill: '#64748b' }} width={28} />
                <Tooltip
                  contentStyle={{ background: '#0f172a', border: '1px solid #1e293b', fontSize: 12 }}
                  labelFormatter={(t) => new Date(t).toLocaleTimeString()}
                />
                <Line type="monotone" dataKey="pps" stroke="#22d3ee" dot={false} strokeWidth={1.5} isAnimationActive={false} name="pkts/s" />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="rounded-lg border border-slate-800 bg-slate-900/50 p-4">
          <div className="mb-2 text-xs uppercase tracking-wide text-slate-500">UDP Server Config</div>
          <form onSubmit={applyPort} className="flex items-center gap-2">
            <input
              type="number"
              placeholder={String(serverInfo.port ?? 41234)}
              value={portInput}
              onChange={(e) => setPortInput(e.target.value)}
              className="w-28 rounded border border-slate-700 bg-slate-950 px-2 py-1 text-sm text-slate-200 outline-none focus:border-sky-500"
            />
            <button type="submit" className="rounded bg-sky-600 px-3 py-1 text-sm font-medium text-white hover:bg-sky-500">
              Rebind
            </button>
          </form>
          {portMsg && <p className="mt-2 text-xs text-slate-400">{portMsg}</p>}
          <p className="mt-3 text-xs text-slate-500">
            Valid: <span className="text-slate-300">{stats.validCount}</span> &middot; Malformed:{' '}
            <span className="text-rose-400">{stats.malformedCount}</span>
          </p>
        </div>
      </div>
    </section>
  );
}
