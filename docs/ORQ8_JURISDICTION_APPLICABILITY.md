# ORQ8 Jurisdiction Applicability Matrix (Phase 5)

Date: 2026-10-12. Evidence-based scope screen — NOT legal advice, NOT a
compliance certification. Regime summaries below come from researcher
reads of official/primary sources conducted today; figures the
researchers could not verify against full official text are flagged
UNVERIFIED and must be confirmed with counsel before reliance.
Jurisdiction conclusions require qualified legal review (R-008).

## 0. ORQ8 facts this matrix is built on

- Operating context Nigeria; pre-launch; ~zero active users (founder,
  test accounts, waitlist prospects whose emails are ALREADY stored).
- Personal data of people in Nigeria is processed (Phase 4 inventory).
- No EU/UK/US establishment, no directed targeting, no paying foreign
  users. US-cloud subprocessors used (Supabase, Vercel, OpenRouter,
  NVIDIA, Resend/SMTP, Stripe, PostHog-if-enabled).
- PostHog analytics is key-gated (unset = no client tracking).

## 1. Nigeria — NDPA 2023 + GAID 2025: APPLIES

| Obligation | Status for ORQ8 | Evidence / note |
|------------|-----------------|-----------------|
| Core principles, lawful basis, DSR rights (§§34–38), 72h breach notification to NDPC (§40, risk-triggered; higher-risk → notify individuals) | APPLY now | Processing of Nigerian residents' data is admitted (inventory) |
| DCMI/DPMI designation + NDPC registration (§44; UHL/EHL/OHL tiers per GAID Art. 8) | DETERMINE with counsel | Current volumes (tens of subjects) appear below reported OHL bands (UNVERIFIED figures: OHL 2,500–9,999), but tier test includes designated processing CLASSES, not just headcount — do not self-exempt on volume alone |
| Registration fees (reported ₦250k/₦100k/₦10k UHL/EHL/OHL) | UNVERIFIED figures — confirm | Secondary summaries; check official guidance |
| CAR filing (annual, reported 31 March; UHL/EHL via DPCO; OHL renews registration) | Depends on tier determination | Applies from 2026 audit cycle per DLA Piper summary |
| DPO designation (DCMI/DPMI) | Depends on tier determination | GAID competence/independence rules reported |
| DPIA before high-risk processing | LIKELY REQUIRED — AI agents + consequential actions + embeddings (see Phase 4 §5) | GAID format exists; vetting by certified DPO reported |
| Cross-border transfers Part VIII (adequacy / SCCs-BCRs / derogation; NDPC approval of instruments reported; NO adequacy list published) | REQUIRED for every US-cloud leg (Supabase, Vercel, OpenRouter, NVIDIA, Resend, Stripe, PostHog) | Vendor DPAs + transfer instruments = Phase 9 work |

Sources read today: NDPC resources/homepage/DPCO pages
(https://ndpc.gov.ng/), official GAID PDF link, DLA Piper GAID summary,
Mondaq GAID guide. Full PDF text extraction failed — tier boundaries
and fee brackets need direct confirmation.

## 2. EU GDPR / UK GDPR: OUT OF SCOPE now, no-threshold tripwire later

- Test (Art. 3(2) both regimes): offering goods/services TO people in the
  EU/UK or monitoring their behaviour there. No user-count or revenue
  threshold. Mere website accessibility ≠ targeting; facts matter.
- ORQ8 today: no EU/UK subjects, no targeting, analytics off by default
  → NOT IN SCOPE. Representative (Art. 27) not required yet.
- TRIPWIRES (reassess immediately if any occur): EU/UK-directed launch
  or marketing; accepting EU/UK signups as a directed offer; enabling
  PostHog/behavioural tracking that captures EU/UK visitors (monitoring
  limb — IPs/cookies/device IDs count). A single EU user is evidence,
  not an automatic trigger — but treat first EU/UK signup as a review
  event. If triggered: representative + Art. 28 processor contracts +
  Chapter V transfer machinery for the US legs.

## 3. US state laws: OUT OF SCOPE now, Texas is the early tripwire

- California CCPA (CPRA/Delete Act): $26.625M revenue OR 100k CA
  residents' PI bought/sold/shared OR 50% revenue from sale/sharing.
  Pre-revenue, no CA customers → NOT IN SCOPE. First CA customer alone
  does not trigger.
- Texas TDPSA: NO volume/revenue threshold — conducts business in Texas
  or serves TX residents + not an SBA-defined small business (foreign
  startup's eligibility for that exemption is UNCERTAIN — needs counsel).
  Earliest US tripwire: first Texas users force a re-check.
- Delaware (35k / 10k+20%-sale) and Oregon (100k / 25k+25%-sale) need
  scale OR data-sale revenue mix → monitor, not action now.
- Vendor location alone (US clouds) does not create scope under any of
  these on current facts.

## 4. Decisions required (human owners)

1. Founder + Nigerian counsel: confirm DCMI tier determination (headcount
   AND processing-class test), registration duty, CAR/DPO duties, DPIA
   vetting route, transfer instruments for the 7 US legs. (R-008)
2. Founder: direct-NDPC-registration vs DPCO engagement; support channel
   for DSR intake (blocks Phase 4.4/6 completion).
3. Product: instrument a launch gate — first EU/UK/US signup or enabling
   broad analytics re-opens this matrix BEFORE scaling, not after.
4. Phase 9: vendor DPAs + retention confirmation (OpenRouter/NVIDIA
   first — they receive prompts/memory).

## 5. Monitoring triggers (revisit this matrix when…)

Any paying customer; first EU/UK/Texas/California user; enabling
PostHog or any behavioural tracking; BYO-key removal (all inference on
ORQ8 keys); new subprocessor; data-sale or affiliate-sharing
arrangement; headcount crossing ~2,500 Nigerian subjects (reported OHL
floor — UNVERIFIED, counsel to set the real tripwire lower to be safe).
