import React, { useState } from 'react';

export default function LogsPanel({ malformedLog }) {
  const [exportResult, setExportResult] = useState(null);
  const [exporting, setExporting] = useState(false);

  async function handleExport() {
    setExporting(true);
    setExportResult(null);
    try {
      const res = await window.gatewayApi.exportCsv();
      setExportResult(res);
    } finally {
      setExporting(false);
    }
  }

  return (
    <div className="rounded-lg border border-slate-800 bg-slate-900/50 p-4">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-medium uppercase tracking-wide text-slate-400">Audit Log &middot; Malformed Packets</h2>
        <button
          onClick={handleExport}
          disabled={exporting}
          className="rounded bg-slate-700 px-3 py-1 text-xs font-medium text-white hover:bg-slate-600 disabled:opacity-50"
        >
          {exporting ? 'Exporting…' : 'Export full session CSV'}
        </button>
      </div>

      {exportResult && (
        <div className={`mb-3 rounded border p-2 text-xs ${exportResult.ok ? 'border-emerald-800 text-emerald-400' : 'border-rose-800 text-rose-400'}`}>
          {exportResult.ok ? `Wrote ${exportResult.rowCount} rows to ${exportResult.filePath}` : `Export failed: ${exportResult.error}`}
        </div>
      )}

      <div className="h-56 overflow-y-auto rounded border border-slate-800">
        {malformedLog.length === 0 ? (
          <div className="p-4 text-xs text-slate-500">No malformed packets observed yet.</div>
        ) : (
          <table className="w-full text-left text-xs">
            <thead className="sticky top-0 bg-slate-900 text-slate-500">
              <tr>
                <th className="px-2 py-1">Time</th>
                <th className="px-2 py-1">Reason</th>
                <th className="px-2 py-1">From</th>
              </tr>
            </thead>
            <tbody>
              {malformedLog
                .slice()
                .reverse()
                .map((e, i) => (
                  <tr key={i} className="border-t border-slate-800 text-slate-300">
                    <td className="px-2 py-1 font-mono">{new Date(e.at).toLocaleTimeString()}</td>
                    <td className="px-2 py-1 text-rose-400">{e.reason}</td>
                    <td className="px-2 py-1 font-mono">{e.from}</td>
                  </tr>
                ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
