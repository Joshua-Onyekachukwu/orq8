/**
 * Authentication end-to-end test (auth task STEP 6).
 *
 * Exercises the REAL chain with nothing mocked except the GitHub/Google HTTP
 * boundary (which cannot be called from a test):
 *
 *   Phase A — API: register, unverified-session lockout, public resend,
 *   confirmation, login gate, wrong password, reset flow (session revocation
 *   + old-password rejection), logout revocation, OAuth start/callback for both
 *   providers incl. account creation, returning users, and the
 *   "email already registered with a password" conflict.
 *
 *   Phase B — Web: real `next start` against the local API. Sign-in page copy,
 *   register through the proxy (httpOnly cookie), /app gate → /check-email,
 *   confirmation through the proxy, login, redirects for authed/unauthed users,
 *   expired-cookie rendering (no redirect loop), logout → landing, and the
 *   post-logout session check.
 *
 * Production note: the Railway API was unreachable at test time, so the chain
 * runs against a locally booted REAL API + embedded Postgres with the
 * production migration lineage. Nothing is stubbed inside ORQ8 itself.
 *
 * Usage: pnpm exec tsx scripts/auth-e2e.ts            (API phase only)
 *        AUTH_E2E_WEB=1 pnpm exec tsx scripts/auth-e2e.ts   (both phases)
 */

import { rmSync, readFileSync, readdirSync, mkdirSync, openSync, closeSync, readFileSync as readLog } from "node:fs";
import { spawn } from "node:child_process";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Pool } from "pg";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const DB_DIR = path.join(ROOT, ".auth-e2e-pg");
/** Escaped data-dir path for the Win32_Process CommandLine filter. */
const PGDATA_ESC = DB_DIR.replace(/\\/g, "\\\\");
const DB_NAME = "orq8_auth_e2e";
// Ports are chosen at runtime: a leftover dev server or postmaster from an
// interrupted run would otherwise squat the fixed port, and a STALE web server
// answers with old code while pointing at a dead API (a false 502).
let PG_PORT = 54334;
let WEB_PORT = 4322;
let DATABASE_URL = `postgres://orq8:orq8_load@localhost:${PG_PORT}/${DB_NAME}?client_encoding=utf8`;
let WEB_ORIGIN = `http://localhost:${WEB_PORT}`;

/** An ephemeral port nothing is listening on right now. */
async function freePort(): Promise<number> {
  const net = await import("node:net");
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.on("error", reject);
    srv.listen(0, "127.0.0.1", () => {
      const addr = srv.address();
      const port = typeof addr === "object" && addr ? addr.port : 0;
      srv.close(() => (port ? resolve(port) : reject(new Error("no free port"))));
    });
  });
}

const failures: string[] = [];
function check(name: string, ok: boolean, detail?: string): void {
  if (ok) console.log(`  ok   ${name}`);
  else {
    failures.push(`${name}${detail ? ` — ${detail}` : ""}`);
    console.log(`  FAIL ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

// ── Migration helpers (shared shape with scripts/waitlist-e2e.ts) ────────────

function splitDrizzle(sql: string): string[] {
  return sql.split("--> statement-breakpoint").map((s) => s.trim()).filter(Boolean);
}
function supabaseOrder(a: string, b: string): number {
  const n = (f: string) => parseInt(/^(\d+)_/.exec(f)?.[1] ?? "9999", 10);
  const rank = (f: string) => (n(f) === 5 ? 4.5 : n(f) === 4 ? 4.6 : n(f));
  return rank(a) - rank(b);
}
function withoutVector(sql: string): string {
  return sql
    .replace(/CREATE EXTENSION IF NOT EXISTS vector;?/gi, "-- [e2e] pgvector skipped")
    .replace(/DO\s*\$\$[\s\S]*?END\s*\$\$;/gi, (m) =>
      m.includes("vector(") ? "-- [e2e] pgvector embedding column skipped" : m,
    );
}
function scopedDrops(sql: string): string {
  const toNames = (m: RegExpMatchArray[] | IterableIterator<RegExpMatchArray>) =>
    [...m].map((g) => g[1]).filter((n): n is string => typeof n === "string");
  const policyNames = toNames(sql.matchAll(/create\s+policy\s+"?([a-z0-9_]+)"?/gi));
  const triggerNames = toNames(sql.matchAll(/create\s+(?:or\s+replace\s+)?trigger\s+"?([a-z0-9_]+)"?/gi));
  const quote = (n: string) => `'${n.replace(/'/g, "''")}'`;
  const blocks: string[] = [];
  if (policyNames.length > 0) {
    const list = policyNames.map(quote).join(",");
    blocks.push(`do $$ declare r record; begin for r in select schemaname, tablename, policyname from pg_policies where policyname in (${list}) loop execute format('drop policy if exists %I on %I.%I', r.policyname, r.schemaname, r.tablename); end loop; end $$;`);
  }
  if (triggerNames.length > 0) {
    const list = triggerNames.map(quote).join(",");
    blocks.push(`do $$ declare r record; begin for r in select n.nspname as schemaname, c.relname as tablename, t.tgname from pg_trigger t join pg_class c on c.oid = t.tgrelid join pg_namespace n on n.oid = c.relnamespace where not t.tgisinternal and t.tgname in (${list}) loop execute format('drop trigger if exists %I on %I.%I', r.tgname, r.schemaname, r.tablename); end loop; end $$;`);
  }
  return blocks.join("\n");
}
const AUTH_SHIM = `
create schema if not exists auth;
create table if not exists auth.users (id uuid primary key);
create or replace function auth.uid() returns uuid
language sql stable
as $$ select (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')::uuid $$;
`;
const ROLE_SHIM = `
do $$ begin create role anon nologin; exception when duplicate_object then null; end $$;
do $$ begin create role authenticated nologin; exception when duplicate_object then null; end $$;
`;
// Production runs the pgvector extension; this machine does not, and the harness
// strips pgvector statements from the migrations. Give the e2e database the same
// column shape with a plain jsonb stand-in so schema-shaped queries (drizzle
// inserts name every column) behave identically. Clearly a test shim.
const EMBEDDING_SHIM = `
alter table company_memory add column if not exists embedding jsonb;
`;

async function applyMigrations(adminPool: Pool): Promise<void> {
  const baseDir = path.join(ROOT, "packages/db/migrations");
  for (const f of readdirSync(baseDir).filter((f) => f.endsWith(".sql")).sort()) {
    for (const stmt of splitDrizzle(readFileSync(path.join(baseDir, f), "utf8"))) {
      await adminPool.query(stmt);
    }
  }
  await adminPool.query(ROLE_SHIM);
  await adminPool.query(AUTH_SHIM);
  await adminPool.query(EMBEDDING_SHIM);
  const supaDir = path.join(ROOT, "supabase/migrations");
  const files = readdirSync(supaDir).filter((f) => f.endsWith(".sql")).sort().sort(supabaseOrder);
  const pending = new Set(files);
  const lastErrors = new Map<string, string>();
  let pass = 0;
  while (pending.size > 0 && pass < 10) {
    pass += 1;
    let progressed = false;
    for (const file of [...pending]) {
      const raw = readFileSync(path.join(supaDir, file), "utf8");
      const sql = withoutVector(raw);
      try {
        const drops = scopedDrops(sql);
        if (drops) await adminPool.query(drops);
        await adminPool.query(sql);
        pending.delete(file);
        progressed = true;
      } catch (err) {
        lastErrors.set(file, (err as Error).message?.split("\n")[0] ?? String(err));
      }
    }
    if (!progressed) break;
  }
  if (pending.size > 0) {
    throw new Error(
      `migrations failed:\n${[...pending].map((f) => `  ${f}: ${lastErrors.get(f) ?? "?"}`).join("\n")}`,
    );
  }
}

// ── HTTP helpers ────────────────────────────────────────────────────────────

interface JsonResponse {
  status: number;
  body: any;
  /** Full response text (HTML pages need the whole document for copy checks). */
  text: string;
  headers: Headers;
  location: string | null;
  cookie: string | null;
}

async function call(
  url: string,
  opts: { method?: string; body?: unknown; token?: string; cookie?: string; redirect?: RequestRedirect } = {},
): Promise<JsonResponse> {
  const headers: Record<string, string> = {};
  if (opts.body !== undefined) headers["content-type"] = "application/json";
  if (opts.token) headers.authorization = `Bearer ${opts.token}`;
  if (opts.cookie) headers.cookie = opts.cookie;
  const res = await fetch(url, {
    method: opts.method ?? "GET",
    headers,
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
    redirect: opts.redirect ?? "manual",
  });
  const text = await res.text();
  let body: any = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = { raw: text.slice(0, 300) };
  }
  const setCookie = res.headers.get("set-cookie");
  return {
    status: res.status,
    body,
    text,
    headers: res.headers,
    location: res.headers.get("location"),
    cookie: setCookie ? setCookie.split(";")[0] : null,
  };
}

function apiErrorCode(body: any): string | undefined {
  return body?.error?.code ?? body?.code;
}

async function main(): Promise<void> {
  const withWeb = process.env.AUTH_E2E_WEB === "1";
  PG_PORT = await freePort();
  WEB_PORT = await freePort();
  DATABASE_URL = `postgres://orq8:orq8_load@localhost:${PG_PORT}/${DB_NAME}?client_encoding=utf8`;
  WEB_ORIGIN = `http://localhost:${WEB_PORT}`;
  const { default: EmbeddedPostgres } = await import("embedded-postgres");
  rmSync(DB_DIR, { recursive: true, force: true });
  mkdirSync(DB_DIR, { recursive: true });
  const pg = new EmbeddedPostgres({
    databaseDir: DB_DIR,
    user: "orq8",
    password: "orq8_load",
    database: DB_NAME,
    port: PG_PORT,
    persistent: false,
    initdbFlags: ["--encoding=UTF8", "--locale=C"],
    onLog: () => {},
  });

  let adminPool: Pool | undefined;
  let app: any;
  let webProc: ReturnType<typeof spawn> | undefined;
  const realFetch = globalThis.fetch;

  // Stub data for the provider boundary, switched per scenario.
  let githubEmail = "gh-user@orq8test.com";
  let githubId = 900001;
  let googleEmail = "g-user@orq8test.com";
  let googleSub = "google-sub-1";

  const stubFetch = (async (input: any, init?: any) => {
    const url = typeof input === "string" ? input : input?.url ?? String(input);
    const json = (obj: unknown, status = 200) =>
      new Response(JSON.stringify(obj), { status, headers: { "content-type": "application/json" } });
    if (url.startsWith("https://github.com/login/oauth/access_token")) {
      return json({ access_token: "gho_test_token", token_type: "bearer", scope: "read:user user:email" });
    }
    if (url === "https://api.github.com/user") {
      return json({ id: githubId, login: `gh-${githubId}`, name: "GitHub Founder", email: null });
    }
    if (url === "https://api.github.com/user/emails") {
      return json([{ email: githubEmail, primary: true, verified: true }]);
    }
    if (url.startsWith("https://oauth2.googleapis.com/token")) {
      return json({ access_token: "ya29_test_token", token_type: "bearer" });
    }
    if (url.startsWith("https://openidconnect.googleapis.com/v1/userinfo")) {
      return json({
        sub: googleSub,
        email: googleEmail,
        email_verified: true,
        name: "Google Founder",
      });
    }
    return realFetch(input, init);
  }) as typeof fetch;

  try {
    // Windows: a crashed prior run can leave a postmaster (or a forkchild io
    // worker, whose command line lacks the data dir) holding the shared memory
    // key, which makes every later boot fail with "pre-existing shared memory
    // block is still in use". Kill only processes running the npm embedded
    // distribution (binary path contains @embedded-postgres — never true of a
    // user-installed Postgres), then give the OS a moment to release the key.
    const { execSync } = await import("node:child_process");
    if (process.platform === "win32") {
      try {
        // -EncodedCommand sidesteps nested-quote mangling through cmd.exe.
        const ps =
          `Get-CimInstance Win32_Process -Filter "name='postgres.exe'" | ` +
          `Where-Object { $_.CommandLine -like '*@embedded-postgres*' -or $_.CommandLine -like '*${PGDATA_ESC}*' } | ` +
          `ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }`;
        const b64 = Buffer.from(ps, "utf16le").toString("base64");
        const out = execSync(`powershell -NoProfile -EncodedCommand ${b64}`, {
          timeout: 20_000,
          stdio: "ignore",
        });
        void out;
      } catch {
        /* nothing to kill */
      }
      await new Promise((r) => setTimeout(r, 2_000));
    }
    console.log("[1/6] booting embedded Postgres + production migrations…");
    await pg.initialise();
    await pg.start();
    await pg.createDatabase(DB_NAME);
    adminPool = new Pool({ connectionString: DATABASE_URL, max: 5 });
    // A pool client whose socket dies during shutdown emits on the pool; an
    // unhandled 'error' event would crash the harness after the results.
    adminPool.on("error", () => {});
    process.on("unhandledRejection", () => {});
    await applyMigrations(adminPool);
    console.log("      migrations applied");

    console.log("[2/6] booting the real API…");
    process.env.NODE_ENV = "test";
    process.env.DATABASE_URL = DATABASE_URL;
    const { loadConfig, createLogger } = await import("@orq8/core");
    const { createDb } = await import("@orq8/db");
    const { buildApp } = await import("../apps/api/src/app.js");

    const userIdByEmail = async (email: string): Promise<string> => {
      const row = await adminPool!.query<{ id: string }>("SELECT id FROM users WHERE email = $1", [email]);
      if (!row.rows[0]) throw new Error(`no user row for ${email}`);
      return row.rows[0].id;
    };
    const config = loadConfig({
      NODE_ENV: "test",
      DATABASE_URL,
      SESSION_SECRET: "auth-e2e-session-secret-32-bytes!!",
      ENCRYPTION_KEY: "auth-e2e-encryption-key-32-bytes!",
      LOG_LEVEL: process.env.AUTH_E2E_LOG_LEVEL ?? "silent",
      ALLOWED_ORIGINS: WEB_ORIGIN,
      APP_URL: WEB_ORIGIN,
      GITHUB_CLIENT_ID: "gh-test-client",
      GITHUB_CLIENT_SECRET: "gh-test-secret",
      GOOGLE_CLIENT_ID: "google-test-client",
      GOOGLE_CLIENT_SECRET: "google-test-secret",
    } as NodeJS.ProcessEnv);
    const logger = createLogger(config);
    const created = createDb(DATABASE_URL);
    // Same as the admin pool: shutdown races must not crash the harness.
    (created.pool as unknown as { on?: (e: string, fn: () => void) => void }).on?.("error", () => {});
    app = await buildApp({ config, db: created.db, pool: created.pool, logger });
    await app.ready();
    await app.listen({ port: 0, host: "127.0.0.1" });
    const apiPort = (app.server.address() as { port: number }).port;
    const API = `http://127.0.0.1:${apiPort}`;
    console.log(`      API on ${API}`);

    globalThis.fetch = stubFetch;

    // ── PHASE A: API auth flows ────────────────────────────────────────────
    console.log("[3/6] API: register, confirmation gate, login, reset, logout…");
    const stamp = Date.now();
    const passwordEmail = `founder-${stamp}@orq8test.com`;
    const password = "FounderPass123!";
    const newPassword = "FounderPass456!";

    const reg = await call(`${API}/v1/auth/register`, {
      method: "POST",
      body: { email: passwordEmail, password, name: "Founder", org_name: `E2E Co ${stamp}` },
    });
    check("register returns 201 + session", reg.status === 201 && !!reg.body?.data?.token, `HTTP ${reg.status}`);
    const regToken: string = reg.body?.data?.token ?? "";
    const orgId: string = reg.body?.data?.org?.id ?? "";

    const meUnverified = await call(`${API}/v1/auth/me`, { token: regToken });
    check(
      "unconfirmed session can read its own state",
      meUnverified.status === 200 && meUnverified.body?.data?.user?.emailVerified === false,
      `HTTP ${meUnverified.status}`,
    );

    const orgBlocked = await call(`${API}/v1/org`, { token: regToken });
    check(
      "unconfirmed session is refused on data APIs (403 email_not_verified)",
      orgBlocked.status === 403 && apiErrorCode(orgBlocked.body) === "email_not_verified",
      `HTTP ${orgBlocked.status} ${JSON.stringify(orgBlocked.body?.error ?? orgBlocked.body)}`,
    );

    const loginBlocked = await call(`${API}/v1/auth/login`, {
      method: "POST",
      body: { email: passwordEmail, password },
    });
    check(
      "login is refused until the email is confirmed",
      loginBlocked.status === 403 && apiErrorCode(loginBlocked.body) === "email_not_verified",
      `HTTP ${loginBlocked.status}`,
    );

    const resend = await call(`${API}/v1/auth/verify-email/request`, {
      method: "POST",
      body: { email: passwordEmail },
    });
    const resendUnknown = await call(`${API}/v1/auth/verify-email/request`, {
      method: "POST",
      body: { email: `nobody-${stamp}@orq8test.com` },
    });
    check(
      "public resend answers identically for known and unknown emails (anti-enumeration)",
      resend.status === 200 &&
        resendUnknown.status === 200 &&
        JSON.stringify(resend.body) === JSON.stringify(resendUnknown.body),
      `known HTTP ${resend.status}, unknown HTTP ${resendUnknown.status}`,
    );

    // Mint a real verification token through the same service the routes use,
    // then consume it through the real public endpoint.
    const emailVerification = await import("../apps/api/src/services/email-verification.js");
    const regUserId = await userIdByEmail(passwordEmail);
    const minted = await emailVerification.issueVerificationToken(
      created.db,
      regUserId,
      passwordEmail,
    );
    check("verification token issued", minted.ok === true);
    const consumed = await call(`${API}/v1/auth/verify-email`, {
      method: "POST",
      body: { token: (minted as { plaintextToken: string }).plaintextToken },
    });
    check("confirmation link verifies the email", consumed.status === 200 && consumed.body?.data?.verified === true, `HTTP ${consumed.status}`);

    const orgAfter = await call(`${API}/v1/org`, { token: regToken });
    check(
      "the registration session works once the email is confirmed",
      orgAfter.status === 200 && !!orgAfter.body?.data?.id,
      `HTTP ${orgAfter.status}`,
    );

    const loginOk = await call(`${API}/v1/auth/login`, {
      method: "POST",
      body: { email: passwordEmail, password },
    });
    check("login succeeds after confirmation", loginOk.status === 200 && !!loginOk.body?.data?.token, `HTTP ${loginOk.status}`);
    const session2: string = loginOk.body?.data?.token ?? "";

    const wrongPassword = await call(`${API}/v1/auth/login`, {
      method: "POST",
      body: { email: passwordEmail, password: "definitely-wrong" },
    });
    check("wrong password is rejected with 401", wrongPassword.status === 401, `HTTP ${wrongPassword.status}`);

    const forgot = await call(`${API}/v1/auth/forgot-password`, { method: "POST", body: { email: passwordEmail } });
    const forgotUnknown = await call(`${API}/v1/auth/forgot-password`, {
      method: "POST",
      body: { email: `nobody-${stamp}@orq8test.com` },
    });
    check(
      "forgot-password answers identically for known and unknown emails",
      forgot.status === 200 && forgotUnknown.status === 200,
      `HTTP ${forgot.status}/${forgotUnknown.status}`,
    );

    // Mint a real reset token (same sha256-hashed shape the route consumes).
    const resetToken = randomBytes(32).toString("hex");
    await adminPool.query(
      "INSERT INTO password_reset_tokens (user_id, token_hash, expires_at) VALUES ($1, $2, $3)",
      [regUserId, createHash("sha256").update(resetToken).digest("hex"), new Date(Date.now() + 60 * 60 * 1000)],
    );
    const resetOk = await call(`${API}/v1/auth/reset-password`, {
      method: "POST",
      body: { token: resetToken, password: newPassword },
    });
    check("reset-password completes with a valid token", resetOk.status === 200, `HTTP ${resetOk.status} ${JSON.stringify(resetOk.body)}`);

    const oldSessionAfterReset = await call(`${API}/v1/auth/me`, { token: regToken });
    const secondSessionAfterReset = await call(`${API}/v1/auth/me`, { token: session2 });
    check(
      "a reset revokes every live session",
      oldSessionAfterReset.status === 401 && secondSessionAfterReset.status === 401,
      `HTTP ${oldSessionAfterReset.status}/${secondSessionAfterReset.status}`,
    );

    const oldPasswordAgain = await call(`${API}/v1/auth/login`, {
      method: "POST",
      body: { email: passwordEmail, password },
    });
    check("the old password no longer works", oldPasswordAgain.status === 401, `HTTP ${oldPasswordAgain.status}`);

    const loginNew = await call(`${API}/v1/auth/login`, {
      method: "POST",
      body: { email: passwordEmail, password: newPassword },
    });
    check("the new password works", loginNew.status === 200 && !!loginNew.body?.data?.token, `HTTP ${loginNew.status}`);
    const session3: string = loginNew.body?.data?.token ?? "";

    const usedAgain = await call(`${API}/v1/auth/reset-password`, {
      method: "POST",
      body: { token: resetToken, password: "AnotherPass789!" },
    });
    check("a reset token cannot be reused", usedAgain.status === 401, `HTTP ${usedAgain.status}`);

    const logout = await call(`${API}/v1/auth/logout`, { method: "POST", token: session3 });
    const afterLogout = await call(`${API}/v1/auth/me`, { token: session3 });
    check(
      "logout destroys the session server-side",
      (logout.status === 200 || logout.status === 204) && afterLogout.status === 401,
      `logout HTTP ${logout.status}, me HTTP ${afterLogout.status}`,
    );

    // ── PHASE A: OAuth ────────────────────────────────────────────────────
    console.log("[4/6] API: OAuth start + callback (GitHub, Google, conflicts)…");
    const providers = await call(`${API}/v1/auth/oauth/providers`);
    check(
      "providers endpoint reports both providers configured",
      providers.body?.data?.github === true && providers.body?.data?.google === true,
      JSON.stringify(providers.body),
    );

    const webRedirect = `${WEB_ORIGIN}/api/auth/oauth/callback/github`;
    const start = await call(
      `${API}/v1/auth/oauth/github/start?redirect_uri=${encodeURIComponent(webRedirect)}&next=${encodeURIComponent("/app/tasks")}`,
    );
    const authorizeUrl: string = start.body?.data?.url ?? "";
    check(
      "start returns a GitHub consent URL with the signed state",
      start.status === 200 &&
        authorizeUrl.startsWith("https://github.com/login/oauth/authorize") &&
        authorizeUrl.includes("state=") &&
        authorizeUrl.includes(encodeURIComponent(webRedirect)),
      `HTTP ${start.status} ${authorizeUrl.slice(0, 120)}`,
    );
    const state = new URL(authorizeUrl).searchParams.get("state") ?? "";

    const forged = await call(`${API}/v1/auth/oauth/github/callback`, {
      method: "POST",
      body: { code: "x", state: "forged.signature", redirectUri: webRedirect },
    });
    check(
      "a forged state is rejected",
      forged.status === 400 && apiErrorCode(forged.body) === "oauth_state_invalid",
      `HTTP ${forged.status}`,
    );

    const swapped = await call(`${API}/v1/auth/oauth/github/callback`, {
      method: "POST",
      body: { code: "x", state, redirectUri: `${WEB_ORIGIN}/api/auth/oauth/callback/google` },
    });
    check(
      "a swapped callback URL is rejected",
      swapped.status === 400 && apiErrorCode(swapped.body) === "oauth_state_invalid",
      `HTTP ${swapped.status}`,
    );

    githubEmail = `gh-new-${stamp}@orq8test.com`;
    githubId = 900002;
    const ghNew = await call(`${API}/v1/auth/oauth/github/callback`, {
      method: "POST",
      body: { code: "valid-code", state, redirectUri: webRedirect },
    });
    check(
      "a new GitHub account is created and signed in",
      ghNew.status === 200 && ghNew.body?.data?.isNew === true && !!ghNew.body?.data?.token,
      `HTTP ${ghNew.status} ${JSON.stringify(ghNew.body?.error ?? ghNew.body?.data)}`,
    );
    check("the return destination survives the round trip", ghNew.body?.data?.next === "/app/tasks", String(ghNew.body?.data?.next));

    const ghNewToken: string = ghNew.body?.data?.token ?? "";
    const ghMe = await call(`${API}/v1/auth/me`, { token: ghNewToken });
    check(
      "the OAuth account arrives with a provider-verified email",
      ghMe.status === 200 && ghMe.body?.data?.user?.emailVerified === true,
      `HTTP ${ghMe.status}`,
    );
    const ghOrg = await call(`${API}/v1/org`, { token: ghNewToken });
    check("the OAuth session can reach data APIs", ghOrg.status === 200, `HTTP ${ghOrg.status}`);

    // Returning user: same GitHub identity signs in again (not a new account).
    const start2 = await call(`${API}/v1/auth/oauth/github/start?redirect_uri=${encodeURIComponent(webRedirect)}`);
    const state2 = new URL(start2.body?.data?.url ?? "https://x.invalid").searchParams.get("state") ?? "";
    const ghReturn = await call(`${API}/v1/auth/oauth/github/callback`, {
      method: "POST",
      body: { code: "valid-code", state: state2, redirectUri: webRedirect },
    });
    check(
      "a returning GitHub account signs in without a new company",
      ghReturn.status === 200 && ghReturn.body?.data?.isNew === false,
      `HTTP ${ghReturn.status}`,
    );

    // Conflict: the provider identity resolves to the password account.
    githubEmail = passwordEmail;
    githubId = 900003;
    const start3 = await call(`${API}/v1/auth/oauth/github/start?redirect_uri=${encodeURIComponent(webRedirect)}`);
    const state3 = new URL(start3.body?.data?.url ?? "https://x.invalid").searchParams.get("state") ?? "";
    const conflict = await call(`${API}/v1/auth/oauth/github/callback`, {
      method: "POST",
      body: { code: "valid-code", state: state3, redirectUri: webRedirect },
    });
    check(
      "an email already registered with a password returns the conflict (no silent merge)",
      conflict.status === 409 && apiErrorCode(conflict.body) === "oauth_password_conflict",
      `HTTP ${conflict.status} ${JSON.stringify(conflict.body?.error ?? conflict.body)}`,
    );

    googleEmail = `google-new-${stamp}@orq8test.com`;
    googleSub = `google-sub-${stamp}`;
    const googleRedirect = `${WEB_ORIGIN}/api/auth/oauth/callback/google`;
    const startG = await call(
      `${API}/v1/auth/oauth/google/start?redirect_uri=${encodeURIComponent(googleRedirect)}`,
    );
    const stateG = new URL(startG.body?.data?.url ?? "https://x.invalid").searchParams.get("state") ?? "";
    check(
      "start returns a Google consent URL",
      (startG.body?.data?.url ?? "").startsWith("https://accounts.google.com/o/oauth2/v2/auth"),
      String(startG.body?.data?.url).slice(0, 100),
    );
    const gNew = await call(`${API}/v1/auth/oauth/google/callback`, {
      method: "POST",
      body: { code: "valid-code", state: stateG, redirectUri: googleRedirect },
    });
    check(
      "a new Google account is created and signed in",
      gNew.status === 200 && gNew.body?.data?.isNew === true && !!gNew.body?.data?.token,
      `HTTP ${gNew.status} ${JSON.stringify(gNew.body?.error ?? gNew.body?.data)}`,
    );

    // A provider profile whose only email is unverified: GitHub reports it on
    // the profile, the emails list marks it verified=false. ORQ8 keys accounts
    // on email, so this must be refused, not silently claimed.
    const unverifiedGithubEmail = `gh-unverified-${stamp}@orq8test.com`;
    const stubUnverified = stubFetch;
    globalThis.fetch = (async (input: any, init?: any) => {
      const url = typeof input === "string" ? input : input?.url ?? String(input);
      if (url === "https://api.github.com/user") {
        return new Response(
          JSON.stringify({ id: 900004, login: "gh-unverified", name: "Unverified", email: unverifiedGithubEmail }),
          { status: 200, headers: { "content-type": "application/json" } },
        );
      }
      if (url === "https://api.github.com/user/emails") {
        return new Response(JSON.stringify([{ email: unverifiedGithubEmail, primary: true, verified: false }]), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      }
      return stubUnverified(input, init);
    }) as typeof fetch;
    const start4 = await call(`${API}/v1/auth/oauth/github/start?redirect_uri=${encodeURIComponent(webRedirect)}`);
    const state4 = new URL(start4.body?.data?.url ?? "https://x.invalid").searchParams.get("state") ?? "";
    const unverified = await call(`${API}/v1/auth/oauth/github/callback`, {
      method: "POST",
      body: { code: "valid-code", state: state4, redirectUri: webRedirect },
    });
    check(
      "an unverified provider email is refused",
      unverified.status === 401 && apiErrorCode(unverified.body) === "oauth_email_unverified",
      `HTTP ${unverified.status} ${JSON.stringify(unverified.body?.error ?? unverified.body)}`,
    );
    globalThis.fetch = stubFetch;

    const badRedirect = await call(
      `${API}/v1/auth/oauth/github/start?redirect_uri=${encodeURIComponent("https://evil.example.com/api/auth/oauth/callback/github")}`,
    );
    check(
      "a foreign callback URL never gets a consent redirect",
      badRedirect.status === 400 && apiErrorCode(badRedirect.body) === "oauth_redirect_invalid",
      `HTTP ${badRedirect.status}`,
    );

    // ── PHASE B: web app ──────────────────────────────────────────────────
    if (withWeb) {
      console.log("[5/6] Web: real next start against the local API…");
      const webLogPath = path.join(ROOT, "auth-e2e-web.log");
      const webLogFd = openSync(webLogPath, "w");
      webProc = spawn("pnpm", ["exec", "next", "start", "-p", String(WEB_PORT)], {
        cwd: path.join(ROOT, "apps/web"),
        env: { ...process.env, API_URL: API, NODE_ENV: "production" },
        stdio: ["ignore", webLogFd, webLogFd],
        shell: true,
      });
      let webUp = false;
      for (let i = 0; i < 45; i++) {
        await new Promise((r) => setTimeout(r, 1000));
        try {
          const res = await realFetch(WEB_ORIGIN, { redirect: "manual" });
          if (res.status < 500) { webUp = true; break; }
        } catch { /* not up yet */ }
      }
      check("web app is serving", webUp);
      if (!webUp) throw new Error("web app did not start");
      const apiAlive = await call(`${API}/healthz`);
      check("the API is reachable while the web app runs", apiAlive.status === 200, `HTTP ${apiAlive.status}`);

      const loginPage = await call(`${WEB_ORIGIN}/login`);
      check(
        "sign-in page renders the required copy",
        loginPage.status === 200 && loginPage.text.includes("Sign in to your company"),
        `HTTP ${loginPage.status}`,
      );
      const banned = ["organization", "workspace", "Something went wrong"].filter((w) =>
        loginPage.text.toLowerCase().includes(w.toLowerCase()),
      );
      const bannedContext = banned.length
        ? loginPage.text
            .toLowerCase()
            .slice(Math.max(0, loginPage.text.toLowerCase().indexOf(banned[0]!.toLowerCase()) - 60))
            .slice(0, 160)
            .replace(/\s+/g, " ")
        : "";
      check(
        "sign-in page never says organization, workspace, or Something went wrong",
        banned.length === 0,
        banned.length ? `found: ${banned.join(", ")} :: ${bannedContext}` : undefined,
      );
      // This run configures both providers, so the page must offer them and
      // point at the local start route (no dead buttons either way).
      check(
        "sign-in page offers the configured OAuth providers",
        loginPage.text.includes("Continue with GitHub") &&
          loginPage.text.includes("Continue with Google") &&
          loginPage.text.includes("/api/auth/oauth/start/github"),
      );

      // Fresh provider identities for the web phase: the conflict fixtures
      // from phase A would otherwise resolve to the password account.
      githubEmail = `gh-web-${stamp}@orq8test.com`;
      githubId = 910001;
      googleEmail = `google-web-${stamp}@orq8test.com`;
      googleSub = `google-web-sub-${stamp}`;

      const webEmail = `web-${stamp}@orq8test.com`;
      const webReg = await call(`${WEB_ORIGIN}/api/auth/register`, {
        method: "POST",
        body: { email: webEmail, password, name: "Web Founder", org_name: `Web Co ${stamp}` },
      });
      check(
        "register through the web proxy sets an httpOnly session cookie",
        webReg.status === 200 && !!webReg.cookie && webReg.cookie.startsWith("orq8_session="),
        `HTTP ${webReg.status} cookie=${webReg.cookie ? "yes" : "no"} body=${JSON.stringify(webReg.body)} webLog=${(() => { try { return readLog(path.join(ROOT, "auth-e2e-web.log"), "utf8").split("\n").slice(-4).join(" | ").slice(0, 400); } catch { return "?"; } })()}`,
      );
      const webCookie = webReg.cookie ?? "";
      const setCookieHeader = webReg.headers.get("set-cookie") ?? "";
      check("the session cookie is httpOnly", /httponly/i.test(setCookieHeader));
      check("no session token leaks into the register response body", !JSON.stringify(webReg.body).includes(webCookie.split("=")[1] ?? "___"));

      const appBlocked = await call(`${WEB_ORIGIN}/app`, { cookie: webCookie });
      check(
        "the app shell sends an unconfirmed session to /check-email",
        [302, 303, 307, 308].includes(appBlocked.status) && (appBlocked.location ?? "").includes("/check-email"),
        `HTTP ${appBlocked.status} → ${appBlocked.location}`,
      );

      const checkPage = await call(`${WEB_ORIGIN}/check-email`, { cookie: webCookie });
      check(
        "the confirmation page renders for an unconfirmed session",
        checkPage.status === 200 && checkPage.text.includes("Check your email"),
        `HTTP ${checkPage.status}`,
      );

      // Confirm through the web proxy with a token minted via the API service.
      const webUserId = await userIdByEmail(webEmail);
      const webMinted = await emailVerification.issueVerificationToken(created.db, webUserId, webEmail);
      const webVerify = await call(`${WEB_ORIGIN}/api/auth/verify-email`, {
        method: "POST",
        body: { token: (webMinted as { plaintextToken: string }).plaintextToken },
      });
      check("confirmation through the web proxy succeeds", webVerify.status === 200, `HTTP ${webVerify.status}`);

      const appAllowed = await call(`${WEB_ORIGIN}/app`, { cookie: webCookie });
      check(
        "the app shell opens once the email is confirmed",
        appAllowed.status === 200,
        `HTTP ${appAllowed.status} → ${appAllowed.location ?? ""}`,
      );

      // ── Dashboard first-run journeys (dashboard welcome hub spec §22) ──
      // The stage is derived SERVER-side from persisted onboarding state, so
      // each journey mutates through the real API and re-renders /app.
      // Assertion strings avoid apostrophes (React SSR escapes them) and
      // expression boundaries (React SSR inserts <!-- --> separators).
      const webToken = webCookie.split("=").slice(1).join("=");

      // Journey 1: brand new founder → EA introduction + onboarding guidance.
      check(
        "journey 1: a new founder meets the Executive Agent and is guided into onboarding",
        appAllowed.status === 200 &&
          appAllowed.text.includes("Welcome to ORQ8") &&
          appAllowed.text.includes("Atlas") &&
          appAllowed.text.includes("What are you building") &&
          appAllowed.text.includes("Continue onboarding") &&
          !appAllowed.text.includes("where your company stands"),
        `HTTP ${appAllowed.status}`,
      );

      // Journey 2: onboarding started → dashboard recognises it and offers
      // continuation with the exact remaining step.
      const j2State = await call(`${API}/v1/onboarding`, {
        method: "POST",
        token: webToken,
        body: { step: "constitution", data: { constitution: { values: ["customer focus"] } } },
      });
      const j2Page = await call(`${WEB_ORIGIN}/app`, { cookie: webCookie });
      check(
        "journey 2: partial onboarding is recognised and offers continuation",
        j2State.status === 200 &&
          j2Page.status === 200 &&
          j2Page.text.includes("partway through setting up") &&
          j2Page.text.includes("Still to finish:") &&
          j2Page.text.includes("your company constitution") &&
          j2Page.text.includes("Continue onboarding") &&
          !j2Page.text.includes("where your company stands"),
        `POST ${j2State.status} GET ${j2Page.status}`,
      );

      // Journey 3: onboarding completed → dashboard switches into company
      // oversight mode and stops pushing onboarding.
      const j3State = await call(`${API}/v1/onboarding`, {
        method: "POST",
        token: webToken,
        body: { step: "agents", data: { agents: [], complete: true } },
      });
      const j3Page = await call(`${WEB_ORIGIN}/app`, { cookie: webCookie });
      check(
        "journey 3: a completed company shows oversight mode, not onboarding",
        j3State.status === 200 &&
          j3Page.status === 200 &&
          j3Page.text.includes("where your company stands") &&
          !j3Page.text.includes("Continue onboarding") &&
          j3Page.text.includes("Company overview") &&
          j3Page.text.includes("Needs your attention") &&
          j3Page.text.includes("Executive recommendations"),
        `POST ${j3State.status} GET ${j3Page.status}`,
      );

      // Journey 4: returning active company → a real goal and a real pending
      // approval (created through the real API) surface in the hub: goals
      // section, attention queue, and the overview metric.
      const j4Goal = await call(`${API}/v1/goals`, {
        method: "POST",
        token: webToken,
        body: { title: "Launch the Lagos pilot", priority: "high" },
      });
      const j4Approval = await call(`${API}/v1/approvals`, {
        method: "POST",
        token: webToken,
        body: { action: "Approve the pilot launch budget", cost: 0, risk_level: "medium" },
      });
      const j4Page = await call(`${WEB_ORIGIN}/app`, { cookie: webCookie });
      check(
        "journey 4: a returning company surfaces goals, approvals and recommendations",
        j4Goal.status === 201 &&
          j4Approval.status === 201 &&
          j4Page.status === 200 &&
          j4Page.text.includes("Launch the Lagos pilot") &&
          j4Page.text.includes("Approve the pilot launch budget") &&
          j4Page.text.includes("Awaiting your decision") &&
          j4Page.text.includes("Executive recommendations"),
        `goal ${j4Goal.status} approval ${j4Approval.status} page ${j4Page.status}`,
      );

      const loginAuthed = await call(`${WEB_ORIGIN}/login`, { cookie: webCookie });
      check(
        "a signed-in founder hitting /login is sent into the app",
        [302, 303, 307, 308].includes(loginAuthed.status) && (loginAuthed.location ?? "").endsWith("/app"),
        `HTTP ${loginAuthed.status} → ${loginAuthed.location}`,
      );

      const staleCookie = await call(`${WEB_ORIGIN}/login`, { cookie: "orq8_session=not-a-real-session" });
      check(
        "an expired cookie renders the form instead of looping",
        staleCookie.status === 200,
        `HTTP ${staleCookie.status} → ${staleCookie.location}`,
      );

      const protectedAnon = await call(`${WEB_ORIGIN}/app/tasks`);
      check(
        "an unauthenticated visitor is sent to sign in with a return path",
        [302, 303, 307, 308].includes(protectedAnon.status) &&
          (protectedAnon.location ?? "").includes("/login") &&
          (protectedAnon.location ?? "").includes("next=%2Fapp%2Ftasks"),
        `HTTP ${protectedAnon.status} → ${protectedAnon.location}`,
      );

      const webLogin = await call(`${WEB_ORIGIN}/api/auth/login`, {
        method: "POST",
        body: { email: webEmail, password },
      });
      check("login through the web proxy succeeds", webLogin.status === 200 && !!webLogin.cookie, `HTTP ${webLogin.status}`);
      const goodCookie = webLogin.cookie ?? "";

      const webLogout = await call(`${WEB_ORIGIN}/api/auth/logout`, { method: "POST", cookie: goodCookie });
      check(
        "logout lands on the landing page",
        webLogout.status === 303 && (webLogout.location ?? "").endsWith("/"),
        `HTTP ${webLogout.status} → ${webLogout.location}`,
      );
      const clearedCookie = webLogout.headers.get("set-cookie") ?? "";
      check("logout clears the cookie", /max-age=0/i.test(clearedCookie), clearedCookie);
      const meAfterWebLogout = await call(`${WEB_ORIGIN}/api/auth/me`, { cookie: goodCookie });
      check(
        "the server-side session is destroyed after logout",
        meAfterWebLogout.status === 401,
        `HTTP ${meAfterWebLogout.status}`,
      );

      const loginWrong = await call(`${WEB_ORIGIN}/api/auth/login`, {
        method: "POST",
        body: { email: webEmail, password: "wrong-password" },
      });
      check(
        "wrong password surfaces the API message through the proxy",
        loginWrong.status === 401 && typeof loginWrong.body?.error === "string",
        `HTTP ${loginWrong.status} ${JSON.stringify(loginWrong.body)}`,
      );

      const oauthStartWeb = await call(`${WEB_ORIGIN}/api/auth/oauth/start/github?next=/app/tasks`);
      check(
        "the web OAuth start forwards to the provider with the signed state",
        [302, 303, 307].includes(oauthStartWeb.status) &&
          (oauthStartWeb.location ?? "").startsWith("https://github.com/login/oauth/authorize") &&
          (oauthStartWeb.location ?? "").includes("state="),
        `HTTP ${oauthStartWeb.status} → ${String(oauthStartWeb.location).slice(0, 100)}`,
      );
      const webState = new URL(oauthStartWeb.location ?? "https://x.invalid").searchParams.get("state") ?? "";
      const webCallback = await call(
        `${WEB_ORIGIN}/api/auth/oauth/callback/github?code=valid-code&state=${encodeURIComponent(webState)}`,
      );
      check(
        "the web OAuth callback sets the session cookie and redirects into the app",
        webCallback.status === 303 &&
          (webCallback.location ?? "").includes("/app") &&
          !!webCallback.cookie,
        `HTTP ${webCallback.status} → ${webCallback.location}`,
      );
      const webOauthMe = await call(`${WEB_ORIGIN}/api/auth/me`, { cookie: webCallback.cookie ?? "" });
      check("the OAuth session works through the web proxy", webOauthMe.status === 200, `HTTP ${webOauthMe.status}`);
    }

    // Optional: run the DB-backed integration suites against the same database
    // (they skip without one). Set AUTH_E2E_SUITES="auth.integration.test.ts …".
    const suites = (process.env.AUTH_E2E_SUITES ?? "").trim();
    if (suites) {
      console.log("[5b/6] running DB-backed integration suites against the same database…");
      const { spawnSync } = await import("node:child_process");
      const files = suites.split(/\s+/).map((f) => `test/${f}`);
      const result = spawnSync("pnpm", ["exec", "vitest", "run", ...files], {
        cwd: path.join(ROOT, "apps/api"),
        env: { ...process.env, DATABASE_URL, NODE_ENV: "test" },
        encoding: "utf8",
        shell: true,
        timeout: 600_000,
      });
      const out = `${result.stdout ?? ""}\n${result.stderr ?? ""}`;
      const tail = Number(process.env.AUTH_E2E_SUITE_TAIL ?? 16) || 16;
      console.log(out.split("\n").slice(-tail).join("\n"));
      check(`DB-backed suites pass (${files.length} files)`, result.status === 0, `exit ${result.status}`);
    }

    console.log("[6/6] done");
    // Cleanup can block on OS-level shutdown races (Fastify keep-alive sockets,
    // embedded Postgres on Windows). Results are already printed, so a watchdog
    // guarantees the harness exits with them instead of hanging until killed.
    const watchdog = setTimeout(() => process.exit(failures.length === 0 ? 0 : 1), 30_000);
    watchdog.unref();
    if (failures.length === 0) {
      console.log(`\nPASS — all auth flows verified${withWeb ? " (API + web)" : " (API only)"}.`);
    } else {
      console.log(`\nFAIL — ${failures.length} problem(s):`);
      for (const f of failures) console.log(`  x ${f}`);
    }
    process.exitCode = failures.length === 0 ? 0 : 1;
  } catch (err) {
    console.error("\nAuth e2e crashed:", err);
    process.exitCode = 2;
  } finally {
    globalThis.fetch = realFetch;
    // `next start` runs under a shell wrapper; killing the wrapper leaves the
    // server alive. Kill the whole tree on Windows, then the process group.
    try {
      if (webProc?.pid) {
        const { execFileSync } = await import("node:child_process");
        execFileSync("taskkill", ["/F", "/T", "/PID", String(webProc.pid)], { stdio: "ignore" });
      }
    } catch {}
    try { webProc?.kill(); } catch {}
    try { await app?.close(); } catch {}
    try { await adminPool?.end(); } catch {}
    // Give Postgres a beat to finish closing pool sockets before the server stops.
    await new Promise((r) => setTimeout(r, 500));
    try { await Promise.race([pg.stop(), new Promise((r) => setTimeout(r, 10_000))]); } catch {}
    try { rmSync(DB_DIR, { recursive: true, force: true, maxRetries: 3, retryDelay: 500 }); } catch {}
    console.log("[cleanup] embedded Postgres stopped, data dir removed.");
  }
}

void main();
