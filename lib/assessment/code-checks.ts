import "server-only";
import { z } from "zod";
import { DEVELOPER_EVIDENCE_VERSION, findDeveloperExercise } from "./developer-bank";

const checkResults = z.object({
  version: z.literal(DEVELOPER_EVIDENCE_VERSION), exercise: z.string(),
  cases: z.array(z.object({ label: z.string(), outcome: z.enum(["passed", "failed", "timed-out"]) })).min(1).max(12),
});
export type CodeChecks = z.infer<typeof checkResults>;

type RunnerConfig = {
  origin: string;
  token: string;
  useGcpOidc: boolean;
};

function externalRunner(): RunnerConfig | null {
  const origin = process.env.IMPRINT_RUNNER_ORIGIN?.trim().replace(/\/+$/, "") ?? "";
  if (!/^(?:https:\/\/[^/]+|http:\/\/127\.0\.0\.1:\d{1,5})$/.test(origin)) return null;

  const useGcpOidc = process.env.IMPRINT_RUNNER_AUTH?.trim().toLowerCase() === "gcp-oidc" && origin.startsWith("https://");
  const token = process.env.IMPRINT_RUNNER_TOKEN?.trim() ?? "";

  if (useGcpOidc || token.length >= 24) {
    return { origin, token, useGcpOidc };
  }
  return null;
}

export function isCodeRunnerConfigured() {
  return Boolean(externalRunner());
}

async function fetchGcpIdentityToken(audience: string): Promise<string> {
  const url = `http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/identity?audience=${encodeURIComponent(audience)}`;
  const response = await fetch(url, {
    headers: { "Metadata-Flavor": "Google" },
    cache: "no-store",
    signal: AbortSignal.timeout(3000),
  });
  if (!response.ok) throw new Error("Cloud Run identity token unavailable");
  return (await response.text()).trim();
}

export async function runCodeChecks(exerciseId: string, files: Record<string, string>): Promise<CodeChecks> {
  const exercise = findDeveloperExercise(exerciseId);
  if (!exercise || Object.keys(files).length !== Object.keys(exercise.files).length ||
      Object.keys(exercise.files).some((name) => typeof files[name] !== "string" ||
        !files[name].trim() || files[name].length > 12000)) throw new Error("Invalid starter files");

  const runner = externalRunner();
  if (!runner) throw new Error("Test runner unavailable");

  const payload = await runExternalCheck(runner, exercise.id, files);
  const results = checkResults.parse(payload);
  if (results.exercise !== exercise.id || results.cases.length !== exercise.cases.length ||
      !results.cases.every(({ label }, index) => label === exercise.cases[index].label)) throw new Error("Unrecognized test evidence");
  return results;
}

async function runExternalCheck(runner: RunnerConfig, exercise: string, files: Record<string, string>) {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (runner.useGcpOidc) {
    const idToken = await fetchGcpIdentityToken(runner.origin);
    headers.Authorization = `Bearer ${idToken}`;
    if (runner.token.length >= 24) {
      headers["X-Imprint-Runner-Token"] = runner.token;
    }
  } else {
    headers.Authorization = `Bearer ${runner.token}`;
  }

  const response = await fetch(`${runner.origin}/checks`, {
    method: "POST", redirect: "error", cache: "no-store", signal: AbortSignal.timeout(10000),
    headers,
    body: JSON.stringify({ exercise, files }),
  });
  if (!response.ok) throw new Error("Test runner unavailable");
  return response.json();
}
