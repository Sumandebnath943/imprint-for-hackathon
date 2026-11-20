import { createServer } from "node:http";
import { spawn } from "node:child_process";
import { timingSafeEqual } from "node:crypto";
import { DEVELOPER_EVIDENCE_VERSION, findDeveloperExercise } from "../lib/assessment/developer-bank.ts";
import { createCodeCheckScript } from "../lib/assessment/code-check-script.ts";

/**
 * Lightweight zero-secret code-check runner designed for a dedicated Google
 * Cloud Run service (gVisor-sandboxed, scales to zero on the Always Free tier).
 *
 * Authentication modes:
 *  - Shared bearer token (default): set IMPRINT_RUNNER_TOKEN (>= 24 chars).
 *  - Cloud Run IAM OIDC: deploy with --no-allow-unauthenticated and set
 *    IMPRINT_RUNNER_AUTH=gcp-oidc (optionally also set IMPRINT_RUNNER_TOKEN
 *    to enforce a secondary X-Imprint-Runner-Token check).
 */
const authMode = process.env.IMPRINT_RUNNER_AUTH?.trim().toLowerCase() ?? "token";
const token = process.env.IMPRINT_RUNNER_TOKEN?.trim() ?? "";
const port = Number(process.env.PORT ?? process.env.IMPRINT_RUNNER_PORT ?? 8080);
const host = process.env.IMPRINT_RUNNER_BIND ?? "0.0.0.0";

if (authMode !== "gcp-oidc" && token.length < 24) {
  throw new Error("Set IMPRINT_RUNNER_TOKEN (>= 24 chars) or IMPRINT_RUNNER_AUTH=gcp-oidc.");
}

const expectedBearer = token.length >= 24 ? Buffer.from(`Bearer ${token}`) : null;
const expectedHeaderToken = token.length >= 24 ? Buffer.from(token) : null;

function isAuthorized(request) {
  if (authMode === "gcp-oidc") {
    // Cloud Run IAM validates the Google-signed OIDC Bearer token before the
    // request reaches this container. Optionally verify a secondary shared header.
    if (!expectedHeaderToken) return true;
    const provided = Buffer.from(String(request.headers["x-imprint-runner-token"] ?? ""));
    return provided.length === expectedHeaderToken.length && timingSafeEqual(provided, expectedHeaderToken);
  }
  if (!expectedBearer) return false;
  const header = Buffer.from(request.headers.authorization ?? "");
  return header.length === expectedBearer.length && timingSafeEqual(header, expectedBearer);
}

async function evaluate(exercise, files) {
  const child = spawn(
    process.execPath,
    ["--input-type=commonjs", "--max-old-space-size=64", "-"],
    {
      stdio: ["pipe", "pipe", "ignore"],
      env: {}, // Strip all environment variables from the untrusted child process.
      windowsHide: true,
    }
  );
  child.stdin.on("error", () => {});
  child.stdin.end(createCodeCheckScript(exercise.cases, files));

  let output = "";
  let exceeded = false;
  const terminate = () => {
    try {
      child.kill("SIGKILL");
    } catch {
      // Child already exited.
    }
  };
  child.stdout.setEncoding("utf8").on("data", (chunk) => {
    if (output.length + chunk.length > 4096) {
      exceeded = true;
      terminate();
      return;
    }
    output += chunk;
  });

  const deadline = setTimeout(terminate, 5000);
  try {
    const status = await new Promise((resolve, reject) => {
      child.once("error", reject);
      child.once("close", resolve);
    });
    if (status !== 0 || exceeded) throw new Error("Sandbox test command failed");
    const cases = JSON.parse(output);
    const valid =
      Array.isArray(cases) &&
      cases.length === exercise.cases.length &&
      cases.every(
        (item, index) =>
          item?.label === exercise.cases[index].label &&
          ["passed", "failed", "timed-out"].includes(item.outcome)
      );
    if (!valid) throw new Error("Sandbox returned invalid results");
    return { version: DEVELOPER_EVIDENCE_VERSION, exercise: exercise.id, cases };
  } finally {
    clearTimeout(deadline);
  }
}

let active = 0;
createServer({ requestTimeout: 15000, headersTimeout: 5000 }, async (request, response) => {
  const send = (status, data) => {
    response.writeHead(status, { "Content-Type": "application/json", "Cache-Control": "no-store" });
    response.end(JSON.stringify(data));
  };

  if (request.method === "GET" && request.url === "/healthz") {
    send(200, { ok: true });
    return;
  }

  if (request.method !== "POST" || request.url !== "/checks" || !isAuthorized(request)) {
    send(404, { error: "Unavailable" });
    return;
  }

  if (active >= 2) {
    send(503, { error: "Runner busy" });
    return;
  }

  active++;
  try {
    let size = 0;
    const chunks = [];
    for await (const chunk of request) {
      size += chunk.length;
      if (size > 40000) {
        send(413, { error: "Submission too large" });
        return;
      }
      chunks.push(chunk);
    }
    const parsed = JSON.parse(Buffer.concat(chunks).toString());
    const exercise = findDeveloperExercise(parsed?.exercise);
    const files = parsed?.files;
    if (
      !exercise ||
      !files ||
      typeof files !== "object" ||
      Object.keys(files).length !== Object.keys(exercise.files).length ||
      !Object.keys(exercise.files).every(
        (name) => typeof files[name] === "string" && files[name].length <= 12000
      )
    ) {
      send(400, { error: "Invalid exercise or starter files" });
      return;
    }
    send(200, await evaluate(exercise, files));
  } catch {
    send(503, { error: "Test runner unavailable" });
  } finally {
    active--;
  }
}).listen(port, host, () => console.log(`Cloud Run code-check runner listening on ${host}:${port}`));
