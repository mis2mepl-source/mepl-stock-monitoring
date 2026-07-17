'use client';

import { useState, useTransition } from 'react';
import { toast } from 'sonner';
import { Upload, FileSpreadsheet, AlertCircle, CheckCircle2 } from 'lucide-react';
import { previewImport, commitImport, type PreviewResult, type CommitResult } from '@/lib/actions/import';

export default function ImportClient() {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<Extract<PreviewResult, { ok: true }> | null>(null);
  const [commitResult, setCommitResult] = useState<Extract<CommitResult, { ok: true }> | null>(null);
  const [isPreviewing, startPreview] = useTransition();
  const [isCommitting, startCommit] = useTransition();

  function onFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0] ?? null;
    setFile(f);
    setPreview(null);
    setCommitResult(null);
    if (f) doPreview(f);
  }

  function doPreview(f: File) {
    startPreview(async () => {
      const fd = new FormData();
      fd.append('file', f);
      const res = await previewImport(fd);
      if (res.ok) setPreview(res);
      else toast.error(res.error);
    });
  }

  function doCommit() {
    if (!file) return;
    if (!confirm('Commit this import? OPENING movements will be posted and stock balances updated. This cannot be undone.')) return;
    startCommit(async () => {
      const fd = new FormData();
      fd.append('file', file);
      const res = await commitImport(fd);
      if (res.ok) {
        setCommitResult(res);
        setPreview(null);
        setFile(null);
        toast.success(`Import committed. ${res.movementsPosted} movements posted.`);
      } else {
        toast.error(res.error);
      }
    });
  }

  return (
    <div className="space-y-4">
      {/* Upload */}
      <div className="rounded-lg border border-slate-200 bg-white p-5">
        <label className="flex flex-col items-center justify-center gap-2 border-2 border-dashed border-slate-300 rounded-md p-8 cursor-pointer hover:border-slate-400 hover:bg-slate-50">
          <Upload className="h-6 w-6 text-slate-400" />
          <span className="text-sm font-medium text-slate-700">
            {file ? file.name : 'Click to select an .xlsx file'}
          </span>
          <span className="text-xs text-slate-500">
            {file ? `${(file.size / 1024).toFixed(1)} KB` : 'Sheets required: MEPL 2 and ShaftStub'}
          </span>
          <input
            type="file"
            accept=".xlsx,.xls"
            onChange={onFileChange}
            className="hidden"
          />
        </label>
        {isPreviewing && <p className="text-sm text-slate-500 mt-3 text-center">Parsing…</p>}
      </div>

      {/* Commit success card */}
      {commitResult && (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4">
          <div className="flex gap-2 items-start">
            <CheckCircle2 className="h-5 w-5 text-emerald-600 flex-shrink-0 mt-0.5" />
            <div className="text-sm">
              <div className="font-semibold text-emerald-800">Import committed</div>
              <div className="text-emerald-700 mt-1">
                Batch <code className="bg-emerald-100 px-1 rounded text-xs">{commitResult.batchId.slice(0, 8)}</code>
                {' · '}
                {commitResult.skusUpserted} SKUs · {commitResult.locationsUpserted} locations ·{' '}
                {commitResult.movementsPosted} movements
                {commitResult.rejects > 0 && ` · ${commitResult.rejects} rejects logged`}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Preview */}
      {preview && (
        <>
          <div className="rounded-lg border border-slate-200 bg-white p-4">
            <h2 className="text-sm font-semibold mb-3">Summary</h2>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <Stat label="Valid rows (Sheet 1)" value={preview.sheet1Rows.length} />
              <Stat label="Unique SKUs" value={preview.uniqueSkus} />
              <Stat label="Unique locations" value={preview.uniqueLocations} />
              <Stat label="Rejects" value={preview.rejects.length} accent={preview.rejects.length ? 'amber' : undefined} />
            </div>
          </div>

          {preview.rejects.length > 0 && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-4">
              <div className="flex gap-2 items-center mb-2">
                <AlertCircle className="h-4 w-4 text-amber-700" />
                <h2 className="text-sm font-semibold text-amber-800">Rejects — will NOT be imported</h2>
              </div>
              <table className="w-full text-sm">
                <thead className="text-xs uppercase text-amber-700 text-left">
                  <tr><th className="py-1 pr-2">Sheet</th><th className="py-1 pr-2">Row</th><th className="py-1">Reason</th></tr>
                </thead>
                <tbody>
                  {preview.rejects.map((r, i) => (
                    <tr key={i} className="border-t border-amber-200/60">
                      <td className="py-1 pr-2 text-xs">{r.sheet}</td>
                      <td className="py-1 pr-2 font-mono text-xs">{r.rowNumber}</td>
                      <td className="py-1 text-amber-900">{r.reason}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <div className="rounded-lg border border-slate-200 bg-white p-4">
            <h2 className="text-sm font-semibold mb-3">Reconciliation (Sheet 1 sum vs Sheet 2 Total Nos)</h2>
            <div className="max-h-80 overflow-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 text-xs uppercase text-slate-500 text-left sticky top-0">
                  <tr>
                    <th className="px-2 py-1.5">Code</th>
                    <th className="px-2 py-1.5">Part</th>
                    <th className="px-2 py-1.5">Dims</th>
                    <th className="px-2 py-1.5 text-right">Sheet 2</th>
                    <th className="px-2 py-1.5 text-right">Sheet 1 sum</th>
                    <th className="px-2 py-1.5 text-right">Delta</th>
                    <th className="px-2 py-1.5">Note</th>
                  </tr>
                </thead>
                <tbody>
                  {preview.reconciliation.map((r, i) => (
                    <tr key={i} className="border-t border-slate-100">
                      <td className="px-2 py-1 font-mono text-xs">{r.code}</td>
                      <td className="px-2 py-1">{r.part}</td>
                      <td className="px-2 py-1 text-slate-500 text-xs">{r.dims}</td>
                      <td className="px-2 py-1 text-right tabular-nums">{r.totalNos.toLocaleString('en-IN')}</td>
                      <td className="px-2 py-1 text-right tabular-nums">{r.sheet1Sum.toLocaleString('en-IN')}</td>
                      <td className={`px-2 py-1 text-right tabular-nums ${r.delta === 0 ? 'text-emerald-700' : 'text-rose-700 font-semibold'}`}>
                        {r.delta === 0 ? '0' : (r.delta > 0 ? '+' : '') + r.delta.toLocaleString('en-IN')}
                      </td>
                      <td className="px-2 py-1 text-xs text-slate-500">{r.note}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="text-xs text-slate-500 mt-2">
              Deltas surface physical discrepancies — they don't block the import. Post ADJUSTMENT movements after the physical count.
            </p>
          </div>

          <div className="flex items-start gap-3 rounded-lg border border-rose-200 bg-rose-50 p-4">
            <AlertCircle className="h-5 w-5 text-rose-600 flex-shrink-0 mt-0.5" />
            <div className="text-sm text-rose-900 flex-1">
              <div className="font-semibold">Before committing</div>
              <ul className="list-disc pl-5 mt-1 space-y-0.5 text-rose-800">
                <li>OPENING movements ADD to existing stock — they don't replace it.</li>
                <li>For a physical recount, first zero-out existing balances via ADJUSTMENT/OUT movements, then import.</li>
                <li>Rejects need manual handling after the import — check the list above.</li>
              </ul>
            </div>
            <button
              onClick={doCommit}
              disabled={isCommitting}
              className="text-sm px-4 py-2 rounded-md bg-rose-600 text-white hover:bg-rose-700 disabled:opacity-50 flex-shrink-0"
            >
              {isCommitting ? 'Committing…' : `Commit ${preview.sheet1Rows.length} rows`}
            </button>
          </div>
        </>
      )}
    </div>
  );
}

function Stat({ label, value, accent }: { label: string; value: number; accent?: 'amber' }) {
  const tone = accent === 'amber' ? 'text-amber-800 bg-amber-50 border-amber-200' : 'text-slate-900 bg-white border-slate-200';
  return (
    <div className={`rounded-md border p-3 ${tone}`}>
      <div className="text-xs text-slate-500">{label}</div>
      <div className="text-xl font-semibold mt-0.5">{value.toLocaleString('en-IN')}</div>
    </div>
  );
}
