// Confidential paperwork: what the paperwork account (PAPERWORK_EMAIL) sees. Medical and Social Security files only.
// Nobody else can open these, including the owner; the rules enforce it.
import { db, storage, collection, doc, onSnapshot, updateDoc, deleteDoc, ref, getDownloadURL, deleteObject } from "./fb.js";
import { $, esc, toast, openModal, closeModal } from "./shared.js";
import { formByKey, formDocHTML, printDoc } from "./forms.js";
import { PAPERWORK_EMAIL } from "./config.js";

const when = ms => new Date(ms).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
const kb = n => n > 1048576 ? (n / 1048576).toFixed(1) + " MB" : Math.max(1, Math.round((n || 0) / 1024)) + " KB";

export function startVault(email){
  const V = { items: [], q: "", showFiled: false, loaded: false };
  const root = $("#vault");
  root.innerHTML = `<div class="wrap">
    <section class="card glass"><div class="plate"><img alt="Potsdam Volunteer Rescue Squad, est. 1955" src="/img/logo.png"></div>
      <div class="ptop"><div><div class="eyebrow">Confidential paperwork</div><div class="hello">Orientation paperwork</div>
      <div class="info">Medical and Social Security documents from applicants. Only ${esc(PAPERWORK_EMAIL)} can open them. Open a file, then press ⌘P to print.</div></div>
      <button class="btn small" type="button" data-signout>Sign out</button></div></section>
    <section class="card glass"><div class="vbar"><input id="vQ" type="search" placeholder="Search by name or document…" aria-label="Search">
      <label class="vfiled"><input type="checkbox" id="vFiled"> Show filed</label></div><div id="vList"></div></section>
  </div>`;

  const render = () => {
    const el = $("#vList"); if (!el) return;
    if (!V.loaded) { el.innerHTML = `<p class="info">Loading…</p>`; return; }
    const q = V.q.trim().toLowerCase();
    const list = V.items.filter(x => (V.showFiled || !x.filedAt) && (!q || `${x.appName} ${x.label} ${x.name}`.toLowerCase().includes(q)));
    const groups = new Map();
    for (const x of list) { if (!groups.has(x.appId)) groups.set(x.appId, { name: x.appName || "Applicant", items: [] }); groups.get(x.appId).items.push(x); }
    const filed = V.items.filter(x => x.filedAt).length;
    el.innerHTML = !list.length
      ? `<p class="info">${V.items.length ? (q ? "Nothing matches that search." : `Everything is filed.${filed ? " Check Show filed to see them." : ""}`) : "Nothing yet. You'll get an email when an applicant sends medical or Social Security paperwork."}</p>`
      : [...groups.values()].map(g => `<div class="vgroup"><h2>${esc(g.name)}</h2>${g.items.map(x => `<div class="doc">
          <div class="dt"><button class="filelink" type="button" data-vopen="${esc(x.id)}">${esc(x.name)}</button>
            <small>${esc(x.label || "Paperwork")} · ${esc(when(x.uploadedAt))} · ${x.from === "staff" ? "added by PVRS staff" : "from the applicant"} · ${x.form ? "signed on their phone" : kb(x.size)}${x.filedAt ? ` · filed ${esc(when(x.filedAt))}` : ""}</small></div>
          <button class="btn small" type="button" data-vopen="${esc(x.id)}">Open</button>
          <button class="btn small ${x.filedAt ? "" : "primary"}" type="button" data-vfile="${esc(x.id)}">${x.filedAt ? "Filed ✓" : "Mark filed"}</button>
          <button class="copy" type="button" data-vdel="${esc(x.id)}" aria-label="Delete ${esc(x.name)}">Delete</button></div>`).join("")}</div>`).join("");
  };
  render();

  onSnapshot(collection(db, "vault"), s => {
    V.items = s.docs.map(d => ({ id: d.id, ...d.data() })).sort((a, b) => (b.uploadedAt || 0) - (a.uploadedAt || 0));
    V.loaded = true; render();
  }, e => { console.error(e); $("#vList").innerHTML = `<p class="info">Couldn't load the paperwork. Reload the page.</p>`; });

  $("#vQ").addEventListener("input", e => { V.q = e.target.value; render(); });
  $("#vFiled").addEventListener("change", e => { V.showFiled = e.target.checked; render(); });
  root.addEventListener("click", async e => {
    const t = e.target, find = id => V.items.find(x => x.id === id);
    const op = t.closest("[data-vopen]");
    if (op) {
      const x = find(op.dataset.vopen); if (!x) return;
      if (x.form) {   // a form signed on the phone (no file): show it, with Print
        const f = formByKey(x.form.key); if (!f) return toast("Couldn't open that form.");
        const M = openModal(`${formDocHTML(f, x.form)}<div class="acts"><button class="btn" type="button" data-x>Close</button><button class="btn primary" type="button" id="vPrint">Print or save as PDF</button></div>`, true);
        M.onclick = ev => { if (ev.target.closest("[data-x]")) return closeModal(); if (ev.target.closest("#vPrint")) { closeModal(); printDoc(formDocHTML(f, x.form)); } };
        return;
      }
      const w = window.open("", "_blank");
      try { const url = await getDownloadURL(ref(storage, x.path)); if (w) w.location = url; else location.href = url; }
      catch (err) { if (w) w.close(); console.error(err); toast("Couldn't open that file."); }
      return;
    }
    const fb = t.closest("[data-vfile]");
    if (fb) { const x = find(fb.dataset.vfile); if (!x) return;
      try { await updateDoc(doc(db, "vault", x.id), { filedAt: x.filedAt ? null : Date.now() }); } catch (err) { console.error(err); toast("Couldn't save. Try again."); }
      return; }
    const del = t.closest("[data-vdel]");
    if (del) {
      if (del.dataset.confirm !== "1") { del.dataset.confirm = "1"; del.textContent = "Delete for good?"; return; }
      const x = find(del.dataset.vdel); if (!x) return;
      try { if (x.path) await deleteObject(ref(storage, x.path)).catch(() => {}); await deleteDoc(doc(db, "vault", x.id)); toast("Deleted"); }
      catch (err) { console.error(err); toast("Couldn't delete. Try again."); }
    }
  });
}
