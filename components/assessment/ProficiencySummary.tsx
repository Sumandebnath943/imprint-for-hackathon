import Link from "next/link";
import LocalDate from "@/components/shared/LocalDate";
import { signedPoints, type AssessmentSummary } from "@/lib/assessment/comparison";

export default function ProficiencySummary({ summary }: { summary?: AssessmentSummary | null }) {
  return <div>
    <h2 className="text-xl font-semibold">Current proficiency</h2>
    <p className="mt-2 text-3xl font-semibold text-[#ff9c77]">{summary?.current ? `${summary.current.score}/100` : "—"}</p>
    {summary?.current ? <p className="mt-1 text-sm text-white/70"><LocalDate value={summary.current.scored_at} /></p> : <>
      <p className="mt-1 text-sm text-white/70">{summary?.nextAction ?? "Select a profession to see your assessment options."}</p>
      <Link className="mt-2 inline-block text-sm text-[#ffad89] underline" href={summary ? "/dashboard/calibration" : "/dashboard/profile"}>
        {summary ? "Open Calibration" : "Open Profile"}
      </Link>
    </>}
    {summary?.current && <dl className="mt-4 grid items-start gap-4 border-t border-white/10 pt-3.5 sm:grid-cols-2">
      <div>
        <dt className="text-xs text-white/65">Original Imprint</dt>
        <dd className="mt-1 text-sm font-semibold text-white">{summary.original ? `${summary.original.score}/100` : "—"}</dd>
      </div>
      <div>
        <dt className="text-xs text-white/65">Change from baseline</dt>
        <dd className="mt-1 text-sm font-semibold text-white">
          {summary.difference === null ? (
            <span>— {summary.comparison}</span>
          ) : (
            <>
              <span className="block">{signedPoints(summary.difference)} points</span>
              <span className="block text-xs font-normal text-white/65">{summary.comparison}</span>
            </>
          )}
        </dd>
      </div>
    </dl>}
  </div>;
}
