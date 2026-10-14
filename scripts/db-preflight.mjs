/**
 * DB preflight for the DB Migrate workflow (and local debugging).
 *
 * The migrate runner's first symptom of a bad SUPABASE_DATABASE_URL is a raw
 * `read ECONNRESET` from pg — which says nothing about whether the secret is
 * empty, points at a dead host (the old Railway TCP proxy signature: TCP
 * accepted then dropped), or fails TLS/auth. This probe checks each stage
 * separately and fails fast with an actionable message.
 *
 * Prints host:port and stage results only — NEVER the URL, user, or password.
 *
 * Run: DATABASE_URL=... node scripts/db-preflight.mjs
 */
import net from 'node:net';
import tls from 'node:tls';

const raw = process.env.DATABASE_URL ?? '';
if (!raw) {
  console.error(
    '[preflight] FAIL: DATABASE_URL is empty. Set SUPABASE_DATABASE_URL to the ' +
      'Supabase session pooler URL (docs/64_SUPABASE_SETUP.md).',
  );
  process.exit(1);
}

let url;
try {
  url = new URL(raw);
} catch {
  console.error('[preflight] FAIL: DATABASE_URL does not parse as a URL.');
  process.exit(1);
}
if (!/^postgres(ql)?:$/.test(url.protocol)) {
  console.error(`[preflight] FAIL: unexpected scheme "${url.protocol}" (want postgres://).`);
  process.exit(1);
}

const host = url.hostname;
const port = Number(url.port || 5432);
const user = decodeURIComponent(url.username);
console.log(`[preflight] target ${host}:${port} as user "${user.split('.')[0]}" (secret not shown)`);

// Shape checks (warnings only — the TCP probe is the verdict).
if (port !== 5432) {
  console.log(
    `[preflight] WARN: port is ${port}, not 5432. Migrations need the session-mode ` +
      `pooler (5432); transaction mode (6543) breaks DDL. See docs/64.`,
  );
}
if (!host.endsWith('.pooler.supabase.com')) {
  console.log(
    `[preflight] WARN: host is not *.pooler.supabase.com. The direct db.<ref>.supabase.co ` +
      `host is IPv6-only (unreachable from GitHub runners); a non-supabase host is ` +
      `likely the retired Railway TCP proxy, which accepts TCP then drops it (ECONNRESET).`,
  );
}
if (user && !/^postgres\.[a-z0-9]+$/.test(user)) {
  console.log(
    `[preflight] WARN: pooler user should look like postgres.<project-ref>, not "${user.split('.')[0]}".`,
  );
}

function tcpProbe() {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    const timer = setTimeout(() => {
      socket.destroy();
      resolve({ ok: false, stage: 'tcp', detail: 'connection timed out after 10s (firewall or dead host)' });
    }, 10_000);
    socket.once('error', (err) => {
      clearTimeout(timer);
      resolve({ ok: false, stage: 'tcp', detail: `${err.code ?? err.message} (DNS or refused — host unreachable)` });
    });
    socket.connect(port, host, () => {
      clearTimeout(timer);
      // The Railway-proxy signature: handshake accepted, then immediately dropped.
      // Hold the socket briefly: a proxy that resets idle handshakes shows itself.
      const idle = setTimeout(() => {
        socket.destroy();
        resolve({ ok: true, stage: 'tcp', detail: 'connected and held 3s' });
      }, 3000);
      socket.once('error', (err) => {
        clearTimeout(idle);
        resolve({
          ok: false,
          stage: 'tcp-hold',
          detail: `${err.code ?? err.message} after connect — proxy-accepted-then-dropped signature (check the secret host)`,
        });
      });
      socket.once('close', (hadError) => {
        clearTimeout(idle);
        resolve(
          hadError
            ? { ok: false, stage: 'tcp-hold', detail: 'socket closed with error after connect' }
            : { ok: false, stage: 'tcp-hold', detail: 'server closed the idle connection — proxy-drop signature (check the secret host)' },
        );
      });
    });
  });
}

function tlsProbe() {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve({ ok: false, stage: 'tls', detail: 'TLS handshake timed out after 10s' }), 10_000);
    const socket = tls.connect({ host, port, servername: host, rejectUnauthorized: true }, () => {
      clearTimeout(timer);
      const proto = socket.getProtocol() ?? 'unknown';
      socket.destroy();
      resolve({ ok: true, stage: 'tls', detail: `TLS ok (${proto})` });
    });
    socket.once('error', (err) => {
      clearTimeout(timer);
      resolve({ ok: false, stage: 'tls', detail: `${err.code ?? err.message}` });
    });
  });
}

const tcp = await tcpProbe();
console.log(`[preflight] tcp: ${tcp.ok ? 'OK' : 'FAIL'} — ${tcp.detail}`);
if (!tcp.ok) {
  console.error(
    '[preflight] FAIL: cannot reach the database host. If the host is not ' +
      '*.pooler.supabase.com, replace SUPABASE_DATABASE_URL with the session-mode pooler URL from ' +
      'Supabase → Connect → Session pooler (docs/64_SUPABASE_SETUP.md).',
  );
  process.exit(1);
}
const tlsRes = await tlsProbe();
console.log(`[preflight] tls: ${tlsRes.ok ? 'OK' : 'FAIL'} — ${tlsRes.detail}`);
if (!tlsRes.ok) {
  console.error('[preflight] FAIL: TLS to the database host failed — check the host and network path.');
  process.exit(1);
}
console.log('[preflight] PASS: host reachable, TLS ok. Auth (password) is verified by the migrate run itself.');
