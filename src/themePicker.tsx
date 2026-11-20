import { useEffect, useState } from "react";
import { ACCENTS, MODES, readTheme, writeTheme, type ThemeChoice } from "./lib/theme";

const MODE_LABEL: Record<ThemeChoice["mode"], string> = { light: "Light", dark: "Dark", system: "System" };

export function ThemePicker({ email, compact = false }: { email?: string; compact?: boolean }) {
  const [choice, setChoice] = useState<ThemeChoice>(() => readTheme(email));
  useEffect(() => { setChoice(readTheme(email)); }, [email]);

  function update(next: ThemeChoice) {
    setChoice(next);
    writeTheme(next, email);
  }

  return (
    <div data-screen="theme">
      {!compact ? <h2 className="text-lg font-semibold">Appearance</h2> : <p className="text-xs font-semibold uppercase tracking-widest text-muted">Appearance</p>}
      {!compact ? <p className="mt-1 text-sm text-muted">Saved on this device for you. System follows the phone or laptop.</p> : null}
      <div className="seg mt-3" role="radiogroup" aria-label="Color mode">
        {MODES.map((mode) => (
          <button key={mode} type="button" role="radio" aria-checked={choice.mode === mode} aria-pressed={choice.mode === mode} onClick={() => update({ ...choice, mode })}>{MODE_LABEL[mode]}</button>
        ))}
      </div>
      <div className="mt-3 flex flex-wrap gap-2" role="radiogroup" aria-label="Accent">
        {ACCENTS.map((a) => (
          <button key={a.id} type="button" role="radio" aria-checked={choice.accent === a.id} aria-pressed={choice.accent === a.id} onClick={() => update({ ...choice, accent: a.id })} className="inline-flex items-center gap-2 rounded-full bg-soft px-3 py-1.5 text-sm hairline">
            <span className="h-4 w-4 shrink-0 rounded-full" style={{ background: a.color }} aria-hidden />
            {a.label}
          </button>
        ))}
      </div>
    </div>
  );
}

export function ThemeDialog({ email, onClose }: { email?: string; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-[80] grid place-items-end bg-black/40 p-4 sm:place-items-center" onClick={onClose}>
      <div className="card w-full max-w-md p-5" role="dialog" aria-label="Appearance" onClick={(e) => e.stopPropagation()}>
        <ThemePicker email={email} />
        <button type="button" className="mt-4 w-full rounded-full bg-blue py-2.5 text-sm font-semibold text-white" onClick={onClose}>Done</button>
      </div>
    </div>
  );
}
