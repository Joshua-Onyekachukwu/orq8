// Independent audit-chain verifier: rebuilds every payload and hash from the
// row columns per docs/34.4 / services/audit.ts buildPayload + computeAuditHash,
// never trusting the stored hash for anything but the chain link.
const pg = require('pg');
(async () => {
  // SSL for the cloud source; plain TCP for a local restore target (the DR drill
  // verifies chains on the restored copy, which has no TLS endpoint).
  const target = process.argv[2];
  const isLocal = /(^|@|\/\/)(localhost|127\.0\.0\.1|::1)/.test(target);
  const pool = new pg.Pool({ connectionString: target, ssl: isLocal ? false : { rejectUnauthorized: false }, max: 1 });
  const crypto = require('node:crypto');
  const sha256 = (s) => crypto.createHash('sha256').update(s, 'utf8').digest('hex');
  const { rows: orgs } = await pool.query('select id from organizations order by created_at');
  let totalBad = 0;
  for (const org of orgs) {
    const { rows } = await pool.query(
      'select id, org_id, actor_type, actor_id, department_id, agent_id, task_id, action, tool, input_ref, result_ref, "authorization", approval_id, policy_ref, cost, outcome, occurred_at, prev_hash, hash from audit_events where org_id = $1 order by id', [org.id]);
    const genesis = sha256(org.id + ':' + 'orq8-genesis-v1');
    let prev = genesis;
    let bad = 0;
    for (const e of rows) {
      const payload = JSON.stringify({
        department_id: e.department_id ?? null,
        agent_id: e.agent_id ?? null,
        task_id: e.task_id ?? null,
        tool: e.tool ?? null,
        input_ref: e.input_ref ?? null,
        result_ref: e.result_ref ?? null,
        authorization: e.authorization ?? null,
        approval_id: e.approval_id ?? null,
        policy_ref: e.policy_ref ?? null,
        cost: e.cost ?? null,
        outcome: e.outcome,
      });
      const actor = e.actor_type + ':' + (e.actor_id ?? '');
      const iso = new Date(e.occurred_at).toISOString();
      const h = sha256([e.prev_hash, e.org_id, actor, e.action, payload, iso].join('||'));
      if (e.prev_hash !== prev) { bad++; console.log('  LINK-BREAK at id', e.id, 'expected prev', prev.slice(0,12), 'stored', e.prev_hash.slice(0,12)); }
      if (h !== e.hash) { bad++; console.log('  HASH-MISMATCH at id', e.id, 'computed', h.slice(0,12), 'stored', e.hash.slice(0,12)); }
      prev = e.hash;
    }
    console.log(org.id, 'rows:', rows.length, bad === 0 ? 'VALID' : ('INVALID(' + bad + ')'));
    totalBad += bad;
  }
  console.log(totalBad === 0 ? 'ALL CHAINS VALID' : 'CHAINS BROKEN: ' + totalBad);
  await pool.end();
  process.exit(totalBad === 0 ? 0 : 1);
})().catch(e => { console.error('ERR', e.message); process.exit(2); });
