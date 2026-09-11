# 60 — Production Domain Recovery Runbook (`orq8.app`)

## Symptom (verified 2026-09-11)

- `orq8.app` and `www.orq8.app` return **NXDOMAIN from the .app registry
  itself** (Google DNS `Status:3`, authority `charlestonroadregistry.com`;
  RDAP at rdap.org: `"orq8.app not found"`). This is DNS/registrar level —
  no application change can cause it.
- The domain **resolved normally one day earlier** (production probes hit
  `orq8.app` successfully in the previous session, 2026-09-10).
- Registry NXDOMAIN (not SERVFAIL) plus an empty RDAP record means the TLD
  name servers no longer publish the domain at all: expired registration,
  registrar transfer/hold, deletion, or the domain being released.
- Everything else was verified healthy: `orq8.vercel.app` serves the current
  build (homepage 200, pages 200, `/v1` API alive on Railway), so the only
  broken layer is the domain.

Immediate user-facing consequence: anyone using bookmarks or the custom
domain gets DNS errors; `orq8.vercel.app` keeps working.

## What to check, in order (accounts only you can access)

1. **Registrar account** (wherever orq8.app is registered — Google Domains /
   Squarespace, Cloudflare, Namecheap, Porkbun…):
   - Registration status: **expired? in redemption/grace period? renewed?**
   - Any transfer-in/out pending, or a verification email (WHOIS email
     verification can suspend resolution until clicked).
   - If expired: renew immediately. Resolution typically restores within
     minutes-hours of renewal; the .app TLD has no clientHold nuance beyond
     the registrar's own holds.
2. **If expired beyond grace (redeemable period):** renewal is still
   possible but costs a redemption fee — act the same day.
3. **If the registrar shows active/registered:** check the registrar's DNS
   settings — nameservers may have been wiped. Vercel's recommended setup is
   either:
   - Vercel nameservers: `ns1.vercel-dns.com`, `ns2.vercel-dns.com`, or
   - your DNS host with an `A` record `orq8.app -> 76.76.21.21` and
     `CNAME www -> cname.vercel-dns.com`.

## Re-attaching the domain in Vercel (after registrar is fixed)

1. Vercel dashboard → project **orq8** (`prj_apiN6ei5QfGK4Dev4toYXLrjDmVl`)
   → Settings → Domains.
2. If `orq8.app` is still listed but shows an error, use **Refresh**; if it
   was removed, **Add** `orq8.app` and `www.orq8.app`, redirecting `www` →
   apex (or vice versa — keep one canonical).
3. Wait for the certificate provisioning to finish (Vercel auto-issues
   Let's Encrypt certs; takes a couple of minutes after DNS propagates).

## Verification once DNS is back

```bash
# Registry-level resolution must return A records:
curl -s "https://dns.google/resolve?name=orq8.app&type=A" | head -c 300

# HTTPS must answer on the custom domain:
for p in / /login /images/hero-bg.png /images/icons/quote.svg; do
  printf "%-26s " "$p"
  curl -s -o /dev/null -w "%{http_code} [%{content_type}]\n" "https://orq8.app$p"
done

# API through the web proxy (session flow) must still work:
curl -s -o /dev/null -w "%{http_code}\n" "https://orq8.app/api/healthz" || true
```

All four asset/page codes should be 200 with correct content types
(png/svg fixes shipped in `e7a5ccc` — see below).

## Related fix shipped the same day

The production **png/svg 404s** (logo-white.png, icons/quote.svg, hero/dots/
banner art) were caused by the root `.vercelignore` listing `*.png` and
`*.svg`, which stripped every png/svg from deployments while jpgs shipped.
Fixed in commit `e7a5ccc`; the Vercel verifier workflow now fails CI on
png/svg asset 404s so this class of regression cannot silently pass again.

## Prevention

- Enable registrar **auto-renew** and keep billing current; .app requires
  HTTPS but has no other special handling.
- Add the registry-DNS check above to any "production is down" triage before
  touching application code: registry NXDOMAIN = registrar problem;
  SERVFAIL/timeout = DNS host problem; 5xx from the app = our problem.
