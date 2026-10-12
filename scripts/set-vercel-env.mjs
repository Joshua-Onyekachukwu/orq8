#!/usr/bin/env node
/**
 * Point the Vercel project's API-facing env vars at a live API origin.
 *
 * WHY A SCRIPT AND A WORKFLOW
 * The web project's `API_URL` is the one lever that decides whether the
 * deployed product can reach its API, and it lives ONLY in Vercel's project
 * settings — no file in this repository can reach it. When it pointed at the
 * deleted Railway application, every data read in production failed while the
 * jobs canary (a GitHub secret of the same name) and the release gate (an
 * unset `PRODUCTION_API_URL`) both had nothing to say. There is no personal
 * Vercel token in this workspace (docs/82 §known gaps), but CI already holds
 * a working `VERCEL_TOKEN` — the same secret `vercel-deploy.yml` verifies
 * with — so the settings change is made from a dispatch-only workflow rather
 * than from a token pasted into a chat.
 *
 * WHAT IT DOES (idempotent, prints every change, never prints secrets)
 *   1. GET  /v9/projects/:id/env — what the project actually has today.
 *   2. For every key in API_KEYS that exists: PATCH its value to the given
 *      origin, keeping its target environments untouched.
 *   3. If `API_URL` does not exist at all, create it for production+preview —
 *      the web proxy reads it server-side, so preview should not silently
 *      point somewhere else either.
 *   4. FAIL (exit 1) if `API_URL` could not be set, so a workflow cannot go
 *      green having changed nothing.
 *
 * Environment:
 *   VERCEL_TOKEN   (required) the CI-held Vercel token
 *   PROJECT_ID     (required) the Vercel project id
 *   API_URL_VALUE  (required) the live API origin, https, no trailing slash
 *
 * Usage:
 *   VERCEL_TOKEN=… PROJECT_ID=… API_URL_VALUE=https://api.example.com \
 *     node scripts/set-vercel-env.mjs
 */

const TOKEN = process.env.VERCEL_TOKEN ?? "";
const PROJECT_ID = process.env.PROJECT_ID ?? "";
const VALUE = (process.env.API_URL_VALUE ?? "").trim().replace(/\/+$/, "");

/** The env keys the web app reads to find its API. `API_URL` is the proxy's. */
const API_KEYS = ["API_URL", "NEXT_PUBLIC_API_URL"];

function die(message) {
  console.error(`set-vercel-env: ${message}`);
  process.exit(1);
}

if (!TOKEN) die("VERCEL_TOKEN is not set (this script runs inside the set-vercel-env workflow).");
if (!PROJECT_ID) die("PROJECT_ID is not set.");
if (!/^https:\/\/[^/\s]+$/.test(VALUE)) {
  die(`API_URL_VALUE must be an https origin with no path or trailing slash (got \`${process.env.API_URL_VALUE ?? ""}\`).`);
}

const api = async (method, path, body) => {
  const res = await fetch(`https://api.vercel.com${path}`, {
    method,
    headers: {
      authorization: `Bearer ${TOKEN}`,
      "content-type": "application/json",
    },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(30_000),
  });
  let json = null;
  try {
    json = await res.json();
  } catch {
    /* non-JSON kept out of the way; status decides below */
  }
  return { status: res.status, json };
};

const listed = await api("GET", `/v9/projects/${PROJECT_ID}/env`);
if (listed.status !== 200) {
  die(`could not list the project's env vars (HTTP ${listed.status}: ${JSON.stringify(listed.json)?.slice(0, 300)}). If 401/403, the VERCEL_TOKEN secret lacks this project.`);
}
const envs = listed.json?.envs ?? [];
console.log(`set-vercel-env: ${envs.length} env vars on project ${PROJECT_ID}`);

let apiUrlSet = false;
for (const key of API_KEYS) {
  const existing = envs.filter((e) => e.key === key);
  if (existing.length === 0) {
    if (key !== "API_URL") {
      console.log(`  ${key}: not present — leaving it absent (the web app falls back to the proxy path)`);
      continue;
    }
    const created = await api("POST", `/v9/projects/${PROJECT_ID}/env`, {
      key,
      value: VALUE,
      target: ["production", "preview"],
    });
    if (created.status !== 200 && created.status !== 201) {
      die(`creating ${key} failed (HTTP ${created.status}: ${JSON.stringify(created.json)?.slice(0, 300)}).`);
    }
    console.log(`  ${key}: CREATED → ${VALUE} (production, preview)`);
    apiUrlSet = true;
    continue;
  }
  for (const env of existing) {
    if (env.value === VALUE) {
      console.log(`  ${key} [${(env.target ?? []).join(", ")}]: already ${VALUE} — nothing to do`);
      if (key === "API_URL") apiUrlSet = true;
      continue;
    }
    const patched = await api("PATCH", `/v9/projects/${PROJECT_ID}/env/${env.id}`, {
      value: VALUE,
      target: env.target,
    });
    if (patched.status !== 200) {
      die(`patching ${key} failed (HTTP ${patched.status}: ${JSON.stringify(patched.json)?.slice(0, 300)}).`);
    }
    console.log(`  ${key} [${(env.target ?? []).join(", ")}]: ${env.value ?? "(unset)"} → ${VALUE}`);
    if (key === "API_URL") apiUrlSet = true;
  }
}

if (!apiUrlSet) die("API_URL was not set on the project — refusing to report success.");
console.log("set-vercel-env: done — the next deployment builds with the new API origin.");
