import { useEffect, useRef, useState } from "react";

export function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="field"><span>{label}</span>{children}</label>;
}

export function ScoreInput({ value, disabled, onChange }: { value: number; disabled: boolean; onChange: (value: number) => void }) {
  return <div className="scoreInput" aria-label={`${value} 分（满分 5 分）`}>
    {[1, 2, 3, 4, 5].map(score => <button type="button" key={score} disabled={disabled} className={score <= value ? "on" : ""} onClick={() => onChange(score)} aria-label={`${score} 分`}>●</button>)}
  </div>;
}

export function NumericInput({ value, onChange, disabled, min }: { value: number; onChange: (value: number) => void; disabled?: boolean; min?: number }) {
  const ref = useRef<HTMLInputElement>(null);
  const [draft, setDraft] = useState(String(value));
  useEffect(() => { if (document.activeElement !== ref.current) setDraft(String(value)); }, [value]);
  return <input ref={ref} type="number" min={min} disabled={disabled} value={draft} onChange={event => {
    const next = event.target.value;
    setDraft(next);
    if (next !== "" && Number.isFinite(Number(next))) onChange(Number(next));
  }} onBlur={() => {
    if (draft === "") { setDraft("0"); onChange(0); }
    else setDraft(String(value));
  }}/>;
}

export function UnitInput({ value, unit, onChange, disabled }: { value: number; unit: string; onChange: (n: number) => void; disabled: boolean }) {
  return <div className="unitInput"><NumericInput disabled={disabled} value={value} onChange={onChange}/><b>{unit}</b></div>;
}

