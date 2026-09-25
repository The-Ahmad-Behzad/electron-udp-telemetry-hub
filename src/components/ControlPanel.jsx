import React, { useState } from 'react';

const COMMANDS = ['PING', 'REBOOT', 'RESET_STATS'];

export default function ControlPanel({ deviceIds }) {
  const [targetHost, setTargetHost] = useState('127.0.0.1');
  const [targetPort, setTargetPort] = useState('41235');
  const [deviceId, setDeviceId] = useState('');
  const [command, setCommand] = useState(COMMANDS[0]);
  const [result, setResult] = useState(null);
  const [sending, setSending] = useState(false);

  async function handleSend(e) {
    e.preventDefault();
    setSending(true);
    setResult(null);
    try {
      const res = await window.gatewayApi.sendCommand(targetHost, Number(targetPort), deviceId || null, command);
      setResult(res);
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="rounded-lg border border-slate-800 bg-slate-900/50 p-4">
      <h2 className="mb-3 text-sm font-medium uppercase tracking-wide text-slate-400">Device Control</h2>
      <p className="mb-3 text-xs text-slate-500">
        Dispatches a UDP command datagram from the main process to the target host/port. Point this at your own
        listener (or the simulator's control port) to see it arrive.
      </p>

      <form onSubmit={handleSend} className="grid grid-cols-2 gap-3">
        <label className="col-span-1 flex flex-col gap-1 text-xs text-slate-400">
          Target host
          <input
            value={targetHost}
            onChange={(e) => setTargetHost(e.target.value)}
            className="rounded border border-slate-700 bg-slate-950 px-2 py-1 text-sm text-slate-200 outline-none focus:border-sky-500"
          />
        </label>
        <label className="col-span-1 flex flex-col gap-1 text-xs text-slate-400">
          Target port
          <input
            type="number"
            value={targetPort}
            onChange={(e) => setTargetPort(e.target.value)}
            className="rounded border border-slate-700 bg-slate-950 px-2 py-1 text-sm text-slate-200 outline-none focus:border-sky-500"
          />
        </label>
        <label className="col-span-1 flex flex-col gap-1 text-xs text-slate-400">
          Device (optional)
          <select
            value={deviceId}
            onChange={(e) => setDeviceId(e.target.value)}
            className="rounded border border-slate-700 bg-slate-950 px-2 py-1 text-sm text-slate-200 outline-none focus:border-sky-500"
          >
            <option value="">(broadcast / none)</option>
            {deviceIds.map((id) => (
              <option key={id} value={id}>
                {id}
              </option>
            ))}
          </select>
        </label>
        <label className="col-span-1 flex flex-col gap-1 text-xs text-slate-400">
          Command
          <select
            value={command}
            onChange={(e) => setCommand(e.target.value)}
            className="rounded border border-slate-700 bg-slate-950 px-2 py-1 text-sm text-slate-200 outline-none focus:border-sky-500"
          >
            {COMMANDS.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </label>

        <button
          type="submit"
          disabled={sending}
          className="col-span-2 mt-1 rounded bg-rose-600 px-3 py-2 text-sm font-medium text-white hover:bg-rose-500 disabled:opacity-50"
        >
          {sending ? 'Dispatching…' : `Send ${command}`}
        </button>
      </form>

      {result && (
        <div className={`mt-3 rounded border p-2 text-xs ${result.ok ? 'border-emerald-800 text-emerald-400' : 'border-rose-800 text-rose-400'}`}>
          {result.ok ? `Sent at ${new Date(result.sentAt).toLocaleTimeString()} — ${result.payload}` : `Error: ${result.error}`}
        </div>
      )}
    </div>
  );
}
