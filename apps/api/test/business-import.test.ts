import { describe, it, expect, beforeAll, afterAll, describe as dbDescribe } from 'vitest';
import { Pool } from 'pg';
import { eq } from 'drizzle-orm';
import { loadConfig } from '@orq8/core';
import { createDb, organizations, memberships, users, departments, companyMemory } from '@orq8/db';
import { randomUUID } from 'node:crypto';
import {
  normalizeWebsiteUrl,
  isPrivateIp,
  assertSafeWebsiteUrl,
  htmlToText,
  fetchWebsiteContent,
  extractBusinessFacts,
  generateImportProposal,
  analyzeBusinessImport,
  generateProposalForImport,
  approveBusinessImport,
  rejectBusinessImport,
  getBusinessImport,
  UnsafeUrlError,
  WebsiteUnreachableError,
  type BusinessImportFact,
} from '../src/services/business-import.js';

// Shared hermetic resolver: every public-looking test host maps to a real
// public IP so no DNS or network traffic ever leaves the test process.
const resolve = async (host: string): Promise<string[]> => {
  if (host === 'internal.example') return ['10.0.0.6'];
  if (host === 'metadata.example') return ['169.254.169.254'];
  if (host.endsWith('.example') || host === 'example.com') return ['93.184.216.34'];
  return [];
};

// ─── Pure unit tests ───────────────────────────────────────────────────────

describe('URL normalization', () => {
  it('adds https, lowercases the host and strips fragments/search', () => {
    expect(normalizeWebsiteUrl('Example.com/About#team')).toBe('https://example.com/About');
    expect(normalizeWebsiteUrl('https://Shop.Example.com/?utm=x#top')).toBe('https://shop.example.com/');
  });

  it('rejects non-http schemes, empty values and embedded credentials', () => {
    expect(normalizeWebsiteUrl('ftp://example.com/file')).toBeNull();
    expect(normalizeWebsiteUrl('javascript:alert(1)')).toBeNull();
    expect(normalizeWebsiteUrl('file:///etc/passwd')).toBeNull();
    expect(normalizeWebsiteUrl('')).toBeNull();
    expect(normalizeWebsiteUrl('   ')).toBeNull();
    expect(normalizeWebsiteUrl('https://user:pass@example.com/')).toBeNull();
  });
});

describe('private IP guard', () => {
  it('flags loopback, RFC1918, CGNAT, link-local and cloud metadata', () => {
    expect(isPrivateIp('127.0.0.1')).toBe(true);
    expect(isPrivateIp('10.0.0.5')).toBe(true);
    expect(isPrivateIp('172.16.0.1')).toBe(true);
    expect(isPrivateIp('172.31.255.255')).toBe(true);
    expect(isPrivateIp('192.168.1.1')).toBe(true);
    expect(isPrivateIp('169.254.169.254')).toBe(true); // AWS/GCP/Azure metadata
    expect(isPrivateIp('0.0.0.0')).toBe(true);
    expect(isPrivateIp('100.64.0.1')).toBe(true);
    expect(isPrivateIp('224.0.0.1')).toBe(true); // multicast
    expect(isPrivateIp('240.0.0.1')).toBe(true); // reserved
  });

  it('allows public addresses', () => {
    expect(isPrivateIp('8.8.8.8')).toBe(false);
    expect(isPrivateIp('1.1.1.1')).toBe(false);
    expect(isPrivateIp('93.184.216.34')).toBe(false);
    expect(isPrivateIp('140.82.112.3')).toBe(false);
  });

  it('handles IPv6 incl. loopback, ULA, link-local and IPv4-mapped', () => {
    expect(isPrivateIp('::1')).toBe(true);
    expect(isPrivateIp('fc00::1')).toBe(true);
    expect(isPrivateIp('fe80::1')).toBe(true);
    expect(isPrivateIp('2001:4860:4860::8888')).toBe(false);
    expect(isPrivateIp('::ffff:127.0.0.1')).toBe(true);
    expect(isPrivateIp('::ffff:8.8.8.8')).toBe(false);
  });
});

describe('SSRF-safe host assertion', () => {
  it('rejects literal loopback and localhost names', async () => {
    await expect(assertSafeWebsiteUrl(new URL('http://127.0.0.1/'), resolve)).rejects.toThrow(UnsafeUrlError);
    await expect(assertSafeWebsiteUrl(new URL('http://localhost/'), resolve)).rejects.toThrow(UnsafeUrlError);
    await expect(assertSafeWebsiteUrl(new URL('http://[::1]/'), resolve)).rejects.toThrow(UnsafeUrlError);
  });

  it('rejects hostnames that resolve to private or metadata addresses', async () => {
    await expect(assertSafeWebsiteUrl(new URL('http://internal.example/'), resolve)).rejects.toThrow(UnsafeUrlError);
    await expect(assertSafeWebsiteUrl(new URL('https://metadata.example/'), resolve)).rejects.toThrow(UnsafeUrlError);
  });

  it('allows public hosts and rejects unresolvable ones', async () => {
    await expect(assertSafeWebsiteUrl(new URL('https://public.example/'), resolve)).resolves.toBeUndefined();
    await expect(assertSafeWebsiteUrl(new URL('https://nowhere.invalid/'), resolve)).rejects.toThrow(UnsafeUrlError);
  });
});

describe('bounded content extraction', () => {
  it('strips markup/scripts and caps output length', () => {
    const html = '<html><head><title>Acme</title></head><body><script>bad()</script><p>Hello world, this is Acme.</p></body></html>';
    const text = htmlToText(html, 500);
    expect(text).not.toContain('bad()');
    expect(text).not.toContain('<p>');
    expect(text).toContain('Hello world');
    const capped = htmlToText(`<p>${'a'.repeat(5000)}</p>`, 100);
    expect(capped.length).toBeLessThanOrEqual(100);
  });
});

describe('bounded website fetch (mocked transport)', () => {
  function fakeResponse(opts: { status?: number; headers?: Record<string, string>; body?: string }): Response {
    return {
      status: opts.status ?? 200,
      ok: (opts.status ?? 200) >= 200 && (opts.status ?? 200) < 300,
      headers: { get: (name: string) => opts.headers?.[name.toLowerCase()] ?? null } as unknown as Headers,
      arrayBuffer: async () => Buffer.from(opts.body ?? ''),
    } as unknown as Response;
  }
  const fetcherOf = (impl: (url: string) => Response) => (impl) as unknown as typeof fetch;

  it('fetches and summarizes a normal page', async () => {
    const content = await fetchWebsiteContent('https://example.com/', {
      resolveHosts: resolve,
      fetcher: fetcherOf(() => fakeResponse({
        headers: { 'content-type': 'text/html' },
        body: '<html><head><title>Acme Shoes</title></head><body><p>We sell shoes online with free delivery.</p></body></html>',
      })),
    });
    expect(content.title).toContain('Acme Shoes');
    expect(content.text).toContain('We sell shoes online');
    expect(content.finalUrl).toBe('https://example.com/');
  });

  it('re-validates redirect targets — never follows a redirect to a private host', async () => {
    const calls: string[] = [];
    const content = await fetchWebsiteContent('https://example.com/', {
      resolveHosts: resolve,
      fetcher: fetcherOf((url) => {
        calls.push(String(url));
        if (String(url) === 'https://example.com/') {
          return fakeResponse({ status: 302, headers: { location: 'http://127.0.0.1/steal', 'content-type': 'text/html' } });
        }
        return fakeResponse({ headers: { 'content-type': 'text/html' }, body: '<p>internal</p>' });
      }),
    }).catch((err: unknown) => err);
    expect(content).toBeInstanceOf(UnsafeUrlError);
    expect(calls.length).toBe(1); // the private hop was never fetched
  });

  it('follows public redirects safely', async () => {
    const content = await fetchWebsiteContent('https://example.com/', {
      resolveHosts: resolve,
      fetcher: fetcherOf((url) => {
        if (String(url) === 'https://example.com/') {
          return fakeResponse({ status: 301, headers: { location: 'https://example.com/home', 'content-type': 'text/html' } });
        }
        return fakeResponse({ headers: { 'content-type': 'text/html' }, body: '<p>Home page content here. This is the main landing page of the example store with plenty of readable text.</p>' });
      }),
    });
    expect(content.finalUrl).toBe('https://example.com/home');
    expect(content.text).toContain('Home page content');
  });

  it('rejects binary payloads and oversized pages', async () => {
    const binary = fetcherOf(() => fakeResponse({ headers: { 'content-type': 'image/png' }, body: 'PNG...' }));
    await expect(fetchWebsiteContent('https://example.com/a.png', { resolveHosts: resolve, fetcher: binary })).rejects.toThrow(WebsiteUnreachableError);
    const big = fetcherOf(() => fakeResponse({ headers: { 'content-type': 'text/html' }, body: 'x'.repeat(600_000) }));
    await expect(fetchWebsiteContent('https://example.com/', { resolveHosts: resolve, fetcher: big, maxBytes: 100_000 })).rejects.toThrow(WebsiteUnreachableError);
  });

  it('treats HTTP errors as unreachable', async () => {
    const err = fetcherOf(() => fakeResponse({ status: 503, headers: { 'content-type': 'text/html' }, body: 'down' }));
    await expect(fetchWebsiteContent('https://example.com/', { resolveHosts: resolve, fetcher: err })).rejects.toThrow(WebsiteUnreachableError);
  });
});

describe('structured fact extraction', () => {
  it('detects e-commerce industry from website + description with provenance', () => {
    const facts = extractBusinessFacts({
      description: 'We are an online store selling sustainable fashion.',
      websiteText: 'Shop the collection. Our ecommerce checkout is fast and our products ship worldwide. We are an online store.',
      websiteUrl: 'https://acme.example/',
    });
    const industry = facts.find((f) => f.field === 'industry');
    expect(industry?.value).toBe('E-commerce / Retail');
    expect(industry?.confidence).toBeGreaterThan(0.5);
    expect(industry?.sourceType).toBe('website');
    expect(industry?.sourceUrl).toBe('https://acme.example/');
    expect(industry?.snippet).toBeTruthy();
  });

  it('uses the founder description when no website is present', () => {
    const facts = extractBusinessFacts({ description: 'A consulting agency for enterprise clients with a monthly subscription model.' });
    const industry = facts.find((f) => f.field === 'industry');
    expect(industry?.value).toBe('Agency / Services');
    expect(industry?.sourceType).toBe('founder');
    const model = facts.find((f) => f.field === 'business_model');
    expect(model?.value).toMatch(/Subscription|B2B/);
  });

  it('returns no facts when there is no evidence', () => {
    expect(extractBusinessFacts({ description: 'Something completely neutral.' })).toEqual([]);
  });
});

describe('organization proposal', () => {
  const asFact = (field: string, value: string): BusinessImportFact => ({
    field, label: field, value,
    source: 'founder', sourceType: 'founder',
    sourceUrl: null, confidence: 0.8, snippet: 'evidence window',
  });

  it('recommends the e-commerce playbook for retail signals', () => {
    const proposal = generateImportProposal([asFact('industry', 'E-commerce / Retail'), asFact('business_model', 'B2C / Direct to consumer')], '');
    expect(proposal.recommendedPlaybook).toBe('ecommerce-growth');
    expect(proposal.willCreate.goals.length).toBeGreaterThan(0);
    expect(proposal.reasons.length).toBeGreaterThan(0);
  });

  it('recommends the agency playbook for service signals', () => {
    const proposal = generateImportProposal([asFact('industry', 'Agency / Services')], '');
    expect(proposal.recommendedPlaybook).toBe('agency-operations');
  });

  it('defaults to the startup playbook without strong signals', () => {
    const proposal = generateImportProposal([], 'noise');
    expect(proposal.recommendedPlaybook).toBe('startup-launch');
  });
});

// ─── DB-gated integration tests (skip without Postgres or before 0013) ────

const config = loadConfig();
let pool: Pool | null = null;
let dbUp = false;
let hasTable = false;
try {
  pool = new Pool({ connectionString: config.DATABASE_URL, connectionTimeoutMillis: 1500 });
  await pool.query('SELECT 1');
  dbUp = true;
  const r = await pool.query(`select to_regclass('public.business_imports') as t`);
  hasTable = Boolean(r.rows[0]?.t);
} catch {
  await pool?.end().catch(() => undefined);
  pool = null;
}

const run = dbUp && hasTable ? dbDescribe : dbDescribe.skip;

run('Business Import lifecycle + isolation', () => {
  const { db } = createDb(config.DATABASE_URL);
  const orgA = randomUUID();
  const orgB = randomUUID();
  const userA = randomUUID();
  const userB = randomUUID();

  beforeAll(async () => {
    if (!pool) return;
    await pool.query('begin');
    await db.insert(organizations).values({ id: orgA, name: 'Import Org A', slug: `imp-a-${randomUUID().slice(0, 8)}`, settings: {} }).onConflictDoNothing();
    await db.insert(organizations).values({ id: orgB, name: 'Import Org B', slug: `imp-b-${randomUUID().slice(0, 8)}`, settings: {} }).onConflictDoNothing();
    await db.insert(users).values({ id: userA, email: `imp-a-${randomUUID()}@test.orq8`, name: 'A', passwordHash: 'x', status: 'active' }).onConflictDoNothing();
    await db.insert(users).values({ id: userB, email: `imp-b-${randomUUID()}@test.orq8`, name: 'B', passwordHash: 'x', status: 'active' }).onConflictDoNothing();
    await db.insert(memberships).values({ orgId: orgA, userId: userA, role: 'owner' }).onConflictDoNothing();
    await db.insert(memberships).values({ orgId: orgB, userId: userB, role: 'owner' }).onConflictDoNothing();
    // Org A already has a department so approval applies as intelligence-only,
    // avoiding dependence on the full playbook-seeding path in this test.
    await db.insert(departments).values({ orgId: orgA, name: `Existing Dept ${randomUUID().slice(0, 6)}` }).onConflictDoNothing();
  });

  afterAll(async () => {
    if (!pool) return;
    await pool.query('rollback');
    await pool.end();
    pool = null;
  });

  it('analyze is idempotent for the same input', async () => {
    const desc = 'A consulting agency helping enterprises with marketing automation.';
    const first = await analyzeBusinessImport(db, orgA, userA, { description: desc });
    const second = await analyzeBusinessImport(db, orgA, userA, { description: desc });
    expect(second.id).toBe(first.id);
    expect(first.status).toBe('analysis');
    const industry = (first.facts as unknown as BusinessImportFact[]).find((f) => f.field === 'industry');
    expect(industry?.value).toBe('Agency / Services');
  });

  it('records website errors but keeps description facts when the site is unreachable', async () => {
    const fetcher = (async () => { throw new Error('net'); }) as unknown as typeof fetch;
    const imp = await analyzeBusinessImport(db, orgA, userA, {
      description: 'An online store for handmade candles.',
      websiteUrl: 'https://unreachable.example/',
    }, { fetcher, resolveHosts: resolve });
    expect(imp.websiteError).toBeTruthy();
    expect(imp.status).toBe('analysis');
    const facts = imp.facts as unknown as BusinessImportFact[];
    expect(facts.find((f) => f.field === 'industry')?.value).toBe('E-commerce / Retail');
  });

  it('never fetches private/internal URLs and persists nothing for them', async () => {
    let fetched = false;
    const fetcher = (async () => { fetched = true; throw new Error('never'); }) as unknown as typeof fetch;
    await expect(analyzeBusinessImport(db, orgA, userA, {
      description: 'Some company',
      websiteUrl: 'http://127.0.0.1/admin',
    }, { fetcher, resolveHosts: resolve })).rejects.toThrow(UnsafeUrlError);
    expect(fetched).toBe(false);
  });

  it('proposal generation gates the import into pending_approval', async () => {
    const imp = await analyzeBusinessImport(db, orgA, userA, { description: 'An ecommerce store selling electronics.' });
    expect(imp.status).toBe('analysis');
    const proposed = await generateProposalForImport(db, orgA, userA, imp.id);
    expect(proposed.status).toBe('pending_approval');
    expect((proposed.proposal as { recommendedPlaybook: string }).recommendedPlaybook).toBe('ecommerce-growth');
  });

  it('cannot be applied before pending_approval; after approval it is terminal, idempotent and recorded', async () => {
    const imp = await analyzeBusinessImport(db, orgA, userA, { description: 'A marketing agency for local restaurants.' });
    await expect(approveBusinessImport(db, orgA, userA, imp.id)).rejects.toThrow(/pending approval/);
    await generateProposalForImport(db, orgA, userA, imp.id);

    const applied = await approveBusinessImport(db, orgA, userA, imp.id);
    expect(applied.status).toBe('applied');
    expect(applied.appliedAt).toBeTruthy();

    // Facts landed in Company Brain (company memory) with provenance.
    const facts = imp.facts as unknown as BusinessImportFact[];
    const memory = await db.select().from(companyMemory).where(eq(companyMemory.orgId, orgA));
    const factEntries = memory.filter((m) => m.source === 'business-import' && m.category === 'fact');
    expect(factEntries.length).toBe(Math.min(facts.length, 25));
    expect(factEntries[0]?.content).toContain('source: founder description');

    // Re-approval is a safe no-op.
    const again = await approveBusinessImport(db, orgA, userA, imp.id);
    expect(again.id).toBe(applied.id);
    expect(again.status).toBe('applied');
  });

  it('a rejected import cannot be proposed or applied', async () => {
    const imp = await analyzeBusinessImport(db, orgB, userB, { description: 'A SaaS platform for schools.' });
    const rejected = await rejectBusinessImport(db, orgB, userB, imp.id);
    expect(rejected.status).toBe('rejected');
    await expect(generateProposalForImport(db, orgB, userB, imp.id)).rejects.toThrow(/re-analyzed/);
    await expect(approveBusinessImport(db, orgB, userB, imp.id)).rejects.toThrow(/pending approval/);
  });

  it('enforces company isolation', async () => {
    const impA = await analyzeBusinessImport(db, orgA, userA, { description: 'Private knowledge for org A only.' });
    expect(await getBusinessImport(db, orgB, impA.id)).toBeNull();
    await expect(rejectBusinessImport(db, orgB, userB, impA.id)).rejects.toThrow(/not found/);
  });
});
