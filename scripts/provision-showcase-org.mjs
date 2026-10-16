#!/usr/bin/env node
/**
 * Provision a showcase org (P2 / audit §F) with seeded-vs-real labeling.
 *
 * Creates a throwaway founder whose REAL org stays empty, then mints the
 * isolated demo org via POST /api/demo-company/isolated and verifies the
 * labeling both sides:
 *   SEEDED — the demo org carries settings.isDemo (every screen badges it)
 *   REAL   — the founder's own org is untouched and NOT flagged demo
 *
 * Usage:
 *   node scripts/provision-showcase-org.mjs --web-url https://<web> [--org-name NovaForge]
 *
 * Exit codes: 0 provisioned + verified · 1 failed (reason printed) ·
 * 2 unarmed (no --web-url / ORQ8_WEB_URL).
 *
 * Ops-only: the throwaway founder owns both orgs, so either can be removed
 * afterwards via the normal org-deletion flow.
 */

import { randomBytes } from "node:crypto";

const EXIT = { ok: 0, fail: 1, unarmed: 2 };

function arg(name, fallback = null) {
  const i = process.argv.indexOf(`--${name}`);
  if (i === -1) return process.env[name.toUpperCase().replace(/-/g, "_")] ?? fallback;
  const eq = process.argv[i]?.includes("=");
  if (eq) return process.argv[i].split("=").slice(1).join("=");
  return process.argv[i + 1] ?? fallback;
}

function fail(why) {
  console.error(`FAIL — ${why}`);
  process.exit(EXIT.fail);
}

const webUrl = (arg("web-url") ?? "").trim().replace(/\/+$/, "");
if (!webUrl) {
  console.error("UNARMED — no web URL. Pass --web-url https://<web-origin> (or ORQ8_WEB_URL).");
  process.exit(EXIT.unarmed);
}
let base;
try {
  base = new URL(webUrl);
  if (!/^https?:$/.test(base.protocol)) throw new Error("bad scheme");
} catch {
  fail(`--web-url is not a valid http(s) origin: \`${webUrl}\``);
}

const orgName = (arg("org-name") ?? "NovaForge").trim() || "NovaForge";
const stamp = new Date().toISOString().replace(/[:.]/g, "-").toLowerCase();
const email = `showcase-${stamp}-${randomBytes(3).toString("hex")}@example.com`;
const password = `showcase-${randomBytes(12).toString("hex")}`;

let cookie = "";
async function call(path, init = {}) {
  const res = await fetch(`${webUrl}${path}`, {
    ...init,
    headers: { "content-type": "application/json", ...(cookie ? { cookie } : {}), ...(init.headers ?? {}) },
    signal: AbortSignal.timeout(30_000),
    redirect: "manual",
  });
  const text = await res.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    /* keep text */
  }
  const setCookies = res.headers?.getSetCookie?.() ?? [];
  for (const h of setCookies) {
    const m = /(?:^|,\s*)orq8_session=([^;]+)/.exec(h);
    if (m) cookie = `orq8_session=${m[1]}`;
  }
  return { status: res.status, json, text: text.replace(/\s+/g, " ").slice(0, 200) };
}

// 1. Throwaway founder — the REAL org.
const reg = await call("/api/auth/register", {
  method: "POST",
  body: JSON.stringify({ email, password, org_name: orgName }),
}).catch((e) => fail(`register unreachable: ${e.message}`));
if (reg.status !== 200 || reg.json?.ok !== true) fail(`register refused (${reg.status}): ${reg.text}`);
if (!cookie) fail("register answered OK but set no session cookie");

// 2. Mint the isolated demo org (session moves into it).
const demo = await call("/api/demo-company/isolated", { method: "POST" }).catch((e) =>
  fail(`isolated demo unreachable: ${e.message}`),
);
if (demo.status !== 201 || demo.json?.data?.demo !== true)
  fail(`isolated demo refused (${demo.status}): ${demo.text}`);
const demoOrgId = demo.json.data.orgId;

// 3. Verify labeling both sides via /api/auth/me memberships.
const me = await call("/api/auth/me").catch((e) => fail(`me unreachable: ${e.message}`));
if (me.status !== 200) fail(`me refused (${me.status}): ${me.text}`);
const memberships = me.json?.data?.memberships ?? [];
const demoEntry = memberships.find((m) => m?.org?.id === demoOrgId);
const realEntry = memberships.find((m) => m?.org?.id !== demoOrgId);
if (!demoEntry) fail("demo org missing from memberships after provisioning");
if (demoEntry.org.isDemo !== true) fail("SEEDED labeling broken: demo org isDemo !== true");
if (realEntry && realEntry.org.isDemo === true) fail("REAL labeling broken: founder org flagged demo");
if (me.json?.data?.active_org_id !== demoOrgId) fail("session did not move into the demo org");

// 4. Verify the demo org actually has content to showcase.
const agents = await call("/api/agents").catch((e) => fail(`agents unreachable: ${e.message}`));
const agentCount = Array.isArray(agents.json?.data) ? agents.json.data.length : -1;
if (agentCount <= 0) fail(`demo org looks empty (agents: ${agentCount})`);

console.log("OK — showcase provisioned and labeling verified:");
console.log(`  SEEDED  ${demoEntry.org.name}  org=${demoOrgId}  agents=${agentCount}  badge=isDemo`);
console.log(
  `  REAL    ${realEntry?.org?.name ?? "(unknown)"}  org=${realEntry?.org?.id ?? "(unknown)"}  badge=none (untouched)`,
);
console.log(`  login   ${email}`);
process.exit(EXIT.ok);
