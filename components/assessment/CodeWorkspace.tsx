"use client";

import { useState } from "react";
import { DEVELOPER_PRACTICE, type developerExerciseBrief } from "@/lib/assessment/developer-bank";
import type { CodeChecks } from "@/lib/assessment/code-checks";

type Brief = ReturnType<typeof developerExerciseBrief>;

export function TestResults({ result }: { result: CodeChecks }) {
  return <ul className="mt-2 space-y-1 text-sm" aria-label="Test results">
    {result.cases.map(({ label, outcome }) => <li key={label} className="flex flex-wrap justify-between gap-2">
      {label}<span className={outcome === "passed" ? "text-emerald-300" : "text-[#ffad89]"}>{outcome === "timed-out" ? "Timed out" : outcome === "passed" ? "Passed" : "Failed"}</span>
    </li>)}
  </ul>;
}

export function CodeWorkspace({ brief, files, onChange, savedResults }: {
  brief: Brief; files: Record<string, string>; onChange: (name: string, code: string) => void; savedResults?: CodeChecks | null;
}) {
  const [selected, setSelected] = useState(Object.keys(brief.files)[0]);
  const [run, setRun] = useState<{ files: string; result: CodeChecks }>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const version = JSON.stringify(files);

  async function test() {
    setBusy(true);
    setError("");
    setRun(undefined);
    try {
      const response = await fetch("/api/assessment/checks", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ exercise: brief.id, files }),
      });
      const outcome = await response.json();
      if (!response.ok) throw new Error(outcome.error);
      setRun({ files: version, result: outcome });
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "Could not run the example tests.");
    } finally {
      setBusy(false);
    }
  }

  return <div className="grid min-w-0 items-stretch gap-4 xl:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)]">
    <section className="flex min-w-0 flex-col rounded-xl border border-white/10 bg-[#101011] p-4" aria-label="Code editor">
      {Object.keys(brief.files).length > 1 && <div className="mb-3 flex flex-wrap gap-2" role="group" aria-label="Starter files">
        {Object.keys(brief.files).map((name) => <button key={name} type="button" aria-pressed={name === selected} onClick={() => setSelected(name)}
          className="min-h-10 rounded-lg border border-white/15 px-3 text-sm aria-pressed:border-[#ff955f] aria-pressed:text-[#ffad89]">{name}</button>)}
      </div>}
      <label className="flex flex-1 flex-col text-sm font-medium text-white/90">{selected}
        <textarea className="mt-2.5 min-h-[220px] w-full flex-1 resize-y rounded-xl border border-white/15 bg-black/50 p-3.5 font-mono text-sm leading-relaxed text-white focus-visible:outline-[#ff955f]"
          value={files[selected] ?? ""} onChange={(event) => { setError(""); onChange(selected, event.target.value); }} maxLength={12000}
          autoCapitalize="off" autoCorrect="off" spellCheck={false} />
      </label>
    </section>
    <section className="flex min-w-0 flex-col justify-between gap-4 rounded-xl border border-white/10 bg-[#101011] p-4" aria-label="Test panel">
      <div className="space-y-3">
        <h3 className="text-sm font-semibold text-white">Example tests</h3>
        <ul className="space-y-2.5 text-sm text-white/80">
          {brief.examples.map(({ label, input, expected }) => <li key={label} className="space-y-1">
            <span className="block text-xs font-medium text-white/70">{label}</span>
            <code className="block overflow-x-auto whitespace-pre-wrap break-words rounded-lg border border-white/5 bg-black/40 px-2.5 py-2 font-mono text-xs leading-relaxed text-white/90">{JSON.stringify(input)} → {expected}</code>
          </li>)}
        </ul>
      </div>
      <div className="space-y-2.5 pt-1">
        <button type="button" onClick={test} disabled={busy} className="min-h-11 w-full rounded-xl border border-[#ff955f] px-4 text-sm font-medium text-[#ffad89] transition-colors hover:bg-[#ff955f]/10 disabled:opacity-60">
          {busy ? "Running…" : "Run example tests"}
        </button>
        {busy && <p role="status" className="text-xs text-white/70">Running in the isolated test workspace.</p>}
        {error && <p role="alert" className="text-xs text-[#ffad89]">{error}</p>}
        {run?.files === version && <TestResults result={run.result} />}
        {savedResults && <details className="pt-1"><summary className="cursor-pointer text-xs text-white/75">Saved submission checks</summary><TestResults result={savedResults} /></details>}
      </div>
    </section>
  </div>;
}

export default function DeveloperPractice() {
  const [brief, setBrief] = useState(DEVELOPER_PRACTICE[0]);
  const [drafts, setDrafts] = useState<Record<string, Record<string, string>>>({});
  return <section className="space-y-4 rounded-2xl border border-white/10 p-5">
    <h2 className="text-xl font-semibold">Software Developer practice bank</h2>
    <div className="flex items-center gap-3 text-sm font-medium">
      <label htmlFor="practice-difficulty" className="shrink-0">Difficulty</label>
      <select id="practice-difficulty" value={brief.id} onChange={(event) => {
        const selected = DEVELOPER_PRACTICE.find((exercise) => exercise.id === event.target.value);
        if (selected) setBrief(selected);
      }} className="min-h-11 min-w-[148px] rounded-lg border border-white/15 bg-[#171717] py-2 pl-3.5 text-white">
        {DEVELOPER_PRACTICE.map((exercise) => <option key={exercise.id} value={exercise.id}>{exercise.difficulty}</option>)}
      </select>
    </div>
    <p className="text-white/80">{brief.brief}</p>
    <p className="text-sm text-white/70">Practice is unscored. Keep a copy of any code you want to revisit.</p>
    <CodeWorkspace key={brief.id} brief={brief} files={drafts[brief.id] ?? brief.files}
      onChange={(name, code) => setDrafts((previous) => ({ ...previous, [brief.id]: { ...(previous[brief.id] ?? brief.files), [name]: code } }))} />
  </section>;
}
