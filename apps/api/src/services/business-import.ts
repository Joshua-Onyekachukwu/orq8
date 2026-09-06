/**
 * Business Import (Phase 10)
 *
 * A founder gives ORQ8 a company description + website URL. This service:
 *   1. Normalizes + validates the URL and SSRF-guards it (no localhost, private
 *      ranges, cloud metadata, or internal hosts — redirects are re-validated
 *      per hop).
 *   2. Fetches the website with a bounded response (size + timeout + text cap)
 *      and extracts a plain-text summary + title.
 *   3. Extracts structured, provenance-backed facts deterministically — no LLM
 *      dependency, no fabrication: every fact carries source / source_url /
 *      confidence / snippet so ORQ8 can always answer "where did we get this?".
 *   4. Proposes an organization (recommended playbook + reasons) which stays in
 *      pending_approval until the founder explicitly approves.
 *   5. On approval, applies through the REAL org-builder path (playbook seed /
 *      company-builder activation — idempotent) and persists facts into Company
 *      Brain (company memory + knowledge graph) with their provenance.
 *
 * Security notes: websites are fetched server-side, so SSRF protection is
 * mandatory. We never fetch non-http(s), never follow redirects without
 * re-validating the new host, and never resolve to a private/metadata address.
 */
import { createHash } from 'node:crypto';
import { lookup } from 'node:dns/promises';
import { eq, desc, and, sql } from 'drizzle-orm';
import { businessImports, knowledgeEntities, agents, departments, type Db, type BusinessImport, type NewBusinessImport } from '@orq8/db';
import type { AppConfig } from '@orq8/core';
import * as memoryService from './memory.js';
import { appendAudit } from './audit.js';
import { seedPlaybook, getPlaybook } from './playbooks.js';
import { enrichBusinessFacts, enrichmentEnabled, type EnrichedFact } from './business-import-enrichment.js';

// ─── Types ──────────────────────────────────────────────────────────────────

export interface BusinessImportFact {
  field: string;            // stable field id, e.g. industry | business_model | audience
  label: string;            // human label, e.g. "Industry"
  value: string;            // detected value
  source: 'founder' | 'website' | 'inferred';
  sourceType: 'founder' | 'website';
  sourceUrl?: string | null;
  confidence: number;       // 0..1
  snippet?: string | null;  // evidence window from the source text
}

export interface ImportProposal {
  recommendedPlaybook: string;
  recommendedPlaybookName: string;
  reasons: string[];
  willCreate: {
    departments: string[];
    agents: string[];
    goals: string[];
  };
}

export interface WebsiteContent {
  finalUrl: string;
  title: string | null;
  text: string; // bounded plain text
}

export interface AnalyzeImportInput {
  description?: string | null;
  websiteUrl?: string | null;
}

const MAX_WEBSITE_BYTES = 500_000;
const MAX_SUMMARY_CHARS = 8_000;
const MAX_FETCH_TEXT = 40_000;
const FETCH_TIMEOUT_MS = 9_000;
const MAX_REDIRECTS = 5;

export class UnsafeUrlError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'UnsafeUrlError';
  }
}
export class WebsiteUnreachableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'WebsiteUnreachableError';
  }
}
export class BusinessImportStateError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'BusinessImportStateError';
  }
}

// ─── SSRF-safe URL handling ─────────────────────────────────────────────────

/**
 * Normalize a raw website input into an https:// URL, or null when invalid.
 * Only http/https is ever acceptable; hostnames are lowercased; fragments are
 * dropped. A missing scheme is assumed to be https.
 */
export function normalizeWebsiteUrl(raw: string): string | null {
  if (!raw || raw.length > 2048) return null;
  let candidate = raw.trim();
  if (!candidate) return null;
  if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(candidate)) candidate = `https://${candidate}`;
  try {
    const url = new URL(candidate);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
    if (!url.hostname) return null;
    // Reject obvious credential smuggling (https://user:pass@host).
    if (url.username || url.password) return null;
    url.hash = '';
    url.search = '';
    return url.toString();
  } catch {
    return null;
  }
}

function ipv4ToNumber(ip: string): number | null {
  const parts = ip.split('.');
  if (parts.length !== 4) return null;
  const nums = parts.map((p) => {
    if (!/^\d{1,3}$/.test(p)) return NaN;
    return Number(p);
  });
  if (nums.some((n) => Number.isNaN(n) || n < 0 || n > 255)) return null;
  const [a = 0, b = 0, c = 0, d = 0] = nums;
  return ((a << 24) | (b << 16) | (c << 8) | d) >>> 0;
}

function inRange(n: number, start: number, end: number): boolean {
  return n >= start && n <= end;
}

/** True when an IP (IPv4 or IPv6, incl. IPv4-mapped) is private/forbidden. */
export function isPrivateIp(ip: string): boolean {
  const trimmed = ip.trim().toLowerCase();
  // IPv4-mapped IPv6: ::ffff:10.0.0.1 → check the embedded IPv4.
  const mapped = trimmed.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  const mappedIp = mapped?.[1];
  if (mappedIp) return isPrivateIp(mappedIp);

  const v4 = ipv4ToNumber(trimmed);
  if (v4 !== null) {
    return (
      inRange(v4, 0x00000000, 0x00ffffff) || // 0.0.0.0/8
      inRange(v4, 0x0a000000, 0x0affffff) || // 10.0.0.0/8
      inRange(v4, 0x64400000, 0x647fffff) || // 100.64.0.0/10 (CGNAT)
      inRange(v4, 0x7f000000, 0x7fffffff) || // 127.0.0.0/8
      inRange(v4, 0xa9fe0000, 0xa9feffff) || // 169.254.0.0/16 (incl. cloud metadata)
      inRange(v4, 0xac100000, 0xac1fffff) || // 172.16.0.0/12
      inRange(v4, 0xc0000200, 0xc00002ff) || // 192.0.2.0/24 (TEST-NET)
      inRange(v4, 0xc6120000, 0xc613ffff) || // 198.18.0.0/15 (benchmark)
      inRange(v4, 0xc0a80000, 0xc0a8ffff) || // 192.168.0.0/16
      inRange(v4, 0xe0000000, 0xefffffff) || // 224.0.0.0/4 multicast
      inRange(v4, 0xf0000000, 0xffffffff)
    );
  }

  // IPv6
  const addr = trimmed.includes('%') ? (trimmed.split('%')[0] ?? trimmed) : trimmed;
  if (addr === '::' || addr === '::1') return true;
  if (addr.startsWith('fc') || addr.startsWith('fd')) return true; // fc00::/7 ULA
  if (addr.startsWith('fe8') || addr.startsWith('fe9') || addr.startsWith('fea') || addr.startsWith('feb')) return true; // fe80::/10 link-local
  if (addr.startsWith('ff')) return true; // multicast
  return false;
}

export async function resolveHostIps(hostname: string): Promise<string[]> {
  try {
    const results = await lookup(hostname, { all: true });
    return results.map((r) => r.address);
  } catch {
    return [];
  }
}

/**
 * Reject a normalized URL when it targets a forbidden address. `resolveFn` is
 * injectable for tests (no network in unit tests). Literal-IP hosts are checked
 * directly; hostnames are resolved and every answer is checked.
 */
export async function assertSafeWebsiteUrl(
  url: URL,
  resolveFn: (host: string) => Promise<string[]> = resolveHostIps,
): Promise<void> {
  const host = url.hostname.toLowerCase();
  if (host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local')) {
    throw new UnsafeUrlError('Website import cannot reach local/internal hosts.');
  }
  if (/^\d+\.\d+\.\d+\.\d+$/.test(host)) {
    if (isPrivateIp(host)) throw new UnsafeUrlError('Website import cannot reach private network addresses.');
    return;
  }
  // Bare IPv6 literal in a URL (e.g. http://[::1]/).
  if (host.startsWith('[') || host.includes(':')) {
    const literal = host.replace(/^\[|\]$/g, '');
    if (isPrivateIp(literal)) throw new UnsafeUrlError('Website import cannot reach private network addresses.');
    return;
  }
  const ips = await resolveFn(host);
  if (ips.length === 0) throw new UnsafeUrlError('Website host could not be resolved.');
  if (ips.some((ip) => isPrivateIp(ip))) {
    throw new UnsafeUrlError('Website import cannot reach private network addresses.');
  }
}

// ─── Bounded website fetch ──────────────────────────────────────────────────

/** Strip tags/scripts and collapse whitespace into a plain-text summary. */
export function htmlToText(html: string, maxChars: number): string {
  const withoutScripts = html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ');
  const text = withoutScripts
    .replace(/<\/(p|div|h[1-6]|li|section|article|tr)>/gi, '\n')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/[ \t]+/g, ' ')
    .replace(/\n\s*\n+/g, '\n')
    .trim();
  return text.slice(0, maxChars);
}

function metaContent(html: string, name: string): string | null {
  const patterns = [
    new RegExp(`<meta[^>]+name=["']${name}["'][^>]+content=["']([^"']*)["']`, 'i'),
    new RegExp(`<meta[^>]+property=["']og:${name}["'][^>]+content=["']([^"']*)["']`, 'i'),
    new RegExp(`<meta[^>]+content=["']([^"']*)["'][^>]+name=["']${name}["']`, 'i'),
  ];
  for (const p of patterns) {
    const m = html.match(p);
    if (m?.[1]) return m[1].slice(0, 300);
  }
  return null;
}

function extractTitle(html: string): string | null {
  const title = html.match(/<title[^>]*>([^<]*)<\/title>/i);
  const og = metaContent(html, 'title');
  const candidate = og ?? title?.[1] ?? null;
  return candidate?.trim().slice(0, 200) || null;
}

/**
 * Fetch a website with SSRF guards on every hop, a size cap, a timeout and a
 * redirect budget. Returns a bounded plain-text summary — never the raw page.
 * `fetcher` is injectable for tests.
 */
export async function fetchWebsiteContent(
  websiteUrl: string,
  opts: {
    fetcher?: typeof fetch;
    resolveHosts?: (host: string) => Promise<string[]>;
    maxBytes?: number;
    timeoutMs?: number;
  } = {},
): Promise<WebsiteContent> {
  const rawUrl = normalizeWebsiteUrl(websiteUrl);
  if (!rawUrl) throw new WebsiteUnreachableError('Invalid website URL.');
  const fetcher = opts.fetcher ?? fetch;
  const resolveFn = opts.resolveHosts ?? resolveHostIps;
  const maxBytes = opts.maxBytes ?? MAX_WEBSITE_BYTES;
  const timeoutMs = opts.timeoutMs ?? FETCH_TIMEOUT_MS;

  let current = rawUrl;
  let redirects = 0;
  for (;;) {
    const parsed = new URL(current);
    await assertSafeWebsiteUrl(parsed, resolveFn);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    let res: Response;
    try {
      res = await fetcher(current, {
        redirect: 'manual',
        signal: controller.signal,
        headers: {
          'user-agent': 'ORQ8-BusinessImport/1.0 (+company-intelligence)',
          accept: 'text/html,application/xhtml+xml',
        },
      });
    } catch (err) {
      clearTimeout(timer);
      const name = err instanceof Error ? err.name : '';
      if (name === 'AbortError') throw new WebsiteUnreachableError('Website timed out.');
      throw new WebsiteUnreachableError('Website could not be fetched.');
    } finally {
      clearTimeout(timer);
    }

    if (res.status >= 300 && res.status < 400) {
      const location = res.headers.get('location');
      if (!location) throw new WebsiteUnreachableError('Website redirected without a target.');
      redirects += 1;
      if (redirects > MAX_REDIRECTS) throw new WebsiteUnreachableError('Website redirected too many times.');
      const next = normalizeWebsiteUrl(new URL(location, current).toString());
      if (!next) throw new WebsiteUnreachableError('Website redirected to an invalid URL.');
      current = next; // every hop is re-validated at the top of the loop
      continue;
    }
    if (!res.ok) {
      throw new WebsiteUnreachableError(`Website returned HTTP ${res.status}.`);
    }
    const type = res.headers.get('content-type') ?? '';
    if (!/text\/html|application\/xhtml/i.test(type) && !type.includes('text/plain')) {
      // Some sites serve HTML with generic content-type; still allow fetch and
      // attempt extraction, but skip binary payloads outright.
      if (/image|pdf|zip|octet-stream|json|video|audio/i.test(type)) {
        throw new WebsiteUnreachableError(`Website returned unsupported content (${type.split(';')[0] ?? 'unknown'}).`);
      }
    }
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length > maxBytes) {
      throw new WebsiteUnreachableError('Website content exceeds the import size limit.');
    }
    const html = buf.toString('utf8');
    const text = htmlToText(html, MAX_FETCH_TEXT);
    if (text.trim().length < 40) {
      throw new WebsiteUnreachableError('Website returned no readable content.');
    }
    return { finalUrl: current, title: extractTitle(html), text: text.slice(0, MAX_SUMMARY_CHARS) };
  }
}

// ─── Deterministic structured extraction ────────────────────────────────────

const INDUSTRY_SIGNALS: Array<{ industry: string; keywords: string[] }> = [
  { industry: 'E-commerce / Retail', keywords: ['ecommerce', 'e-commerce', 'e commerce', 'online store', 'shop', 'retail', 'wholesale', 'd2c', 'dropshipping', 'shopify', 'product catalog', 'inventory', 'checkout'] },
  { industry: 'Agency / Services', keywords: ['agency', 'studio', 'consulting', 'consultancy', 'professional services', 'freelance', 'creative agency', 'design agency', 'marketing agency', 'boutique'] },
  { industry: 'Software / SaaS', keywords: ['saas', 'software', 'platform', 'cloud', 'web application', 'web app', 'mobile app', 'app for', 'subscription software', 'b2b software'] },
  { industry: 'AI / Machine Learning', keywords: ['artificial intelligence', 'machine learning', 'ai-powered', 'llm', 'automation', 'chatbot', 'copilot', 'computer vision', 'nlp', 'genai', 'generative ai'] },
  { industry: 'Fintech / Financial services', keywords: ['fintech', 'payment', 'payments', 'banking', 'invoice', 'invoicing', 'lending', 'digital wallet', 'wallet', 'financing', 'insurance', 'payroll', 'bookkeeping'] },
  { industry: 'Healthcare / Wellness', keywords: ['healthcare', 'health', 'medical', 'clinic', 'telehealth', 'patient', 'wellness', 'fitness', 'therapy'] },
  { industry: 'Education / Training', keywords: ['education', 'learning', 'course', 'courses', 'training', 'coach', 'tutoring', 'academy', 'curriculum', 'elearning', 'e-learning'] },
  { industry: 'Media / Content', keywords: ['publishing', 'newsletter', 'content', 'media company', 'podcast', 'creator', 'blog', 'video'] },
  { industry: 'Logistics / Supply chain', keywords: ['logistics', 'supply chain', 'shipping', 'delivery', 'freight', 'fulfilment', 'fulfillment', 'warehouse', 'courier'] },
  { industry: 'Hospitality / Travel', keywords: ['restaurant', 'hospitality', 'food delivery', 'catering', 'hotel', 'travel', 'booking', 'tourism'] },
  { industry: 'Real estate / Property', keywords: ['real estate', 'property', 'rental', 'leasing', 'proptech', 'apartments'] },
  { industry: 'Marketplace / Platforms', keywords: ['marketplace', 'two-sided', 'buyers and sellers', 'connect buyers', 'gig', 'on-demand'] },
];

const MODEL_SIGNALS: Array<{ model: string; keywords: string[] }> = [
  { model: 'B2B', keywords: ['b2b', 'businesses', 'for teams', 'for companies', 'enterprise', 'for agencies', 'for startups', 'solutions for'] },
  { model: 'B2C / Direct to consumer', keywords: ['b2c', 'consumers', 'direct to consumer', 'for everyone', 'for families', 'shoppers', 'for individuals'] },
  { model: 'Subscription / recurring', keywords: ['subscription', 'recurring', 'monthly fee', 'membership', 'annual plan', 'per month', 'billed monthly'] },
  { model: 'Marketplace / commission', keywords: ['marketplace', 'commission', 'take rate', 'fee per', 'sell your', 'list your'] },
  { model: 'Freemium', keywords: ['freemium', 'free plan', 'free tier', 'free version', 'upgrade'] },
];

const CHANNEL_SIGNALS: Array<{ channel: string; keywords: string[] }> = [
  { channel: 'Social media', keywords: ['social media', 'instagram', 'tiktok', 'linkedin', 'facebook', 'youtube', 'twitter', 'influencer'] },
  { channel: 'Content & SEO', keywords: ['content marketing', 'blog', 'seo', 'newsletter', 'email marketing', 'podcast', 'organic search'] },
  { channel: 'Paid advertising', keywords: ['paid ads', 'advertising', 'google ads', 'meta ads', 'ppc', 'paid media', 'campaigns'] },
  { channel: 'Marketplace channels', keywords: ['amazon', 'shopify', 'etsy', 'app store', 'google play', 'marketplaces'] },
  { channel: 'Partnerships & referral', keywords: ['partnership', 'partnerships', 'referral', 'affiliate', 'word of mouth', 'reseller'] },
];

const AUDIENCE_SIGNALS: Array<{ audience: string; keywords: string[] }> = [
  { audience: 'Small businesses / SMB', keywords: ['small business', 'smb', 'entrepreneur', 'founders', 'startups', 'local business'] },
  { audience: 'Enterprise', keywords: ['enterprise', 'corporations', 'large companies', 'fortune 500', 'sse'] },
  { audience: 'Consumers', keywords: ['consumers', 'families', 'households', 'individuals', 'everyday'] },
  { audience: 'Developers / Technical', keywords: ['developers', 'api', 'sdk', 'open source', 'documentation'] },
  { audience: 'Creators / Freelancers', keywords: ['creators', 'freelancers', 'influencers', 'independent'] },
  { audience: 'Students / Learners', keywords: ['students', 'learners', 'professionals looking'] },
];

const GEO_CURRENCY_SIGNALS: Array<{ geo: string; keywords: string[] }> = [
  { geo: 'United States / USD', keywords: ['$', 'usd', 'dollars'] },
  { geo: 'Europe / EUR', keywords: ['€', 'eur'] },
  { geo: 'United Kingdom / GBP', keywords: ['£', 'gbp', 'pounds'] },
  { geo: 'Nigeria / NGN', keywords: ['₦', 'ngn', 'naira'] },
  { geo: 'India / INR', keywords: ['₹', 'inr', 'rupees'] },
  { geo: 'UAE / AED', keywords: ['aed', 'dirham'] },
];

const STAGE_SIGNALS: Array<{ stage: string; keywords: string[] }> = [
  { stage: 'Launching / early', keywords: ['launching', 'coming soon', 'beta', 'early access', 'just launched', 'we are launching', 'new'] },
  { stage: 'Growing / established', keywords: ['trusted by', 'customers', 'since 20', 'years of', 'clients include', 'case studies', 'growth'] },
];

interface ScoredSignal {
  label: string;
  hits: number;
  websiteHits: number;
  descHits: number;
  snippet: string | null;
  websiteSnippet: string | null;
  descSnippet: string | null;
}

function snippetAround(text: string, keyword: string, radius = 130): string | null {
  const idx = text.toLowerCase().indexOf(keyword.toLowerCase());
  if (idx < 0) return null;
  const start = Math.max(0, idx - radius);
  return text.slice(start, idx + keyword.length + radius).trim();
}

function scoreSignals(
  signals: Array<{ label: string; keywords: string[] }>,
  descText: string,
  websiteText: string,
  sourceUrl: string | null,
): ScoredSignal[] {
  const out: ScoredSignal[] = [];
  for (const s of signals) {
    let hits = 0;
    let websiteHits = 0;
    let descHits = 0;
    let websiteSnippet: string | null = null;
    let descSnippet: string | null = null;
    const wl = websiteText.toLowerCase();
    const dl = descText.toLowerCase();
    for (const kw of s.keywords) {
      const inWebsite = wl.includes(kw);
      const inDesc = dl.includes(kw);
      if (inWebsite) {
        websiteHits += 1;
        hits += 1;
        if (!websiteSnippet) websiteSnippet = snippetAround(websiteText, kw);
      }
      if (inDesc) {
        descHits += 1;
        hits += 1;
        if (!descSnippet) descSnippet = snippetAround(descText, kw);
      }
    }
    if (hits > 0) {
      out.push({
        label: s.label,
        hits,
        websiteHits,
        descHits,
        snippet: websiteSnippet ?? descSnippet ?? null,
        websiteSnippet: websiteSnippet && websiteHits > 0 ? websiteSnippet : null,
        descSnippet: descSnippet && descHits > 0 ? descSnippet : null,
      });
    }
  }
  // Keep only the strongest signal per family group (best first by hits,
  // website evidence weighted slightly higher than description).
  void sourceUrl;
  return out.sort((a, b) => b.hits - a.hits || b.websiteHits - a.websiteHits);
}

/** Adapt a signal family (whose label key differs, e.g. industry/model/geo) to the scorer's shape. */
function labeled<T extends { keywords: string[] }>(items: T[], pickLabel: (item: T) => string): Array<{ label: string; keywords: string[] }> {
  return items.map((item) => ({ label: pickLabel(item), keywords: item.keywords }));
}

function bestOf<T extends ScoredSignal>(signals: T[]): T | null {
  return signals[0] ?? null;
}

function confidenceFor(sig: ScoredSignal): number {
  let c = 0.5 + Math.min(sig.hits, 4) * 0.08;
  if (sig.websiteHits > 0 && sig.descHits > 0) c += 0.16; // corroborated
  else if (sig.websiteHits > 0) c += 0.1;
  return Math.min(0.95, Math.round(c * 100) / 100);
}

function makeFact(
  field: string,
  label: string,
  value: string,
  sig: ScoredSignal,
  sourceUrl: string | null,
): BusinessImportFact {
  const fromWebsite = sig.websiteHits > 0;
  const fromDesc = sig.descHits > 0;
  const source: BusinessImportFact['source'] = fromWebsite && fromDesc ? 'website' : fromWebsite ? 'website' : 'founder';
  const sourceType: BusinessImportFact['sourceType'] = fromWebsite ? 'website' : 'founder';
  return {
    field,
    label,
    value,
    source,
    sourceType,
    sourceUrl: sourceType === 'website' ? sourceUrl : null,
    confidence: confidenceFor(sig),
    snippet: sig.snippet ? `${sig.snippet}${sig.snippet.length >= 280 ? '…' : ''}` : null,
  };
}

/**
 * Extract structured facts from the founder description + website text. Every
 * fact is tied to where the evidence came from (provenance) and a confidence
 * score. Deterministic — same inputs always produce the same facts.
 */
export function extractBusinessFacts(input: {
  description?: string | null;
  websiteText?: string | null;
  websiteUrl?: string | null;
}): BusinessImportFact[] {
  const descText = (input.description ?? '').toLowerCase();
  const websiteText = (input.websiteText ?? '').toLowerCase();
  const sourceUrl = input.websiteUrl && input.websiteUrl.length > 0 ? input.websiteUrl : null;
  const facts: BusinessImportFact[] = [];

  const industries = scoreSignals(labeled(INDUSTRY_SIGNALS, (s) => s.industry), descText, websiteText, sourceUrl);
  const industry = bestOf(industries);
  if (industry) facts.push(makeFact('industry', 'Industry', industry.label, industry, sourceUrl));

  const models = scoreSignals(labeled(MODEL_SIGNALS, (s) => s.model), descText, websiteText, sourceUrl);
  const model = bestOf(models);
  if (model) facts.push(makeFact('business_model', 'Business model', model.label, model, sourceUrl));

  const audiences = scoreSignals(labeled(AUDIENCE_SIGNALS, (s) => s.audience), descText, websiteText, sourceUrl);
  const audience = bestOf(audiences);
  if (audience) facts.push(makeFact('target_audience', 'Target audience', audience.label, audience, sourceUrl));

  // Marketing channels: include the top two when evidence is present.
  const channels = scoreSignals(labeled(CHANNEL_SIGNALS, (s) => s.channel), descText, websiteText, sourceUrl);
  for (const ch of channels.slice(0, 2)) {
    facts.push(makeFact('marketing_channel', 'Marketing channel', ch.label, ch, sourceUrl));
  }

  const geos = scoreSignals(labeled(GEO_CURRENCY_SIGNALS, (s) => s.geo), descText, websiteText, sourceUrl);
  const geo = bestOf(geos);
  if (geo) facts.push(makeFact('geography', 'Geography (currency/region signal)', geo.label, geo, sourceUrl));

  const stages = scoreSignals(labeled(STAGE_SIGNALS, (s) => s.stage), descText, websiteText, sourceUrl);
  const stage = bestOf(stages);
  if (stage) facts.push(makeFact('stage', 'Company stage', stage.label, stage, sourceUrl));

  return facts;
}

// ─── Organization proposal ──────────────────────────────────────────────────

function pickPlaybookSlug(facts: BusinessImportFact[], description: string): string {
  const values = [
    ...facts.map((f) => `${f.field}:${f.value}`),
    (description ?? ''),
  ].join(' | ').toLowerCase();
  if (/(ecommerce|retail|shop|d2c|dropship|product catalog|inventory|wholesale)/.test(values)) return 'ecommerce-growth';
  if (/(agency|studio|consult|professional services|freelance|creative)/.test(values)) return 'agency-operations';
  return 'startup-launch';
}

function describePlaybook(slug: string): { name: string; departments: string[]; agents: string[]; goals: string[] } | null {
  const pb = getPlaybook(slug);
  if (!pb) return null;
  return {
    name: pb.name,
    departments: pb.plan.departments.map((d) => d.name),
    agents: pb.plan.agents.map((a) => a.name),
    goals: pb.plan.goals.map((g) => g.title),
  };
}

export function generateImportProposal(facts: BusinessImportFact[], description: string | null): ImportProposal {
  const slug = pickPlaybookSlug(facts, description ?? '');
  const pb = describePlaybook(slug);
  const reasons = facts
    .filter((f) => f.field === 'industry' || f.field === 'business_model' || f.field === 'target_audience')
    .map((f) => `${f.label}: ${f.value} (${Math.round(f.confidence * 100)}% confidence${f.sourceType === 'website' ? ', from website' : ', from founder description'})`);
  if (reasons.length === 0) reasons.push('No strong industry signal detected — starting with a general company operating model.');
  reasons.push(`Recommended structure sizes the organization for this stage and vertical: ${pb ? `${pb.departments.length} departments, ${pb.agents.length} AI employees, ${pb.goals.length} initial goals.` : 'see playbook for details.'}`);
  return {
    recommendedPlaybook: slug,
    recommendedPlaybookName: pb?.name ?? slug,
    reasons,
    willCreate: pb
      ? { departments: pb.departments, agents: pb.agents, goals: pb.goals }
      : { departments: [], agents: [], goals: [] },
  };
}

// ─── Persistence ────────────────────────────────────────────────────────────

function fingerprintFor(description: string | null, websiteUrl: string | null): string {
  return createHash('sha256').update(`${websiteUrl ?? ''}|${description ?? ''}`).digest('hex');
}

function describeImport(imp: BusinessImport): string {
  return `${imp.websiteUrl ?? ''}${imp.websiteTitle ? ` (${imp.websiteTitle})` : ''}${imp.description ? ` — ${imp.description.slice(0, 80)}` : ''}`.trim();
}

export async function listBusinessImports(db: Db, orgId: string): Promise<BusinessImport[]> {
  return db.select().from(businessImports).where(eq(businessImports.orgId, orgId)).orderBy(desc(businessImports.createdAt)).limit(30);
}

export async function getBusinessImport(db: Db, orgId: string, id: string): Promise<BusinessImport | null> {
  const rows = await db.select().from(businessImports).where(and(eq(businessImports.id, id), eq(businessImports.orgId, orgId))).limit(1);
  return rows[0] ?? null;
}

/**
 * Analyze a company description + website. Idempotent per (org, fingerprint):
 * re-analyzing the same input returns the existing row. When a website is
 * unreachable, the import is still recorded (description facts remain usable)
 * with website_error set, so a founder can retry later — but private/internal
 * URLs are always rejected outright before any fetch happens.
 */
export async function analyzeBusinessImport(
  db: Db,
  orgId: string,
  userId: string,
  input: AnalyzeImportInput,
  opts: { fetcher?: typeof fetch; resolveHosts?: (host: string) => Promise<string[]>; config?: AppConfig; enrich?: boolean } = {},
): Promise<BusinessImport> {
  const description = input.description?.trim() || null;
  const rawWebsite = input.websiteUrl?.trim() || null;
  if (!description && !rawWebsite) {
    throw new BusinessImportStateError('Provide a company description, a website URL, or both.');
  }
  const websiteUrl = rawWebsite ? normalizeWebsiteUrl(rawWebsite) : null;
  if (rawWebsite && !websiteUrl) {
    throw new BusinessImportStateError('Invalid website URL — only http(s) websites can be imported.');
  }

  const fingerprint = fingerprintFor(description, websiteUrl);
  const existing = await getBusinessImportByFingerprint(db, orgId, fingerprint);
  if (existing && existing.status !== 'failed') {
    await appendAudit(db, {
      orgId,
      actorType: 'user',
      actorId: userId,
      action: 'business_import.reanalyzed',
      outcome: 'success',
      resultRef: `${existing.id} — duplicate input, returned existing import`,
    });
    return existing;
  }
  if (existing && existing.status === 'failed') {
    await db.delete(businessImports).where(eq(businessImports.id, existing.id));
  }

  let websiteError: string | null = null;
  let title: string | null = null;
  let summary: string | null = null;
  let facts: BusinessImportFact[] = [];
  const now = new Date();
  const row: NewBusinessImport = {
    orgId,
    sourceFingerprint: fingerprint,
    description,
    websiteUrl,
    websiteTitle: null,
    websiteSummary: null,
    websiteError: null,
    facts: [],
    proposal: null,
    status: 'analysis',
    createdAt: now,
    updatedAt: now,
  };

  if (websiteUrl) {
    try {
      const content = await fetchWebsiteContent(websiteUrl, { ...opts });
      title = content.title;
      summary = content.text;
    } catch (err) {
      if (err instanceof UnsafeUrlError) throw err; // never fetch internal targets
      websiteError = err instanceof Error ? err.message : 'Website could not be fetched.';
    }
  }
  if (websiteError && !description) {
    // Nothing usable — record the failure so retry is possible and clear.
    row.status = 'failed';
    row.websiteError = websiteError;
    const created = await insertImport(db, row);
    await appendAudit(db, {
      orgId,
      actorType: 'user',
      actorId: userId,
      action: 'business_import.failed',
      outcome: 'failure',
      resultRef: websiteError,
    });
    return created;
  }

  facts = extractBusinessFacts({ description, websiteText: summary, websiteUrl });

  // Optional LLM enrichment (founder-gated + config-gated). Best-effort: any
  // failure falls back to the trusted extracted facts untouched. Enriched facts
  // keep their provenance and are tagged origin source/llm_refined/llm_suggested.
  let enrichmentNote = '';
  if (opts.config && opts.enrich !== false && enrichmentEnabled(opts.config)) {
    try {
      const enriched = await enrichBusinessFacts(opts.config, {
        description,
        websiteText: summary,
        facts,
      });
      const refined = enriched.facts.filter((f) => f.origin !== 'source').length;
      const goals = enriched.suggestedGoals;
      if (enriched.ran && (refined > 0 || goals.length > 0)) {
        const merged: EnrichedFact[] = [...enriched.facts];
        for (const g of goals) {
          merged.push({
            field: 'suggested_goal',
            label: 'Suggested goal',
            value: g.title,
            source: 'inferred',
            sourceType: 'website',
            confidence: g.confidence,
            snippet: g.evidence,
            origin: 'llm_suggested',
            enrichment: { method: 'llm', model: enriched.model ?? 'unknown', timestamp: new Date().toISOString() },
          });
        }
        facts = merged as unknown as BusinessImportFact[];
        enrichmentNote = `; llm enrichment: ${refined} refined, ${goals.length} suggested goals (${enriched.model ?? 'model'})`;
      }
    } catch {
      // Enrichment is optional — the core import continues with source facts.
    }
  }
  row.websiteTitle = title;
  row.websiteSummary = summary;
  row.websiteError = websiteError;
  row.facts = facts as unknown as object[];

  const created = await insertImport(db, row);
  await appendAudit(db, {
    orgId,
    actorType: 'user',
    actorId: userId,
    action: 'business_import.analyzed',
    outcome: 'success',
    resultRef: `${created.id} — ${facts.length} facts extracted${enrichmentNote}${websiteError ? `; website error: ${websiteError}` : ''}`,
  });
  return created;
}

async function insertImport(db: Db, row: NewBusinessImport): Promise<BusinessImport> {
  const rows = await db.insert(businessImports).values(row).returning();
  const created = rows[0];
  if (!created) throw new Error('business import insert returned no row');
  return created;
}

async function getBusinessImportByFingerprint(db: Db, orgId: string, fingerprint: string): Promise<BusinessImport | null> {
  const rows = await db
    .select()
    .from(businessImports)
    .where(and(eq(businessImports.orgId, orgId), eq(businessImports.sourceFingerprint, fingerprint)))
    .limit(1);
  return rows[0] ?? null;
}

/** Move an analyzed import to pending_approval with a reviewable proposal. */
export async function generateProposalForImport(db: Db, orgId: string, userId: string, id: string): Promise<BusinessImport> {
  const imp = await getBusinessImport(db, orgId, id);
  if (!imp) throw new BusinessImportStateError('Business import not found.');
  if (imp.status === 'applied') return imp; // already applied — nothing to re-propose
  if (imp.status === 'rejected') throw new BusinessImportStateError('A rejected import must be re-analyzed before proposing.');

  const proposal = generateImportProposal(
    (imp.facts as unknown as BusinessImportFact[]) ?? [],
    imp.description,
  );
  const [updated] = await db
    .update(businessImports)
    .set({ proposal: proposal as unknown as object, status: 'pending_approval', updatedAt: new Date() })
    .where(and(eq(businessImports.id, id), eq(businessImports.orgId, orgId)))
    .returning();
  await appendAudit(db, {
    orgId,
    actorType: 'user',
    actorId: userId,
    action: 'business_import.proposed',
    outcome: 'success',
    resultRef: `${id} → ${proposal.recommendedPlaybook}`,
  });
  return updated ?? imp;
}

async function orgHasStructure(db: Db, orgId: string): Promise<boolean> {
  const [deptRows, agentRows] = await Promise.all([
    db.select({ id: departments.id }).from(departments).where(eq(departments.orgId, orgId)).limit(1),
    db.select({ id: agents.id }).from(agents).where(eq(agents.orgId, orgId)).limit(1),
  ]);
  return deptRows.length > 0 || agentRows.length > 0;
}

/**
 * Founder approval gate — the ONLY path that applies an import. Applies the
 * recommended playbook through the real (idempotent) org builder when the org
 * is empty, then persists the structured facts + a company profile into Company
 * Brain with provenance. Re-approving an applied import is a no-op.
 */
export async function approveBusinessImport(db: Db, orgId: string, userId: string, id: string): Promise<BusinessImport> {
  const imp = await getBusinessImport(db, orgId, id);
  if (!imp) throw new BusinessImportStateError('Business import not found.');
  if (imp.status === 'applied') return imp;
  if (imp.status !== 'pending_approval') {
    throw new BusinessImportStateError(`Import must be pending approval before it can be applied (current status: ${imp.status}).`);
  }

  const now = new Date();
  const applied = await db.transaction(async (tx) => {
    // Lock the row so two concurrent approvals can't double-apply.
    const locked = await tx.execute(sql`select id, status from public.business_imports where id = ${id} and org_id = ${orgId} for update`);
    const lockedRow = (locked.rows[0] as { status?: string } | undefined);
    if (!lockedRow) throw new BusinessImportStateError('Business import not found.');
    if (lockedRow.status === 'applied') {
      const rows = await tx.select().from(businessImports).where(eq(businessImports.id, id)).limit(1);
      return rows[0] ?? imp;
    }

    const proposal = (imp.proposal as unknown as ImportProposal | null) ?? generateImportProposal((imp.facts as unknown as BusinessImportFact[]) ?? [], imp.description);
    const hadStructure = await orgHasStructure(tx, orgId);
    let seeded = '';
    if (!hadStructure && proposal.recommendedPlaybook) {
      try {
        // Plan-aware: the recommended workforce is capped by the org's
        // entitlements (every department keeps its lead; roles fill to the
        // agent limit).
        const result = await seedPlaybook(tx, orgId, userId, proposal.recommendedPlaybook, { enforceAgentLimit: true });
        seeded = result.alreadySeeded
          ? 'already-seeded'
          : `seeded (${result.activation?.departments.length ?? 0} departments, ${result.activation?.agents.length ?? 0} agents${result.agentLimitApplied ? `, plan-limited ${result.agentLimitApplied.from}→${result.agentLimitApplied.to}` : ''})`;
      } catch (err) {
        // Org builder failure must not silently vanish — surface it but keep the
        // import record so the founder can retry apply.
        await tx.update(businessImports)
          .set({ websiteError: `apply failed: ${err instanceof Error ? err.message : 'unknown'}`, updatedAt: now })
          .where(eq(businessImports.id, id));
        throw new BusinessImportStateError(`Could not apply the proposed organization: ${err instanceof Error ? err.message : 'unknown'}`);
      }
    }

    // Persist facts into Company Brain (company memory) with provenance.
    const facts = (imp.facts as unknown as BusinessImportFact[]) ?? [];
    const memoryCount = Math.min(facts.length, 25);
    for (const fact of facts.slice(0, memoryCount)) {
      try {
        await memoryService.createMemory(tx, {
          orgId,
          category: 'fact',
          content: `${fact.label}: ${fact.value} — source: ${fact.sourceType === 'website' ? `website (${fact.sourceUrl ?? imp.websiteUrl ?? 'unknown'})` : 'founder description'}, confidence ${Math.round(fact.confidence * 100)}%.`,
          importance: Math.max(4, Math.min(8, Math.round(4 + fact.confidence * 4))),
          source: 'business-import',
        });
      } catch {
        // Individual memory write failure is non-fatal.
      }
    }
    try {
      await memoryService.createMemory(tx, {
        orgId,
        category: 'context',
        content: `Company profile imported and applied — ${describeImport(imp)}. ${facts.length} structured facts recorded with provenance.${hadStructure ? ' Organization already exists; import applied as intelligence only.' : ` Seeded via ${proposal.recommendedPlaybook}.`}`,
        importance: 8,
        source: 'business-import',
      });
    } catch {
      // Non-fatal.
    }
    // Company Brain knowledge graph node — provenance trace of the import itself.
    try {
      await tx.insert(knowledgeEntities).values({
        orgId,
        type: 'initiative',
        name: `Business import: ${(imp.websiteTitle ?? imp.websiteUrl ?? 'company profile').slice(0, 120)}`,
        summary: `${facts.length} structured facts with provenance (${imp.websiteUrl ? 'website + founder description' : 'founder description'}).`,
        metadata: {
          businessImportId: imp.id,
          websiteUrl: imp.websiteUrl,
          recommendedPlaybook: proposal.recommendedPlaybook,
          factsCount: facts.length,
        },
        source: 'business-import',
      });
    } catch {
      // Non-fatal.
    }

    const [updated] = await tx
      .update(businessImports)
      .set({ status: 'applied', decidedBy: userId, decidedAt: now, appliedAt: now, updatedAt: now })
      .where(and(eq(businessImports.id, id), eq(businessImports.orgId, orgId)))
      .returning();
    if (!updated) throw new BusinessImportStateError('Business import could not be updated.');
    await appendAudit(tx, {
      orgId,
      actorType: 'user',
      actorId: userId,
      action: 'business_import.applied',
      outcome: 'success',
      resultRef: `${id} — ${seeded || 'intelligence-only'}, ${memoryCount} facts → company memory`,
    });
    return updated;
  });

  return applied;
}

export async function rejectBusinessImport(db: Db, orgId: string, userId: string, id: string): Promise<BusinessImport> {
  const imp = await getBusinessImport(db, orgId, id);
  if (!imp) throw new BusinessImportStateError('Business import not found.');
  if (imp.status === 'applied') throw new BusinessImportStateError('An applied import cannot be rejected.');
  const [updated] = await db
    .update(businessImports)
    .set({ status: 'rejected', decidedBy: userId, decidedAt: new Date(), updatedAt: new Date() })
    .where(and(eq(businessImports.id, id), eq(businessImports.orgId, orgId)))
    .returning();
  if (updated) {
    await appendAudit(db, {
      orgId,
      actorType: 'user',
      actorId: userId,
      action: 'business_import.rejected',
      outcome: 'success',
      resultRef: id,
    });
  }
  return updated ?? imp;
}
