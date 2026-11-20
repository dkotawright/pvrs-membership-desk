import { useEffect, useState } from "react";
import { useBackend, useGate, useToast } from "../appContext";
import { canDeleteVault, canFileVault } from "../lib/domain";
import { formByKey } from "../lib/forms";

interface Item { id: string; data: Record<string, unknown> }

export function VaultPage() {
  const backend = useBackend();
  const gate = useGate();
  const toast = useToast();
  const actor = gate.actor!;
  const [items, setItems] = useState<Item[]>([]);
  const [q, setQ] = useState("");
  const [showFiled, setShowFiled] = useState(false);
  const [open, setOpen] = useState<Item | null>(null);

  useEffect(() => backend.watch("vault", (docs) => {
    setItems(docs.map((d) => ({ id: d.id, data: d.data })).sort((a, b) => Number(b.data.uploadedAt || 0) - Number(a.data.uploadedAt || 0)));
  }), [backend]);

  const list = items.filter((x) => (showFiled || !x.data.filedAt) && (!q || `${x.data.appName} ${x.data.label} ${x.data.name}`.toLowerCase().includes(q.toLowerCase())));
  const groups = new Map<string, Item[]>();
  for (const x of list) {
    const id = String(x.data.appId || "");
    groups.set(id, [...(groups.get(id) || []), x]);
  }

  return (
    <div data-screen="vault" className="min-h-full bg-canvas">
      <header className="frost sticky top-0 z-20 flex items-center justify-between border-b border-black/5 px-5 py-3">
        <div className="flex items-center gap-3">
          <img src="/img/icon-192.png" alt="" className="h-10 w-10 rounded-xl" />
          <div>
            <div className="text-xs font-semibold uppercase tracking-widest text-muted">Confidential paperwork</div>
            <div className="font-semibold">Orientation paperwork</div>
          </div>
        </div>
        <button type="button" className="rounded-full px-3 py-1.5 text-sm hairline" onClick={() => backend.signOut()}>Sign out</button>
      </header>
      <main className="mx-auto max-w-3xl space-y-4 px-4 py-6">
        <p className="text-sm text-muted">Medical and Social Security documents. Open a file, then print if you need a paper copy.</p>
        <div className="flex gap-3">
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search by name or document" aria-label="Search" className="flex-1 rounded-full bg-white px-4 py-2 hairline" />
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={showFiled} onChange={(e) => setShowFiled(e.target.checked)} /> Show filed</label>
        </div>
        {!list.length ? <p className="card p-6 text-sm text-muted">{items.length ? "Nothing matches." : "Nothing yet. You’ll get an email when an applicant sends medical or Social Security paperwork."}</p> : [...groups.entries()].map(([id, rows]) => (
          <section key={id} className="card p-4">
            <h2 className="font-semibold">{String(rows[0].data.appName || "Applicant")}</h2>
            <ul className="mt-2 divide-y divide-black/5">
              {rows.map((x) => (
                <li key={x.id} className="flex flex-wrap items-center gap-2 py-3 text-sm">
                  <div className="min-w-0 flex-1">
                    <div className="font-medium">{String(x.data.name || "Document")}</div>
                    <div className="text-xs text-muted">{String(x.data.label || "Paperwork")} · {x.data.form ? "signed on their phone" : ""} {x.data.filedAt ? "· filed" : ""}</div>
                  </div>
                  <button type="button" className="rounded-full bg-blue px-3 py-1.5 text-white" onClick={() => setOpen(x)}>Open</button>
                  {canFileVault(actor) ? <button type="button" className="rounded-full px-3 py-1.5 hairline" onClick={async () => {
                    try { await backend.set("vault/" + x.id, { filedAt: x.data.filedAt ? null : Date.now() }, true); } catch { toast("Couldn't save. Try again."); }
                  }}>{x.data.filedAt ? "Filed" : "Mark filed"}</button> : null}
                  {canDeleteVault(actor) ? <button type="button" className="text-crimson" onClick={async () => {
                    if (!confirm("Delete this document for good?")) return;
                    try { if (x.data.path) await backend.removeFile(String(x.data.path)).catch(() => {}); await backend.del("vault/" + x.id); toast("Deleted"); } catch { toast("Couldn't delete."); }
                  }}>Delete</button> : null}
                </li>
              ))}
            </ul>
          </section>
        ))}
        {open ? (
          <div className="fixed inset-0 z-40 grid place-items-center bg-black/30 p-4" role="dialog">
            <div className="card max-h-[80vh] w-full max-w-lg overflow-auto p-6">
              <h3 className="text-xl font-semibold">{String(open.data.label || open.data.name)}</h3>
              {open.data.form && formByKey(String((open.data.form as { key?: string }).key || "")) ? (
                <pre className="mt-3 whitespace-pre-wrap text-sm">{JSON.stringify((open.data.form as { values?: unknown }).values || {}, null, 2)}</pre>
              ) : <p className="mt-3 text-sm text-muted">Stored securely. Opening the file uses your squad account.</p>}
              <div className="mt-4 flex gap-2">
                <button type="button" className="rounded-full px-4 py-2 hairline" onClick={() => setOpen(null)}>Close</button>
                {open.data.path ? <button type="button" className="rounded-full bg-blue px-4 py-2 text-white" onClick={async () => {
                  try { const url = await backend.url(String(open.data.path)); window.open(url, "_blank"); } catch { toast("Couldn't open that file."); }
                }}>Open file</button> : null}
              </div>
            </div>
          </div>
        ) : null}
      </main>
    </div>
  );
}
