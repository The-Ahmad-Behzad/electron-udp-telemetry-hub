import React, { useMemo } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

const STATUS_STYLES = {
  OK: 'bg-emerald-500/15 text-emerald-400 ring-emerald-500/30',
  WARN: 'bg-amber-500/15 text-amber-400 ring-amber-500/30',
  CRITICAL: 'bg-rose-500/15 text-rose-400 ring-rose-500/30 animate-pulse',
  OFFLINE: 'bg-slate-500/15 text-slate-400 ring-slate-500/30',
};

const STALE_MS = 3000;

export default function DeviceCard({ deviceId, data }) {
  const { points = [], latest } = data || {};

  const chartData = useMemo(
    () => points.map((p) => ({ t: p.timestamp, temperature: Number(p.temperature.toFixed(1)), cpuUsage: Number(p.cpuUsage.toFixed(1)) })),
    [points]
  );

  const isStale = latest ? Date.now() - latest.timestamp > STALE_MS : true;
  const effectiveStatus = isStale ? 'OFFLINE' : latest?.status || 'OFFLINE';

  return (
    <div className="rounded-lg border border-slate-800 bg-slate-900/50 p-4">
      <div className="mb-2 flex items-center justify-between">
        <span className="font-mono text-sm font-medium text-slate-200">{deviceId}</span>
        <span className={`rounded-full px-2 py-0.5 text-xs font-medium ring-1 ${STATUS_STYLES[effectiveStatus]}`}>
          {effectiveStatus}
        </span>
      </div>

      <div className="mb-3 grid grid-cols-2 gap-2 text-sm">
        <div>
          <div className="text-slate-500">Temperature</div>
          <div className="font-mono text-lg text-slate-100">{latest ? `${latest.temperature.toFixed(1)}°C` : '—'}</div>
        </div>
        <div>
          <div className="text-slate-500">CPU</div>
          <div className="font-mono text-lg text-slate-100">{latest ? `${latest.cpuUsage.toFixed(1)}%` : '—'}</div>
        </div>
      </div>

      <div className="h-32">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={chartData} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
            <CartesianGrid stroke="#1e293b" strokeDasharray="3 3" />
            <XAxis dataKey="t" tick={false} axisLine={{ stroke: '#1e293b' }} />
            <YAxis yAxisId="temp" tick={{ fontSize: 10, fill: '#64748b' }} width={28} />
            <YAxis yAxisId="cpu" orientation="right" domain={[0, 100]} tick={{ fontSize: 10, fill: '#64748b' }} width={28} />
            <Tooltip
              contentStyle={{ background: '#0f172a', border: '1px solid #1e293b', fontSize: 12 }}
              labelFormatter={(t) => new Date(t).toLocaleTimeString()}
            />
            <Line yAxisId="temp" type="monotone" dataKey="temperature" stroke="#38bdf8" dot={false} strokeWidth={1.5} isAnimationActive={false} name="Temp (°C)" />
            <Line yAxisId="cpu" type="monotone" dataKey="cpuUsage" stroke="#fb923c" dot={false} strokeWidth={1.5} isAnimationActive={false} name="CPU (%)" />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
