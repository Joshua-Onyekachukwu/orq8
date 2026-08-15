# ORQ8 — Design Partner Application (Form Copy & Questions)

**Status:** Draft for review · **Sources:** docs/00 §5 (wedge), §5.6 (Stage 1), §7.1 (Stage 0) · marketing/design_partner_outreach.md (§0 targeting, §1 offer, §7 gates) · brand_guide.md (voice)
**Purpose:** the application form behind the design-partner cohort (3–5 solo founders). Every question maps to a qualification gate from outreach §7 — if you can't score a Yes, the applicant doesn't enter the cohort.
**Companions:** marketing/design_partner_outreach.md (recruiting) · marketing/brand_guide.md (voice) · marketing/landing_page.md (page it links from)
**Placeholders** marked [bracketed] — fill before going live.

---

## 1. Form page copy

**Eyebrow:** Design partners

**Headline:**
> Tell ORQ8 what you want. It hires the team, does the work, and reports back.

**Subhead:**
> ORQ8 is an operating system for a company staffed by AI employees — you stay the CEO, the system runs the organization. We're recruiting **3–5 solo founders** as design partners: free access through beta, in exchange for using it on one real decision and telling us what breaks.

**What you get (3 bullets):** Free Pro-equivalent access through beta (~6 months), no card required · A direct line to the founder — your feedback ships · Early access before anyone else, plus naming rights in the changelog.

**What we ask (3 bullets):** Use ORQ8 on ONE real business decision in your first two weeks · One 30-minute onboarding call, then one feedback call per month · Honest criticism — and permission to use your story (anonymized if you prefer).

**What happens after you apply (3 steps):**
1. **We review.** We read every application — real business, real decision, real willingness to give feedback.
2. **20-minute call.** If it's a fit, we walk the Golden Workflow on *your* idea — never a canned demo.
3. **Onboard.** Your organization, Company Constitution, and first council are set up with you. Slots close at 5.

**Submit button:** `Apply to be a design partner` — [submitting…]

---

## 2. Fields

| # | Field | Type | Required | Why (for your review, not shown to applicants) |
|---|---|---|---|---|
| 1 | Full name | text | ✅ | Who we're talking to |
| 2 | Email | email | ✅ | The only channel until the call |
| 3 | Business / product name | text | ✅ | Sanity check vs gate 1 (real business) |
| 4 | What does it do, and for whom? | textarea (2–3 lines) | ✅ | Gate 1 — real business today, not idea-stage |
| 5 | You run it: | select — `Just me` / `Me + 1–2` / `Small team` | ✅ | Wedge fit: solo founder is the target (docs/00 §5) |
| 6 | Website or social (X / LinkedIn) | url | ◻️ | Where we found you + credibility |
| 7 | How did you hear about us? | select — `[X/Twitter]` / `[LinkedIn]` / `[Indie Hackers]` / `[Referral]` / `[Other]` | ◻️ | Channel tracking for outreach §0 |
| 8 | Anything else we should know? | textarea | ◻️ | Their chance to surprise us |

---

## 3. Qualification questions

Asked in order. Each maps to one gate from outreach §7 — the pass bar is in the right column.

| # | Question (shown to applicants) | Answers | Gate it scores |
|---|---|---|---|
| Q1 | **Tell us about your business today.** What does it do, who is it for, and where does it stand right now? | free text | **Gate 1 — real business/product** · Pass: a real business or shipped product, not an idea |
| Q2 | **What's the one real decision you'd feed ORQ8 in your first two weeks?** A real one — not a demo. ("Should we build X?", "Is this market worth pursuing?", "What's our pricing?") | free text | **Gate 2 — real decision** · Pass: names one concrete, current decision |
| Q3 | **What have you tried with AI, and what made you lose trust in it?** | free text | **Gate 1+3 signal** — AI-curious but control-minded · Pass: they want *control and accountability*, not another chatbot (outreach §0) |
| Q4 | **ORQ8 is early software. Rough edges and occasional friction are part of the deal — in exchange, you shape the product.** | radio — `I'm in` / `I need it polished first` | **Gate 3 — tolerates rough edges** · Pass: "I'm in" |
| Q5 | **Can you commit to one 30-minute onboarding call and one feedback call per month through the cohort?** | radio — `Yes, I can commit` / `I'll try` / `No` | **Gate 4 — feedback commitment** · Pass: firm yes with a schedule in mind |
| Q6 | **When we get there, may we use your story as a case study?** | radio — `Yes` / `Yes, anonymized` / `Let's talk later` | **Gate 5 — public reference** · Pass: any explicit choice (must not be blank) |
| Q7 | **Required consent checkbox:** *I understand this is a design partnership, not a free trial — I'm signing up to use ORQ8 on a real decision and give honest feedback.* | checkbox | **Gate 4+5 gatekeeper** · Pass: checked — unchecked = rejected |

**Anti-target early-exit (outreach §0):** anyone who writes "just want to try AI tools" in Q1/Q3, or an agency owner in Q4's context — skip. Slots are for solo founders running a real thing.

---

## 4. Confirmation email (sent automatically on submit)

**Subject:** Application received — ORQ8 design partners

**Body:**

> Hi [FirstName],
>
> Thanks — your application is in. We read every one, so thank you for taking the time.
>
> **What happens next:** we review applications within [3–5] days. If it looks like a fit, you'll get a calendar link for a **20-minute call** — we'll walk the Golden Workflow on *your* idea, not a canned demo, and set up your organization, Company Constitution, and first council right after.
>
> **Before the call, have this ready:** the one real decision from your application. That's the first thing we'll put through ORQ8 together.
>
> **A quick recap of the deal:** free Pro-equivalent access through beta (~6 months) in exchange for using ORQ8 on that one decision and telling us honestly what's broken. Your feedback ships — this cohort defines the product.
>
> We're keeping the cohort deliberately small — **3–5 founders** — and slots close when it's full.
>
> Speak soon,
> [Your name]
> Founder, ORQ8 · [orq8.ai]

---

## 5. Scoring at a glance (internal)

| Applicant | Gate 1 real biz | Gate 2 real decision | Gate 3 rough edges | Gate 4 feedback | Gate 5 reference | Verdict |
|---|---|---|---|---|---|---|
| [Name] | ✅ / ❌ | ✅ / ❌ | ✅ / ❌ | ✅ / ❌ | ✅ / ❌ | **In / Pass on call / Reject** |

**Rules (outreach §7):** 5/5 passes = invite to the call. Any hard No = reject, no fudge. 3–5 accepted = cohort full. A partner who doesn't use the product is worse than no partner.
