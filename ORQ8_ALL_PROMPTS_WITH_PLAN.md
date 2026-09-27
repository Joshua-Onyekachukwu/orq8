# ORQ8 — COMPLETE SOURCE PROMPTS + MASTER PLANNING MANDATE

HOW TO USE THIS FILE:

PART 1 below is your operative mandate. It instructs you to read everything, understand it,
plan it, and STOP. Do not implement until the human reviews and approves the plan.

PART 2 is the complete, unabridged source material: every ORQ8 requirement, architecture
decision, implementation instruction, and workstream we have accumulated. It is the
authoritative requirements base for the plan you will produce.

Editorial notes (already applied to this compilation, for transparency):
- The "Unified AI Execution Infrastructure" prompt appeared twice in the source material
  (verbatim duplicate). It is included once, in SECTION 3.
- Where source prompts conflict, the newer directive wins. Known conflicts and their
  resolutions must still be documented in the plan you produce (see Part 1, item 3).
- Global rules (sentence case, no em dashes in user-facing copy, "Hire/Company/Credits/
  Employees" terminology, dark green + orange brand, no fake data or fake activity, fix
  root causes, never expose secrets, no duplicate systems) apply to every section and to
  the plan itself.

================================================================================
PART 1 — PLANNING MANDATE
================================================================================
I want you to thoroughly review the following file:

the source material in PART 2 of this file (the complete, unabridged ORQ8 prompt set)

This file contains the requirements, ideas, architecture decisions, implementation instructions, pending work, and other information we have accumulated for ORQ8.

DO NOT start implementing anything yet.

Your job at this stage is to understand everything in the file, organize it, identify dependencies, resolve conflicts, and produce one comprehensive implementation plan that we can review before any development begins.

Take your time. Do not skim the file or simply summarize it.

==================================================
1. READ AND UNDERSTAND THE ENTIRE FILE
==================================================

Go through:

the source material in PART 2 of this file (the complete, unabridged ORQ8 prompt set)

from beginning to end.

Read every section carefully.

Extract and understand:

- product requirements
- product vision
- UX requirements
- UI requirements
- architecture
- backend requirements
- frontend requirements
- database requirements
- AI/agent architecture
- Executive Agent requirements
- department architecture
- employee/agent architecture
- execution system
- workflows
- approvals
- permissions
- autonomy
- memory
- decisions
- events
- integrations
- model infrastructure
- OpenRouter
- Cloud Run
- Trigger.dev
- Supabase
- realtime
- credits
- billing
- audit
- admin systems
- observability
- security
- performance
- load testing
- migration requirements
- QA
- deployment
- browser testing
- existing bugs
- unfinished work
- future work
- anything else contained in the file

Do not assume that an item is unimportant simply because it appears later in the file.

==================================================
2. BUILD A COMPLETE UNDERSTANDING
==================================================

Do not simply rewrite the file.

Determine how all of the requirements relate to one another.

Identify:

- what must happen first
- what depends on something else
- what can happen in parallel
- what should not happen yet
- what requires access or credentials
- what requires infrastructure changes
- what requires database migrations
- what requires frontend work
- what requires backend work
- what requires external integrations
- what requires manual verification
- what requires browser testing
- what requires production testing
- what requires load testing

Think of ORQ8 as one system rather than a collection of individual tasks.

==================================================
3. IDENTIFY CONFLICTS AND DUPLICATION
==================================================

Look for conflicting or outdated instructions.

For example:

- two different approaches to the same feature
- old architecture versus newer architecture
- duplicate systems
- duplicate APIs
- duplicate workflows
- conflicting database approaches
- conflicting navigation structures
- conflicting agent behavior
- conflicting infrastructure decisions
- obsolete Railway assumptions
- conflicting model-routing approaches
- duplicate execution systems
- duplicate credit systems
- duplicate approval systems

Do not silently choose between conflicting requirements.

Document the conflict and determine which approach appears to be the current intended direction based on the overall document.

Where you cannot confidently resolve a conflict, mark it as:

REQUIRES DECISION

and explain exactly what decision is needed.

==================================================
4. IDENTIFY THE CURRENT TARGET ARCHITECTURE
==================================================

Based on the complete document, establish the architecture we are actually trying to build.

Document the responsibilities and relationships between:

- Vercel
- Supabase/Postgres
- Google Cloud Run
- Trigger.dev
- OpenRouter
- ORQ8 Model Gateway
- ORQ8 Agent Runtime
- Executive Agent
- departments
- AI employees
- execution system
- event system
- company memory
- approvals
- credits
- audit
- realtime
- integrations
- admin/observability

Clearly explain:

WHAT EACH COMPONENT DOES

WHAT IT DOES NOT DO

HOW THEY COMMUNICATE

WHERE STATE LIVES

WHERE EXECUTION HAPPENS

WHERE DURABLE WORK HAPPENS

WHERE MODEL REQUESTS GO

WHERE PERMISSIONS ARE ENFORCED

WHERE CREDITS ARE ENFORCED

WHERE AUDIT INFORMATION IS STORED

Do not allow responsibilities to overlap unnecessarily.

==================================================
5. CREATE THE COMPLETE WORK BREAKDOWN
==================================================

Turn everything in the source file into a structured implementation plan.

Break the work into logical phases.

Do not make arbitrary phases just to make the list look organized.

Phases should reflect actual technical and product dependencies.

For example, the final plan may contain phases such as:

Phase 0
Discovery and architecture reconciliation

Phase 1
Infrastructure and environment preparation

Phase 2
Authentication and access control

Phase 3
Core database/state architecture

Phase 4
Execution infrastructure

Phase 5
Agent Runtime

Phase 6
Model Gateway/OpenRouter

Phase 7
Trigger.dev durable workflows

Phase 8
Cloud Run services

Phase 9
Events and organic execution

Phase 10
Executive Agent

Phase 11
Departments and AI employees

Phase 12
Company operating hub

Phase 13
Founder's Attention

Phase 14
Tasks/workstreams/dependencies

Phase 15
Memory and decisions

Phase 16
Credits and usage

Phase 17
Admin observability

Phase 18
Integrations

Phase 19
Performance/load testing

Phase 20
Security hardening

Phase 21
Browser QA

Phase 22
Production deployment

However, DO NOT blindly use this example.

Determine the correct phases from the actual contents of the file.

==================================================
6. FOR EVERY PHASE, BE SPECIFIC
==================================================

For every phase, document:

### Objective

What this phase is intended to accomplish.

### Why it comes at this point

Explain its dependencies.

### Scope

Everything that belongs in this phase.

### Tasks

Break the phase into concrete implementation tasks.

### Frontend

List relevant UI work.

### Backend

List relevant API/service work.

### Database

List schema, migration, indexes, RLS or data changes.

### AI/Agent

List relevant agent/runtime/model changes.

### Infrastructure

List Cloud Run, Trigger.dev, Vercel, Supabase, OpenRouter or deployment work.

### Integrations

List required external systems.

### Security

List permissions, secrets, authentication and authorization requirements.

### Realtime

List state changes that need realtime propagation.

### Testing

List unit, integration, end-to-end, browser and infrastructure tests.

### Dependencies

Identify everything required before the phase can begin.

### Outputs

Describe exactly what should exist when the phase is complete.

### Acceptance criteria

Define how we know the phase is actually finished.

### Risks

Identify likely implementation risks.

### Rollback/recovery

Where appropriate, explain how the change can be safely reversed.

==================================================
7. DISTINGUISH REAL IMPLEMENTATION FROM UI WORK
==================================================

Be strict about this.

Do not consider something implemented simply because:

- a page exists
- a button exists
- a dashboard renders
- a status appears
- a card displays data
- an API endpoint returns mock data

For each feature determine the full implementation chain.

For example:

UI
→ API
→ authorization
→ database
→ execution
→ external service
→ state update
→ realtime
→ audit
→ error handling

Only mark the feature complete when the required layers are actually connected.

Explicitly identify any places where the existing project currently has:

UI ONLY
MOCK IMPLEMENTATION
PARTIAL IMPLEMENTATION
BACKEND ONLY
FRONTEND ONLY
PLACEHOLDER
PRODUCTION READY

==================================================
8. IDENTIFY WHAT WE NEED BEFORE DEVELOPMENT
==================================================

At the end of the analysis, create a section:

# Requirements Before Implementation Begins

List everything that will be needed before we can start the actual implementation.

Separate it into categories.

### Repository access

Files, folders, branches or projects that must be available.

### Environment variables

List required variables.

Do not invent values.

Identify which variables already appear to exist and which need to be created.

### Credentials and secrets

List required external credentials.

Do not expose secret values.

### Supabase

Required:

- project
- database
- migrations
- service role access if needed
- RLS access
- realtime configuration
- storage if needed

### Google Cloud

Required:

- project
- billing
- Cloud Run permissions
- service accounts
- Artifact Registry if required
- secrets
- APIs that must be enabled
- region
- deployment permissions

Do not assume values.

### Trigger.dev

Required:

- project
- API keys
- environment configuration
- deployment configuration

### OpenRouter

Required:

- API key
- model configuration
- routing configuration
- spending limits if applicable

### External integrations

List GitHub, Gmail, Linear, Slack, CRM, cloud services or any other systems actually required by the source file.

### Local development

List required software, CLI tools, runtimes and configuration.

### Testing

List browser tooling, test accounts, test organizations, seed data, staging environments and other requirements.

### Human decisions

List decisions that I must make before implementation can proceed.

==================================================
9. CREATE A DEPENDENCY GRAPH
==================================================

Create a clear dependency map.

For example:

Authentication
↓
Organization access
↓
Database state
↓
Agent identity
↓
Execution system
↓
Model Gateway
↓
Tool system
↓
Durable workflows
↓
EA
↓
Departments
↓
Company hub

Also identify independent work that can happen in parallel.

Make dependencies explicit so that implementation does not become chaotic.

==================================================
10. IDENTIFY THE FIRST IMPLEMENTATION SLICE
==================================================

After understanding the entire project, identify the smallest meaningful end-to-end vertical slice that should be implemented first.

It should preferably demonstrate the actual ORQ8 operating model.

For example:

Founder
→ EA
→ Task
→ Agent
→ Authority check
→ Execution
→ Model Gateway
→ OpenRouter
→ Supabase
→ Realtime
→ Founder UI
→ Credits
→ Audit

But determine the correct first slice from the actual requirements.

Explain why you selected it.

==================================================
11. IDENTIFY RISKS AND BOTTLENECKS
==================================================

Create a dedicated risk assessment.

Include:

- architecture risks
- database risks
- realtime risks
- execution risks
- model costs
- OpenRouter risks
- Cloud Run risks
- Trigger.dev risks
- Supabase limits
- concurrency risks
- runaway agent risks
- security risks
- authorization risks
- data isolation risks
- credit accounting risks
- integration risks
- migration risks
- load-scale risks
- deployment risks
- UX risks

For each major risk explain:

RISK
IMPACT
LIKELIHOOD
MITIGATION

Do not use arbitrary numerical scores unless they are genuinely useful.

==================================================
12. DEFINE TESTING STRATEGY
==================================================

Create a complete testing strategy covering:

Unit tests
Integration tests
Database tests
API tests
Agent runtime tests
Model Gateway tests
Credit tests
Permission tests
Approval tests
Execution tests
Trigger.dev workflow tests
Cloud Run tests
Realtime tests
Event tests
Failure/retry tests
Idempotency tests
Load tests
Security tests
Browser tests
Responsive tests
End-to-end tests
Production smoke tests

Include important failure scenarios.

Examples:

- model unavailable
- OpenRouter failure
- Cloud Run unavailable
- Trigger workflow failure
- tool failure
- database failure
- approval rejection
- approval timeout
- credit exhaustion
- agent timeout
- duplicate event
- duplicate execution
- retry after partial success
- founder cancels execution
- integration disconnected

==================================================
13. DEFINE THE DEPLOYMENT STRATEGY
==================================================

Explain how we should move from the current system to the new architecture safely.

Especially address any existing Railway infrastructure.

Determine:

- what stays temporarily
- what moves to Cloud Run
- what moves to Trigger.dev
- what is retired
- what can run in parallel during migration
- how to verify the replacement
- how to roll back
- when Railway can safely be removed

Do not recommend a destructive cutover without a verification stage.

==================================================
14. DEFINE THE GIT/COMMIT STRATEGY
==================================================

Create a logical commit strategy.

Commits should be small enough to understand and review.

Separate:

- auth
- database migrations
- execution infrastructure
- model gateway
- Trigger.dev
- Cloud Run
- navigation
- company hub
- EA
- departments
- credits
- admin
- tests
- deployment

Avoid one giant implementation commit.

==================================================
15. CREATE THE FINAL MASTER IMPLEMENTATION PLAN
==================================================

Create ONE Markdown file containing the complete plan.

Suggested filename:

docs/61_ORQ8_MASTER_IMPLEMENTATION_PLAN.md

The document should contain:

# ORQ8 Master Implementation Plan

## 1. Executive Summary

## 2. Source Requirements

## 3. Current System Understanding

## 4. Target Architecture

## 5. Architecture Decisions

## 6. Conflicts / Decisions Required

## 7. Complete Phase Plan

## 8. Phase-by-Phase Implementation Tasks

## 9. Database Plan

## 10. Agent / AI Runtime Plan

## 11. Execution Infrastructure Plan

## 12. Cloud Run Plan

## 13. Trigger.dev Plan

## 14. OpenRouter / Model Gateway Plan

## 15. Executive Agent Plan

## 16. Company / Department / Employee Plan

## 17. Memory / Decision / Event Plan

## 18. Credits / Billing Plan

## 19. Security Plan

## 20. Realtime Plan

## 21. Admin / Observability Plan

## 22. Integration Plan

## 23. Migration Plan

## 24. Testing Plan

## 25. Load / Scale Plan

## 26. Browser QA Plan

## 27. Deployment Plan

## 28. Git / Commit Strategy

## 29. Required Access and Credentials

## 30. Human Decisions Required

## 31. Risks and Mitigations

## 32. First Vertical Slice

## 33. Definition of Done

## 34. Recommended Implementation Order

==================================================
16. IMPORTANT: DO NOT IMPLEMENT YET
==================================================

At this stage, you are NOT authorized to begin implementing the plan.

Do not:

- modify production code
- modify the database
- run destructive migrations
- deploy Cloud Run
- modify production infrastructure
- delete Railway services
- change production environment variables
- create production resources
- rotate credentials
- alter authentication in production
- modify production data

The purpose of this phase is planning and understanding.

You may inspect the repository and existing configuration as necessary to understand the implementation requirements.

==================================================
17. FINAL RESPONSE AFTER ANALYSIS
==================================================

When you have finished the analysis and created:

docs/61_ORQ8_MASTER_IMPLEMENTATION_PLAN.md

DO NOT immediately begin development.

Instead, report back to me with:

1. The location of the generated plan.

2. A concise summary of what you found.

3. The major architectural decisions.

4. The major conflicts or outdated instructions you found.

5. The complete implementation phases.

6. The dependencies between phases.

7. Everything I need to provide before implementation can begin.

8. Any credentials, accounts, infrastructure, integrations or access you need.

9. Any decisions you need me to make.

10. The recommended first implementation slice.

11. Any risks that could materially affect the implementation.

12. What you recommend we review together before giving you permission to start coding.

STOP AFTER THIS.

Do not start implementation until I have:

- reviewed the master plan
- answered the required decisions
- provided the required access
- confirmed the implementation order
- explicitly told you to begin

==================================================
FINAL PRINCIPLE
==================================================

Take your time.

The goal is not to produce a short summary.

The goal is to understand everything contained in:

the source material in PART 2 of this file (the complete, unabridged ORQ8 prompt set)

and transform it into one coherent, technically realistic, dependency-aware implementation plan for ORQ8.

Think like the lead architect and technical program manager for the entire ORQ8 build.

Do not lose requirements simply because they are difficult.

Do not invent requirements that are not supported by the source material.

Do not blindly follow outdated instructions.

Do not start coding before the plan has been reviewed.

The final output should allow us to go from:

"Here is everything we have discussed"

to:

"Here is exactly what we are building, in what order, why that order exists, what each phase requires, how we will test it, what access is needed, and what must be true before the next phase begins."

Only after that plan has been reviewed and approved should implementation begin.


================================================================================
PART 2 — COMPLETE SOURCE MATERIAL (READ IN FULL; DO NOT SKIM)
================================================================================


====================================================================================================
SECTION 1 — SECURITY AND USER EXPERIENCE TESTING PROGRAM (STRIX)
====================================================================================================

# ORQ8 — FULL STRIX SECURITY + USER EXPERIENCE TESTING

## ROLE

Act as the principal security engineer, application security engineer, senior QA engineer, and product reliability engineer for ORQ8.

We are going to use **Strix** as a serious external security and application-testing layer for ORQ8.

Do not treat this as a simple vulnerability scan.

Run a comprehensive test against the actual ORQ8 application, identify the issues, understand their root causes, fix them properly, and then run Strix again to verify that the fixes actually worked.

Strix should be treated as an adversarial tester, not as a checklist generator.

The objective is:

> **Attack ORQ8 the way a real attacker or malicious user would, identify exploitable weaknesses, fix them, retest them, and leave the application in a materially stronger state.**

---

# 1. FIRST: INSPECT THE CURRENT ORQ8 SYSTEM

Before running tests, inspect the current implementation and understand:

* frontend
* backend
* API routes
* authentication
* authorization
* database
* Supabase
* Vercel deployment
* environment configuration
* middleware
* admin functionality
* organization isolation
* Executive Agent
* AI/model routing
* jobs
* approvals
* budgets
* credits/tokens
* files
* integrations
* webhooks
* OAuth
* GitHub functionality
* external API calls
* server-side actions
* client-side actions
* upload functionality
* error handling
* logging
* analytics
* realtime functionality
* background jobs
* scheduled jobs

Do not assume that because something works in the UI it is secure.

Test the underlying API and authorization boundaries directly.

---

# 2. USE STRIX PROPERLY

Use the current Strix workflow appropriate to the available environment.

Strix supports autonomous testing where agents enumerate the target, investigate, chain potential weaknesses, validate exploitability and preserve evidence. Use that capability rather than treating it as a passive scanner.

Use the official Strix tooling/workflow where available.

If the project environment supports the Strix skills/workflows, use them rather than inventing a custom process.

The relevant Strix workflows include:

* penetration testing
* managed pentesting
* fixing security vulnerabilities
* CI security scanning
* application security testing
* web application penetration testing

Use the appropriate workflow for ORQ8's environment.

---

# 3. DEFINE A STRICT TEST SCOPE

Only test systems that we own or are explicitly authorized to test.

Primary target:

## ORQ8

Test:

* production application where safe and explicitly authorized
* staging environment if available
* API surface
* authenticated application
* unauthenticated application
* relevant repositories
* exposed services
* integrations
* authentication flows

Do NOT attack unrelated third-party systems.

Do NOT perform destructive testing against production.

Do NOT intentionally:

* delete production data
* destroy infrastructure
* perform denial-of-service attacks
* exhaust paid resources
* send large volumes of external messages
* modify customer data
* access unrelated third-party systems

Where a vulnerability could have destructive consequences, demonstrate it safely and stop before causing damage.

---

# 4. TEST BOTH UNAUTHENTICATED AND AUTHENTICATED SURFACES

Test ORQ8 from the perspective of:

### Anonymous attacker

What can an unauthenticated visitor access?

### Normal authenticated user

What can an ordinary user access?

### Organization member

Can the user access another organization's resources?

### Organization administrator

Can administrative permissions be escalated?

### Platform administrator

Are platform-level privileges properly isolated?

### Malicious employee/agent

Can an AI employee or compromised session bypass organizational controls?

Test privilege boundaries aggressively.

---

# 5. AUTHENTICATION TESTING

Test:

* registration
* login
* logout
* email verification
* password reset
* resend verification
* session management
* session expiration
* refresh tokens
* cookie security
* CSRF protection where applicable
* brute-force protections
* rate limiting
* account enumeration
* authentication bypass
* OAuth
* OAuth callback handling
* redirect handling
* session fixation
* privilege persistence after logout
* revoked sessions
* concurrent sessions

Pay particular attention to previously identified authentication/API behavior.

Verify that every authentication path behaves consistently in production.

---

# 6. AUTHORIZATION TESTING

This is one of the highest-priority areas.

Test for:

* IDOR
* BOLA
* broken object-level authorization
* broken function-level authorization
* horizontal privilege escalation
* vertical privilege escalation
* organization boundary bypass
* admin boundary bypass
* department access bypass
* team access bypass
* agent access bypass
* job access bypass
* goal access bypass
* approval access bypass
* report access bypass
* audit log access bypass
* memory access bypass
* budget access bypass
* file access bypass

Attempt to manipulate identifiers such as:

* organization IDs
* user IDs
* agent IDs
* team IDs
* department IDs
* job IDs
* goal IDs
* approval IDs
* file IDs
* report IDs

Never assume the frontend protects these resources.

Every sensitive API endpoint must independently verify authorization.

---

# 7. MULTI-TENANT ISOLATION

ORQ8 is an organizational SaaS platform.

Therefore tenant isolation is critical.

Create/test separate organizations where possible.

Verify:

> User A cannot access Organization B.

Test this through:

* UI
* API
* direct requests
* modified IDs
* query parameters
* body parameters
* path parameters
* realtime channels
* file storage
* database-backed endpoints
* search
* reports
* memory
* jobs
* audit data

A frontend filter is NOT sufficient.

The backend/database must enforce isolation.

---

# 8. EXECUTIVE AGENT SECURITY

Treat the Executive Agent as a high-value attack surface.

Test:

* prompt injection
* indirect prompt injection
* malicious company documents
* malicious tool output
* malicious web content
* instruction hierarchy manipulation
* system prompt extraction
* secret extraction
* cross-user context leakage
* cross-organization memory leakage
* unauthorized tool execution
* unauthorized financial actions
* unauthorized job creation
* unauthorized agent creation
* unauthorized agent modification
* approval bypass
* authority bypass
* tool permission escalation

Try to convince the EA to:

* reveal secrets
* reveal system instructions
* access another organization
* bypass approval
* spend credits
* modify permissions
* create unauthorized employees
* execute forbidden actions
* call tools outside its authority
* expose private company memory

The goal is to verify that the EA is genuinely governed by the ORQ8 authority model.

---

# 9. AI TOOL SECURITY

For every AI-accessible tool, test:

**Agent → Permission → Tool → Action**

Verify that an agent cannot simply request a tool that it has not been granted.

Test:

* tool authorization
* parameter validation
* command injection
* SSRF
* path traversal
* arbitrary file access
* arbitrary command execution
* unsafe URL fetching
* credential exposure
* webhook abuse
* external API abuse
* tool impersonation

An agent's natural-language instruction must NEVER be considered authorization.

---

# 10. FILE SECURITY

Test:

* upload restrictions
* MIME validation
* file extension validation
* file size limits
* malicious file handling
* path traversal
* unauthorized downloads
* cross-organization downloads
* signed URL security
* storage permissions
* filename injection
* executable file handling
* SVG/script injection
* document-based prompt injection

Verify that uploaded documents cannot manipulate the EA into violating system rules.

---

# 11. API SECURITY

Enumerate all API endpoints.

For each endpoint determine:

* authentication requirement
* authorization requirement
* accepted parameters
* validation
* rate limits
* sensitive information returned
* organization scoping
* error behavior

Test for:

* injection
* IDOR
* SSRF
* command injection
* SQL injection where applicable
* NoSQL injection where applicable
* path traversal
* mass assignment
* parameter pollution
* unsafe deserialization
* excessive data exposure
* improper error handling
* missing authorization
* rate-limit bypass

---

# 12. DATABASE SECURITY

Review:

* Supabase policies
* RLS
* service-role usage
* server-side database access
* client-side queries
* organization scoping
* admin queries

Verify that no client-accessible mechanism can bypass tenant isolation.

Pay particular attention to service-role keys.

They must NEVER be exposed to browser/client code.

---

# 13. SECRETS AND ENVIRONMENT VARIABLES

Search for:

* API keys
* model provider keys
* Supabase keys
* service-role credentials
* GitHub tokens
* OAuth secrets
* Railway credentials
* OpenRouter keys
* NVIDIA NIM keys
* webhook secrets
* database credentials

Check:

* source code
* client bundles
* Git history
* logs
* error messages
* API responses
* browser storage
* network responses

No secret should be exposed unnecessarily.

If a credential is discovered to be compromised, do not merely report it.

Immediately identify the required rotation/revocation procedure and implement the safe remediation where authorized.

---

# 14. AI COST / TOKEN ABUSE

This is particularly important for ORQ8.

Attempt to determine whether an attacker can cause:

* unlimited EA calls
* unlimited model calls
* token exhaustion
* credit exhaustion
* expensive model selection
* repeated job creation
* recursive agent spawning
* runaway loops
* repeated failed jobs
* denial of wallet/credit availability

Test whether a malicious user can manipulate:

* model
* token limits
* job frequency
* agent count
* recursion
* tool calls
* retries

The system must enforce server-side limits.

Do not rely on frontend credit displays.

---

# 15. JOB / AGENT EXECUTION SECURITY

Test whether users can manipulate jobs to:

* execute unauthorized work
* impersonate another agent
* change another user's job
* change organization ownership
* bypass approvals
* bypass budgets
* run forbidden tools
* alter job results
* mark work as completed without execution
* manipulate execution state

The backend must treat job state as trusted server state, not user-controlled state.

---

# 16. ADMIN SECURITY

Test the admin system separately.

Verify:

* admin authentication
* admin authorization
* platform admin isolation
* admin route protection
* direct URL access
* API access
* privilege escalation
* admin session behavior
* admin/user separation

Pay special attention to the previously identified issue where admin UI behavior could redirect incorrectly into the normal user dashboard.

Do not assume that because the UI hides admin features they are protected.

---

# 17. COMMON WEB APPLICATION ATTACKS

Run comprehensive checks for relevant OWASP-style vulnerabilities, including:

* XSS
* stored XSS
* reflected XSS
* CSRF
* SSRF
* SQL injection
* command injection
* path traversal
* open redirects
* authentication bypass
* authorization bypass
* insecure direct object references
* insecure file upload
* security misconfiguration
* sensitive information disclosure
* weak session handling
* rate-limit bypass
* business logic flaws

Also test business-logic vulnerabilities that automated scanners may miss.

---

# 18. BUSINESS LOGIC TESTING

Do not limit testing to technical vulnerabilities.

Ask:

> Can a malicious user abuse ORQ8's business rules?

Test things such as:

* bypassing approval requirements
* manipulating budgets
* gaining extra credits
* creating unlimited agents
* creating unlimited jobs
* bypassing plan restrictions
* manipulating usage counters
* manipulating company ownership
* changing employee authority
* bypassing forbidden actions
* falsely completing work
* changing audit history
* accessing historical data belonging to another company

This is extremely important for ORQ8 because its product is an organizational control system.

---

# 19. USER EXPERIENCE / USER TESTING

Security is only half of this exercise.

Also evaluate ORQ8 as a real user.

Test:

### New user

Register → verify → login → dashboard → onboarding → EA → company setup.

### Existing user

Login → dashboard → company overview → EA → goals → jobs → approvals.

### Founder

Can the founder understand:

* what is happening
* what needs approval
* what the company is working on
* what the EA recommends
* how much AI usage is being consumed

### Mobile user

Check:

* navigation
* EA launcher
* dashboard
* onboarding
* forms
* approvals
* tables
* responsive layout

Do not only check whether elements technically render.

Check whether the workflow makes sense.

---

# 20. STRIX FINDING TRIAGE

After the initial Strix run, create a complete findings inventory.

For every finding record:

* severity
* confidence
* affected component
* affected endpoint
* exploitability
* proof/evidence
* root cause
* impact
* remediation
* regression risk
* verification method

Classify:

### Critical

Immediate security risk.

### High

Significant exploitable security issue.

### Medium

Meaningful weakness requiring remediation.

### Low

Hardening or limited-impact issue.

### Informational

No immediate vulnerability but useful security observation.

Do not inflate severity.

Do not dismiss a finding without validating it.

---

# 21. FIX EVERYTHING THAT IS ACTUALLY VALID

Do not simply produce a security report.

For every confirmed vulnerability:

1. Understand the root cause.
2. Implement the proper fix.
3. Add appropriate validation.
4. Add or update tests.
5. Check for similar vulnerable patterns elsewhere.
6. Run the relevant application tests.
7. Run the relevant security test again.
8. Confirm the vulnerability is no longer exploitable.

Do NOT apply superficial patches that only block Strix's exact payload.

Fix the underlying vulnerability class.

---

# 22. DO NOT BREAK FUNCTIONALITY

Security fixes must preserve legitimate behavior.

After each significant remediation verify:

* authentication
* dashboard
* onboarding
* EA
* organizations
* departments
* teams
* agents
* jobs
* goals
* approvals
* budgets
* reports
* memory
* audit
* integrations

Do not sacrifice core functionality simply to make a scanner pass.

---

# 23. RUN STRIX AGAIN AFTER FIXES

This is mandatory.

The workflow is:

```text
Initial Strix Test
        ↓
Findings
        ↓
Triage
        ↓
Fix
        ↓
Application Tests
        ↓
Strix Retest
        ↓
Verify Exploit Is Gone
        ↓
Regression Testing
        ↓
Final Security Report
```

A vulnerability should not be marked resolved merely because code was changed.

It should be marked resolved when the exploit has been retested and no longer works.

Strix explicitly supports this find → fix → retest workflow, including preserving exploit context and validating the fix.

---

# 24. LOOK FOR REGRESSIONS

After fixing findings, search for the same vulnerability pattern elsewhere.

For example:

If one API has an IDOR:

Do not only fix that endpoint.

Search the entire codebase for similar authorization patterns.

If one upload endpoint allows unsafe files:

Inspect all upload endpoints.

If one organization query lacks tenant filtering:

Inspect all organization-scoped queries.

Fix systemic problems systemically.

---

# 25. FINAL SECURITY GATE

Do not finish until:

* critical findings are resolved
* high findings are resolved
* confirmed medium findings are resolved or explicitly justified
* authentication has been tested
* authorization has been tested
* tenant isolation has been tested
* EA security has been tested
* tool permissions have been tested
* token/credit abuse has been tested
* secrets have been reviewed
* file security has been tested
* API security has been tested
* admin security has been tested
* production configuration has been reviewed
* Strix has been rerun
* fixes have been verified
* application regression tests pass

---

# 26. FINAL REPORT

Produce a complete final report containing:

## Executive summary

Overall security posture.

## Strix run information

* target
* environment
* scope
* test duration
* test coverage

## Findings

For each:

* title
* severity
* evidence
* affected component
* root cause
* impact
* remediation
* status

## Fixed vulnerabilities

List every vulnerability successfully remediated.

## Retested vulnerabilities

Show which findings were retested and the verification result.

## Remaining issues

Be explicit.

Do not hide unresolved findings.

## User experience findings

List usability problems discovered during the user journey.

## Performance/reliability findings

List:

* slow operations
* failed requests
* hanging operations
* broken states
* timeout issues

## AI-specific findings

Include:

* prompt injection
* tool abuse
* data leakage
* token abuse
* model routing abuse
* agent privilege escalation
* memory leakage

## Recommendations

Separate:

### Must fix

### Should fix

### Future hardening

---

# 27. IMPORTANT: DO NOT JUST GIVE ME A REPORT

The objective is:

> **TEST → FIND → FIX → RETEST → VERIFY**

Not:

> TEST → REPORT

If you find a valid issue that you can safely fix, fix it.

If the fix requires a human decision, clearly explain the exact decision required.

If a production fix could be dangerous, implement and validate it in the safest available environment before applying it to production.

---

# 28. PRODUCTION READINESS RESULT

At the end, give ORQ8 one of these statuses:

### SECURITY READY

No critical/high vulnerabilities remain and the application passed the required retests.

### SECURITY READY WITH CONDITIONS

No critical vulnerabilities remain, but explicitly documented medium/low risks remain.

### NOT SECURITY READY

A critical/high issue remains or a critical security control has not been successfully validated.

Do not call ORQ8 secure simply because Strix completed a run.

The conclusion must be based on the actual evidence.

---

# 29. FINAL PRINCIPLE

Treat ORQ8 as a real production SaaS handling:

* company information
* organizational data
* AI execution
* business decisions
* credentials
* integrations
* financial/usage limits
* private memory
* potentially sensitive documents

Therefore security must be treated as part of the architecture, not a final checkbox.

The final objective is:

> **Make ORQ8 difficult to compromise, difficult to abuse, difficult to cause uncontrolled AI spending, difficult to cross organization boundaries, and difficult to make perform unauthorized actions.**

Then prove that through Strix, application testing, regression testing, and a final retest.


====================================================================================================
SECTION 2 — MODEL INFRASTRUCTURE, OPENROUTER, AND ADMIN USAGE CONTROL
====================================================================================================

# ORQ8 MODEL INFRASTRUCTURE + OPENROUTER + ADMIN USAGE CONTROL MASTER PROMPT

You are working on ORQ8, an AI operating system for running a company with AI employees.

Your task is to implement and stabilize the complete AI model infrastructure across the entire ORQ8 system using OpenRouter as the initial model gateway, while also building a proper internal admin observability and usage system.

This is NOT just an API-key integration.

The objective is to make model access a reliable platform-level infrastructure service that every part of ORQ8 can use consistently, securely, measurably, and replaceably.

The final architecture should allow ORQ8 to use OpenRouter today while keeping the application provider/model agnostic so we can later support other providers without rewriting the product.

==================================================
1. FIRST: AUDIT THE EXISTING SYSTEM
==================================================

Before changing code, inspect the entire existing ORQ8 codebase.

Do NOT immediately start rewriting things.

Find and document:

- Current AI/LLM calls
- Current model providers
- Current OpenAI/Anthropic/Gemini/etc integrations
- Existing model router
- Existing Railway services
- Existing API routes
- Existing server actions
- Existing background jobs
- Existing agent runtime
- Executive Agent implementation
- AI employee execution
- Decision/Reasoning systems
- Chat interfaces
- Tool execution
- MCP execution
- Engineering agents
- Research agents
- Any direct SDK calls
- Any frontend calls to model providers
- Environment variables
- Secrets handling
- Database schema
- Existing usage tracking
- Existing billing/credits implementation
- Existing admin dashboard
- Existing organization/company model
- Existing user model
- Existing agent model
- Existing task model
- Existing realtime infrastructure

Search the entire repository for things such as:

- openai
- anthropic
- gemini
- openrouter
- chat completion
- responses
- generateText
- streamText
- model
- provider
- API keys
- LLM
- tokens
- usage
- credits
- inference
- AI calls
- agent execution
- model router

Do not assume there is only one AI execution path.

Create a map of every location where ORQ8 currently invokes AI.

The goal is to eliminate fragmented model access.

==================================================
2. TARGET ARCHITECTURE
==================================================

Implement this architecture:

ORQ8 APPLICATION
        ↓
ORQ8 AI RUNTIME
        ↓
ORQ8 MODEL GATEWAY
        ↓
POLICY / ROUTING / USAGE LAYER
        ↓
OPENROUTER
        ↓
MODEL PROVIDER
        ↓
MODEL
        ↓
RESPONSE
        ↓
USAGE + COST + PERFORMANCE LOGGING
        ↓
ORQ8 AI RUNTIME

The rest of ORQ8 should NOT directly depend on OpenRouter.

For example:

WRONG:

Agent → OpenRouter

EA → OpenRouter

Decision Council → OpenRouter

Chat → OpenRouter

Research → OpenRouter

Instead:

Agent → ORQ8 Model Gateway
EA → ORQ8 Model Gateway
Decision Council → ORQ8 Model Gateway
Chat → ORQ8 Model Gateway
Research → ORQ8 Model Gateway

The Model Gateway decides how the request is fulfilled.

==================================================
3. OPENROUTER CONFIGURATION
==================================================

Configure OpenRouter as the initial provider.

Use a server-side environment variable:

OPENROUTER_API_KEY

Never expose this key to:

- browser
- client components
- frontend JavaScript
- public API responses
- logs
- analytics events
- database records

The browser must never know the OpenRouter key.

All model calls must go through a trusted server-side ORQ8 service.

If the project already has Railway model-router infrastructure, inspect it and determine whether it should become the canonical model gateway.

Do not create a second competing model router unnecessarily.

Reuse and improve the existing infrastructure where appropriate.

==================================================
4. MODEL GATEWAY
==================================================

Create or standardize a central ORQ8 Model Gateway.

Conceptually:

ORQ8ModelGateway

Responsibilities:

- authenticate model requests
- select provider
- select model
- apply routing policy
- apply organization policy
- apply agent policy
- apply budget policy
- apply credit policy
- apply rate limits
- send request
- support streaming
- capture usage
- capture cost
- capture latency
- capture errors
- capture provider
- capture model
- attach organization context
- attach user context
- attach agent context
- attach department context
- attach task context
- attach workstream context
- attach request type
- record outcome
- handle retries
- handle fallback models
- normalize provider responses

The rest of ORQ8 should interact with this abstraction rather than directly calling OpenRouter.

==================================================
5. STANDARD MODEL REQUEST
==================================================

Create a consistent internal request structure.

Conceptually:

{
  organizationId,
  userId,
  agentId,
  departmentId,
  taskId,
  workstreamId,
  requestType,
  model,
  provider,
  messages,
  tools,
  temperature,
  maxTokens,
  reasoning,
  streaming,
  priority,
  metadata
}

Do not blindly copy this exact structure if the existing architecture already has a better abstraction.

The important requirement is that every model request carries enough context to understand:

WHO initiated it?

WHICH COMPANY?

WHICH USER?

WHICH AGENT?

WHICH DEPARTMENT?

WHICH TASK?

WHICH WORKSTREAM?

WHAT TYPE OF AI WORK?

WHICH MODEL?

WHICH PROVIDER?

HOW MUCH DID IT COST?

WHAT WAS THE RESULT?

==================================================
6. MODEL CATALOG
==================================================

Create a centralized model configuration system.

Do not hard-code model names throughout the application.

For example:

Model Catalog

- provider
- model ID
- display name
- capability
- context window
- reasoning capability
- tool support
- vision support
- streaming support
- input cost
- output cost
- enabled/disabled
- default/backup status
- allowed organizations
- allowed plans

The application should refer to logical capabilities where possible.

For example:

fast_general
reasoning
coding
research
vision
cheap_background
premium_reasoning

The router can then select the actual OpenRouter model.

This makes changing models much easier.

==================================================
7. MODEL ROUTING
==================================================

Build a routing layer.

Example:

EA conversation:
→ general/premium model

Simple classification:
→ cheap/fast model

Code generation:
→ coding model

Deep strategic analysis:
→ reasoning model

Research:
→ research-capable model

Background summarization:
→ cheap model

Decision Council:
→ multiple independent model calls where appropriate

Do not over-engineer this.

Start with a clean routing abstraction that can evolve.

The model router should consider:

- task type
- model capability
- cost
- latency
- context requirements
- tool support
- reliability
- availability
- organization plan
- credit balance
- configured model preferences

==================================================
8. PROVIDER ABSTRACTION
==================================================

OpenRouter is the first provider.

Do NOT make ORQ8 dependent on OpenRouter-specific response structures throughout the codebase.

Create a provider abstraction.

Conceptually:

ModelProvider

Methods such as:

- generate
- stream
- embed
- healthCheck
- getUsage

Then:

OpenRouterProvider

implements:

ModelProvider

Future providers could include:

- OpenAI
- Anthropic
- Google
- Azure
- local models
- enterprise providers

The rest of ORQ8 should not need to change when another provider is introduced.

==================================================
9. STREAMING
==================================================

Make model streaming work correctly.

EA responses should stream.

Chat responses should stream.

Long-running reasoning should provide appropriate progress.

Do not make the UI appear frozen while a model is working.

Handle:

- connection drops
- timeout
- partial response
- provider failure
- retry
- cancellation
- user navigation
- duplicate requests

Make sure streaming does not result in duplicated usage records.

==================================================
10. RETRIES + FALLBACKS
==================================================

Implement reliable failure handling.

If OpenRouter temporarily fails:

1. retry where safe
2. use exponential backoff
3. avoid duplicate side effects
4. use fallback model if configured
5. report failure clearly

Never silently execute expensive repeated requests.

Distinguish:

- provider unavailable
- model unavailable
- rate limit
- timeout
- invalid request
- authentication failure
- insufficient credits
- organization limit
- tool failure
- internal ORQ8 failure

The user should receive a meaningful error.

Example:

"ORQ8 couldn't complete this task because the selected model is temporarily unavailable. No action was taken."

Not:

"Something went wrong."

==================================================
11. CREDIT SYSTEM
==================================================

ORQ8 customer-facing usage should use:

ORQ8 Credits

Do NOT expose "tokens" as the primary customer-facing usage unit.

Raw token usage can exist internally.

The model gateway should capture:

- input tokens
- output tokens
- reasoning tokens if available
- cached tokens if available
- provider cost
- ORQ8 credit consumption

Example:

OpenRouter reports:

input tokens
output tokens
provider cost

ORQ8 converts that into:

ORQ8 Credits consumed

The exact conversion should be configurable.

Do NOT hard-code economics throughout the application.

Create a centralized credit calculation service.

Example:

CreditCalculator

Input:

- model
- provider
- input usage
- output usage
- reasoning usage
- request type

Output:

- credits consumed
- provider cost
- internal cost
- billable cost

Initial business concept:

1,000 ORQ8 Credits ≈ $9

But make this configurable.

==================================================
12. CREDIT RESERVATION
==================================================

Prevent users from starting work they cannot afford.

For expensive/background operations:

1. estimate cost
2. reserve credits
3. execute
4. record actual usage
5. settle the reservation
6. return unused credits

If execution fails before meaningful model usage, release the reservation where appropriate.

Avoid double charging.

==================================================
13. ORGANIZATION USAGE TRACKING
==================================================

Every AI request must be associated with an organization/company.

Track organization-level:

- total requests
- successful requests
- failed requests
- credits consumed
- provider cost
- estimated revenue
- input tokens
- output tokens
- reasoning usage
- model usage
- provider usage
- agent usage
- department usage
- task usage
- workstream usage
- request type
- latency
- errors
- retries
- fallback usage

The organization should have a complete AI usage ledger.

==================================================
14. USER-LEVEL USAGE
==================================================

Track usage per human user.

Admin should be able to see:

User
Organization
Requests
Credits
Cost
Models
Agents used
Departments
Tasks
Last activity
Errors
Average latency

This is especially important for identifying unusual usage.

==================================================
15. AGENT-LEVEL USAGE
==================================================

Track AI employee usage separately.

For every agent:

- requests
- credits consumed
- provider cost
- models used
- tasks executed
- successful tasks
- failed tasks
- average latency
- average request size
- tool calls
- background work
- department
- workstreams

This should answer:

"Which AI employee is consuming the most execution capacity?"

==================================================
16. DEPARTMENT USAGE
==================================================

Track usage by department.

Example:

Engineering
Marketing
Sales
Finance
Operations
Product

Admin should be able to answer:

Which department consumes the most Credits?

Which department generates the most AI work?

Which department has the most failures?

Which department uses expensive models?

Which department has the highest execution cost?

==================================================
17. REQUEST TYPES
==================================================

Create standardized request categories.

Examples:

EA_CHAT
AGENT_TASK
BACKGROUND_TASK
RESEARCH
DECISION
CODE_GENERATION
CODE_REVIEW
SUMMARIZATION
CLASSIFICATION
TOOL_USE
WORKFLOW
REPORT_GENERATION
MEMORY
EMBEDDING
VISION
OTHER

Do not allow every developer to invent random categories.

Centralize these.

==================================================
18. MODEL USAGE ADMIN DASHBOARD
==================================================

Build a real ORQ8 Admin model/usage dashboard.

This is NOT the normal founder dashboard.

This is internal ORQ8 administration.

Admin dashboard should show:

--------------------------------
GLOBAL ORQ8 AI USAGE
--------------------------------

Total organizations
Active organizations
Active users
Active AI employees
AI requests today
AI requests this month
Credits consumed
Provider cost
Estimated revenue
Average latency
Error rate
Fallback rate

--------------------------------
MODEL USAGE
--------------------------------

Model
Provider
Requests
Credits
Raw tokens
Cost
Average latency
Success rate
Error rate

--------------------------------
ORGANIZATION USAGE
--------------------------------

Organization
Users
Agents
Requests
Credits
Cost
Last activity

--------------------------------
USER USAGE
--------------------------------

User
Organization
Requests
Credits
Cost
Last active

--------------------------------
AGENT USAGE
--------------------------------

Agent
Organization
Department
Requests
Credits
Cost
Tasks
Failures

--------------------------------
DEPARTMENT USAGE
--------------------------------

Department
Organization
Requests
Credits
Cost
Tasks

--------------------------------
REQUEST TYPE
--------------------------------

EA
Agent
Research
Coding
Decision
Background
etc.

==================================================
19. TIME SERIES ANALYTICS
==================================================

Admin should be able to switch:

Today
7 days
30 days
90 days
Custom

Charts:

Requests over time
Credits over time
Cost over time
Errors over time
Latency over time
Model usage
Provider usage

Do not create meaningless charts.

Every visualization should answer an operational question.

==================================================
20. COST ANALYTICS
==================================================

Build internal cost visibility.

Track:

Provider cost
ORQ8 Credits consumed
Customer subscription revenue
Credit revenue
Estimated gross margin
Cost per organization
Cost per active user
Cost per agent
Cost per task
Cost per request

Do not expose internal financial metrics to normal users unless intentionally designed.

Admin should be able to identify:

High-cost organizations
High-cost agents
High-cost models
High-cost workflows
Unexpected spending
Abnormal usage

==================================================
21. MODEL HEALTH
==================================================

Build model/provider health monitoring.

Track:

Availability
Latency
Error rate
Timeout rate
Rate limits
Fallback frequency
Recent failures

Admin should see:

OPENROUTER
├── Provider status
├── Requests
├── Success rate
├── Errors
├── Latency
└── Cost

MODEL
├── Requests
├── Success
├── Errors
├── Average latency
└── Cost

If a model starts failing, ORQ8 should be able to route around it when configured.

==================================================
22. USAGE ANOMALY DETECTION
==================================================

Create basic anomaly detection.

Flag:

- sudden request spikes
- abnormal credit consumption
- repeated failures
- unusually expensive model usage
- runaway agent loops
- repeated identical requests
- excessive background work
- unexpected organization activity

Do not automatically punish users without clear policy.

Surface anomalies to administrators.

==================================================
23. RUNAWAY EXECUTION PROTECTION
==================================================

This is extremely important.

An AI agent must never accidentally create an infinite model-call loop.

Implement safeguards:

- max iterations
- max model calls per task
- max credits per task
- max credits per agent
- max background execution budget
- request timeout
- retry limit
- workflow timeout
- organization daily/monthly limits
- emergency kill switch

These must be enforced server-side.

==================================================
24. ADMIN CONTROLS
==================================================

Admin should be able to:

- enable/disable provider
- enable/disable model
- set default model
- configure fallback model
- configure model routing
- configure credit multipliers
- set organization limits
- set user limits
- set agent limits
- pause expensive models
- view active requests
- inspect failed requests
- inspect usage
- inspect costs
- inspect logs
- disable runaway agents
- disable an organization if necessary
- replay safe failed requests where appropriate

Dangerous controls require confirmation.

Never allow a UI toggle to bypass server-side authorization.

==================================================
25. ORGANIZATION MODEL SETTINGS
==================================================

Organizations should eventually be able to have settings such as:

Default model
Preferred model
Maximum model tier
Autonomy level
Credit budget
Monthly credit limit
Background execution allowance
Department budgets
Agent budgets

Example:

Engineering:
$X / month

Marketing:
$Y / month

Research:
$Z / month

If an agent reaches its configured budget, it should pause or request approval according to policy.

==================================================
26. AGENT BUDGETS
==================================================

Each AI employee can have:

Monthly credit budget
Per-task budget
Per-request limit
Background budget
Premium-model allowance

Example:

Engineering Agent

Monthly:
10,000 Credits

Per task:
500 Credits

Premium model:
Requires approval above threshold

This should integrate with ORQ8's existing authority system.

==================================================
27. MODEL PERMISSION SYSTEM
==================================================

Model selection itself can be governed.

Example:

Founder/EA:
Premium models allowed

Junior background agent:
Fast/cheap models

Finance:
Premium reasoning above certain threshold

Research:
Research model

This should be policy-driven.

Never trust a model to decide its own authority.

==================================================
28. DATABASE / USAGE LEDGER
==================================================

Create a durable usage ledger.

Possible conceptual entities:

ai_requests
ai_usage_events
ai_model_usage
ai_provider_usage
credit_ledger
credit_reservations
model_catalog
provider_config
organization_ai_usage
user_ai_usage
agent_ai_usage
department_ai_usage
ai_errors
ai_anomalies

Do not blindly create all these tables if the current schema has a better structure.

Avoid duplicated sources of truth.

The usage ledger must be append-oriented and auditable.

Do not simply store a mutable "total usage" counter.

Totals should be derived or safely aggregated from durable usage events.

==================================================
29. USAGE EVENT
==================================================

Every completed model request should produce a structured event.

Conceptually:

{
  requestId,
  organizationId,
  userId,
  agentId,
  departmentId,
  taskId,
  workstreamId,
  requestType,
  provider,
  model,
  startedAt,
  completedAt,
  durationMs,
  status,
  inputTokens,
  outputTokens,
  reasoningTokens,
  providerCost,
  creditsConsumed,
  retryCount,
  fallbackUsed,
  errorCode,
  metadata
}

Never store secrets in metadata.

==================================================
30. PRIVACY + SECURITY
==================================================

Never log:

- API keys
- OAuth secrets
- passwords
- access tokens
- private credentials
- sensitive tool credentials

Be careful with prompts and responses.

Usage analytics should not require storing full prompt content.

Prefer metadata and references.

If prompt/response storage exists, implement appropriate access controls and retention.

Admin access must be protected.

==================================================
31. REQUEST ID + TRACEABILITY
==================================================

Every AI request should have a unique request ID.

Example:

orq8_ai_req_xxxxx

Use this ID across:

- API request
- model gateway
- provider call
- database usage event
- logs
- task
- agent
- admin dashboard

This allows:

Admin → request → organization → agent → task → model → cost → result

This is critical for debugging.

==================================================
32. OBSERVABILITY
==================================================

Implement structured logs.

Example:

AI_REQUEST_STARTED
AI_REQUEST_COMPLETED
AI_REQUEST_FAILED
AI_PROVIDER_ERROR
AI_MODEL_FALLBACK
AI_CREDIT_RESERVED
AI_CREDIT_SETTLED
AI_AGENT_LOOP_LIMIT
AI_BUDGET_EXCEEDED

Include:

requestId
organizationId
agentId
model
provider
duration
status

Never include secrets.

==================================================
33. EA INTEGRATION
==================================================

The Executive Agent must use the same Model Gateway.

EA should NOT have a special direct model connection.

EA request:

Founder
↓
EA
↓
ORQ8 Agent Runtime
↓
Model Gateway
↓
OpenRouter
↓
Model

Usage should automatically be associated with:

organization
founder
EA
task
request type

EA responses should stream.

==================================================
34. AI EMPLOYEE INTEGRATION
==================================================

Every AI employee must use the same gateway.

Example:

Engineering Agent
↓
Agent Runtime
↓
Model Gateway
↓
OpenRouter
↓
Coding Model

Marketing Agent
↓
Agent Runtime
↓
Model Gateway
↓
Marketing-capable model

Do not create separate API clients for each agent.

==================================================
35. DECISION CENTER INTEGRATION
==================================================

Decision Council must also use the central gateway.

If a decision requires multiple models:

Decision
↓
Model Gateway
├── Model A
├── Model B
├── Model C
└── Model D
↓
Evaluation
↓
Synthesis
↓
Founder approval if required

Every individual model call must be tracked.

The entire decision should also have a parent request/workflow ID.

Admin should be able to see:

Decision
→ models used
→ calls
→ credits
→ cost
→ duration
→ final result

==================================================
36. BACKGROUND JOBS
==================================================

Background AI work must use the same system.

Examples:

- scheduled research
- memory processing
- summaries
- reports
- monitoring
- agent continuation
- workflow execution

No hidden direct model calls.

Everything goes through the gateway.

==================================================
37. FRONTEND MODEL UX
==================================================

Normal founders should not see raw provider internals unless useful.

Do not show:

"GPT token count: 18,293"

as the primary experience.

Instead:

"2,340 ORQ8 Credits used"

Optionally:

"Estimated provider cost: internal"

For admin:

show full technical detail.

==================================================
38. ORQ8 CREDITS UI
==================================================

Founder-facing UI should show:

Credits available
Credits used
Estimated remaining
Usage by department
Usage by agent
Usage by workstream
Usage over time
Recent usage

Example:

ORQ8 Credits

Available:
18,420

Used this month:
6,580

Estimated remaining:
11,840

Engineering:
2,840

Research:
1,420

Marketing:
920

Other:
1,400

Make this understandable.

==================================================
39. ADMIN SYSTEM
==================================================

Review the existing admin page.

Do not simply add another dashboard card.

Turn it into an actual ORQ8 operations console.

Suggested sections:

Overview
Organizations
Users
Agents
Model usage
Provider health
Credits
Costs
Requests
Errors
Anomalies
Models
Providers
Limits
Audit
System health

Admin should be able to drill down.

Example:

Organization
→ users
→ agents
→ departments
→ requests
→ models
→ credits
→ cost
→ errors

==================================================
40. ORGANIZATION DETAIL PAGE
==================================================

When admin opens an organization:

Show:

Company information
Plan
Users
AI employees
Departments
Credits
Usage
Cost
Models
Requests
Failures
Active work
Limits
Recent activity

Then allow:

Usage by user
Usage by agent
Usage by department
Usage by model
Usage by request type

==================================================
41. REQUEST INSPECTOR
==================================================

Build an admin request inspector.

For a request:

Request ID
Organization
User
Agent
Department
Task
Workstream
Request type
Provider
Model
Started
Completed
Duration
Status
Input usage
Output usage
Reasoning usage
Provider cost
ORQ8 Credits
Retries
Fallback
Error
Outcome

If safe and permitted, allow viewing relevant request metadata.

Do not expose secrets.

==================================================
42. SYSTEM-WIDE ORQ8 ANALYTICS
==================================================

Admin should be able to answer:

How many AI requests does ORQ8 process?

How many organizations actively use AI?

How many credits are consumed?

What is the provider cost?

Which model is used most?

Which model costs the most?

Which organization consumes the most?

Which agents consume the most?

Which departments consume the most?

What percentage of requests fail?

What percentage use fallback?

What is average latency?

Are costs growing faster than usage?

Are there runaway organizations?

Are there runaway agents?

Are models healthy?

==================================================
43. BILLING INTEGRATION PREPARATION
==================================================

Do not necessarily implement payment processing in this task unless already present.

But make the architecture billing-ready.

Track:

subscription plan
included credits
purchased credits
bonus credits
used credits
remaining credits
credit expiration if applicable
billing period
organization

Credits should have a ledger.

Never mutate usage history.

==================================================
44. TESTING
==================================================

Create tests for:

- valid OpenRouter request
- missing API key
- invalid API key
- provider timeout
- model unavailable
- rate limit
- retry
- fallback
- streaming
- cancellation
- credit reservation
- credit settlement
- insufficient credits
- agent budget
- organization budget
- usage recording
- duplicate request protection
- failed request accounting
- admin analytics
- authorization
- cross-organization isolation

Test multi-tenant security carefully.

Organization A must NEVER see:

Organization B usage.

User A must NEVER access:

User B private usage.

Normal users must NEVER access:

ORQ8 internal admin data.

==================================================
45. LOAD TESTING
==================================================

Do not assume one model request at a time.

Test concurrent:

- EA requests
- agent tasks
- background jobs
- decision councils

Ensure usage accounting remains accurate under concurrency.

No race conditions in:

credits
reservations
budgets
usage
request state

==================================================
46. ENVIRONMENT VARIABLES
==================================================

Inspect the existing environment architecture.

Add only the necessary variables.

At minimum:

OPENROUTER_API_KEY

Potential configuration:

OPENROUTER_BASE_URL

Do not commit secrets.

Update:

.env.example

with placeholders only.

If Railway hosts the model gateway, configure secrets there appropriately.

If Vercel hosts frontend/API routes, ensure the secret is only available server-side.

==================================================
47. DEVELOPMENT / STAGING / PRODUCTION
==================================================

Make environment behavior explicit.

Development:
test provider/model configuration

Staging:
real provider with controlled limits if appropriate

Production:
production API key and limits

Never accidentally use production credentials in local development.

==================================================
48. ADMIN EMERGENCY CONTROLS
==================================================

Provide system-level kill switches.

Examples:

Disable all AI
Disable background AI
Disable premium models
Disable a provider
Disable a specific model
Pause an organization
Pause an agent
Pause background execution

These controls must be server-enforced.

==================================================
49. DO NOT CREATE A SECOND AI SYSTEM
==================================================

This is extremely important.

Before implementing anything:

Find the existing ORQ8 model router.

If one already exists:

IMPROVE IT.

Do not create:

ModelRouter2
AIService2
OpenRouterService2
AgentLLMService2

unless there is a clear architectural reason.

Consolidate duplicate implementations.

==================================================
50. MIGRATION
==================================================

After implementing the central gateway:

Migrate every AI call to it.

Search the entire repository again.

There should be no unexpected direct model provider calls remaining.

Create a final report:

Direct provider calls remaining:
0

Central gateway calls:
X

EA:
Gateway

Agents:
Gateway

Decision system:
Gateway

Background jobs:
Gateway

Research:
Gateway

Engineering:
Gateway

==================================================
51. PERFORMANCE
==================================================

Do not make every model call slower simply because of the gateway.

The gateway should be lightweight.

Avoid unnecessary database calls during every streaming token.

Use asynchronous usage/event processing where safe.

Do not block AI responses on non-critical analytics writes.

Critical credit/budget checks must happen before execution.

Usage settlement can be handled safely after execution where appropriate.

==================================================
52. REALTIME ADMIN UPDATES
==================================================

Admin usage should update without requiring constant full-page refresh.

Use the existing ORQ8 realtime infrastructure where appropriate.

Examples:

A new AI request starts:

Admin:
Active requests +1

Request completes:

Usage updates

Agent consumes credits:

Agent usage updates

Provider fails:

Error count updates

Do not use excessive polling.

==================================================
53. DASHBOARD DESIGN
==================================================

The admin dashboard should feel like an infrastructure operations console.

Not a marketing dashboard.

Not a generic SaaS dashboard.

Use:

- tables
- filters
- drill-downs
- sparklines
- charts where useful
- status indicators
- request timelines
- usage breakdowns

Avoid decorative UI.

Prioritize information density and operational clarity.

==================================================
54. ADMIN FILTERS
==================================================

Support filters:

Organization
User
Agent
Department
Model
Provider
Request type
Status
Date range

Allow combinations.

Example:

"Show failed Engineering agent requests for Organization X using premium models during the last 7 days."

==================================================
55. EXPORT
==================================================

If the existing admin system supports exports, allow usage data to be exported.

CSV is sufficient initially.

Possible exports:

organization usage
user usage
agent usage
model usage
request logs
credit ledger

Respect admin permissions.

==================================================
56. MODEL COST DATA
==================================================

Do not assume provider pricing is static.

Keep model pricing configurable.

If OpenRouter returns actual cost information, record it.

Otherwise use configured pricing.

Record:

pricing source
pricing version
timestamp

This allows historical analysis when pricing changes.

==================================================
57. INTERNAL VS CUSTOMER DATA
==================================================

Separate:

CUSTOMER EXPERIENCE

from

ORQ8 INTERNAL OPERATIONS.

Customer sees:

Credits
Usage
Execution
Performance

Admin sees:

Tokens
Provider cost
Model IDs
Latency
Errors
Retries
Fallback
Internal margins
Infrastructure health

==================================================
58. SECURITY REVIEW
==================================================

After implementation perform a security pass.

Verify:

- API key never reaches client
- API key never appears in logs
- cross-tenant isolation
- admin authorization
- server-side credit enforcement
- server-side model restrictions
- server-side budgets
- no client-controlled provider cost
- no client-controlled credits
- no client-controlled organization ID without verification
- no direct OpenRouter browser calls
- no prompt injection path that can bypass authority
- no model instruction can override ORQ8 policy

==================================================
59. FINAL QA
==================================================

Run the entire application.

Test:

1. Founder logs in
2. Company loads
3. EA opens
4. Founder sends message
5. Request reaches Model Gateway
6. Gateway selects model
7. OpenRouter receives request
8. Response streams
9. EA displays response
10. Usage is recorded
11. Credits are deducted
12. Admin sees usage
13. Agent executes task
14. Agent usage appears
15. Department usage appears
16. Organization usage updates
17. Model usage updates
18. Provider cost updates
19. Errors are visible
20. Fallback works
21. Credit limits work
22. Agent limits work
23. Organization limits work
24. Admin can inspect request
25. No secrets are exposed

==================================================
60. FINAL SYSTEM TEST
==================================================

The following flow must work:

FOUNDER
↓
ORQ8 COMPANY
↓
EXECUTIVE AGENT
↓
AGENT RUNTIME
↓
MODEL GATEWAY
↓
POLICY
↓
CREDIT CHECK
↓
MODEL ROUTER
↓
OPENROUTER
↓
MODEL
↓
RESPONSE
↓
AGENT
↓
TASK / WORKSTREAM
↓
OUTCOME

At the same time:

MODEL REQUEST
↓
USAGE EVENT
↓
CREDIT LEDGER
↓
ORGANIZATION USAGE
↓
AGENT USAGE
↓
DEPARTMENT USAGE
↓
MODEL USAGE
↓
ADMIN ANALYTICS

This should happen automatically.

==================================================
61. IMPORTANT PRODUCT PRINCIPLE
==================================================

Do not build OpenRouter integration as a feature.

Build MODEL INFRASTRUCTURE.

OpenRouter is simply the current provider.

The long-term ORQ8 architecture should be:

ORQ8
├── Company OS
├── Agent Runtime
├── Organization Graph
├── Company Memory
├── Execution Engine
├── Permission System
├── Decision System
├── Model Gateway
├── Usage/Credit System
├── Observability
└── Admin Operations

The model layer should become infrastructure underneath the company operating system.

==================================================
62. IMPLEMENTATION PROCESS
==================================================

Work in phases.

PHASE 1
Audit existing architecture.

PHASE 2
Identify every AI/model call.

PHASE 3
Design/standardize Model Gateway.

PHASE 4
Configure OpenRouter.

PHASE 5
Implement provider abstraction.

PHASE 6
Implement model catalog and routing.

PHASE 7
Implement usage events.

PHASE 8
Implement Credits and reservations.

PHASE 9
Migrate EA.

PHASE 10
Migrate AI employees.

PHASE 11
Migrate Decision Center.

PHASE 12
Migrate background jobs.

PHASE 13
Build admin usage infrastructure.

PHASE 14
Build organization/user/agent/department analytics.

PHASE 15
Build provider/model health.

PHASE 16
Build limits and runaway protection.

PHASE 17
Security review.

PHASE 18
Load testing.

PHASE 19
Full application QA.

PHASE 20
Production readiness review.

==================================================
63. BEFORE CODING
==================================================

First return an implementation audit containing:

1. Existing AI architecture
2. Existing model router
3. Existing provider integrations
4. Every direct model call found
5. Existing admin architecture
6. Existing usage/credit architecture
7. Existing relevant database tables
8. Existing Railway/Vercel infrastructure
9. Existing environment variables
10. What can be reused
11. What must be changed
12. What is missing
13. Proposed final architecture
14. Migration plan
15. Risks

Then begin implementation.

Do not rewrite working parts of ORQ8 unnecessarily.

==================================================
64. DEFINITION OF DONE
==================================================

This task is complete only when:

- OpenRouter is securely configured
- API key is server-side only
- all AI execution routes through the ORQ8 Model Gateway
- no unexpected direct provider calls remain
- EA works
- AI employees work
- background agents work
- Decision Center works
- streaming works
- model routing works
- fallback works
- usage tracking works
- Credits work
- budgets work
- organization limits work
- agent limits work
- admin can inspect usage
- admin can inspect costs
- admin can inspect models
- admin can inspect users
- admin can inspect organizations
- admin can inspect agents
- admin can inspect departments
- admin can inspect requests
- provider health works
- anomaly detection works
- runaway protection works
- security isolation works
- realtime usage updates work
- failures are observable
- no secrets leak
- production configuration is documented
- existing ORQ8 functionality is preserved

Most importantly:

A founder should be able to use ORQ8 normally without knowing that OpenRouter exists.

ORQ8 should simply work.

The admin team should have complete operational visibility into how the AI infrastructure is being used.

The architecture should make it possible to change models/providers later without rebuilding ORQ8.

                 ORQ8
                  │
        ┌─────────▼─────────┐
        │   Model Gateway   │
        └─────────┬─────────┘
                  │
        ┌─────────▼─────────┐
        │ Policy + Credits  │
        │ + Permissions     │
        │ + Routing         │
        └─────────┬─────────┘
                  │
             OpenRouter
                  │
        ┌─────────┼─────────┐
        ▼         ▼         ▼
      Model A   Model B   Model C
                  │
                  ▼
             AI Response
                  │
        ┌─────────▼─────────┐
        │ ORQ8 Usage Ledger │
        └─────────┬─────────┘
                  │
       ┌──────────┼──────────┐
       ▼          ▼          ▼
   Company      Agent      Department
    Usage        Usage        Usage
       │          │          │
       └──────────┼──────────┘
                  ▼
             Admin Console


====================================================================================================
SECTION 3 — UNIFIED AI EXECUTION INFRASTRUCTURE (VERCEL + SUPABASE + TRIGGER.DEV + OPENROUTER)
====================================================================================================

# ORQ8 UNIFIED AI EXECUTION INFRASTRUCTURE
# VERCEL + SUPABASE + TRIGGER.DEV + OPENROUTER + AGENT RUNTIME

You are working on ORQ8, an AI operating system for running a company with AI employees.

The goal of this task is to connect ORQ8's application, database, AI model infrastructure, agent runtime, durable execution, permissions, credits, realtime state, and admin observability into ONE coherent system.

The final system should make ORQ8 behave like an actual operating company:

Founder
→ Company
→ Executive Agent
→ Departments
→ AI Employees
→ Work
→ Tools
→ Approvals
→ Execution
→ Outcomes
→ Memory
→ Reporting

The founder should experience this as ONE ORQ8 product.

They should NOT need to know whether a task is running on Vercel, Supabase, Trigger.dev, OpenRouter, Railway, or another infrastructure service.

Those are implementation layers underneath ORQ8.

==================================================
1. CORE ARCHITECTURE
==================================================

The target architecture is:

                         ORQ8
                          │
             ┌────────────┴────────────┐
             │                         │
          Frontend                 ORQ8 API
          Vercel                  Server Layer
             │                         │
             └────────────┬────────────┘
                          │
                    ORQ8 Agent Runtime
                          │
              ┌───────────┴───────────┐
              │                       │
       Fast interactions       Durable execution
              │                       │
              │                  Trigger.dev
              │                       │
              └───────────┬───────────┘
                          │
                   ORQ8 Model Gateway
                          │
                    Policy + Routing
                          │
                      OpenRouter
                          │
                    AI Model Provider
                          │
                     Model Response
                          │
              ┌───────────┴───────────┐
              │                       │
         ORQ8 Database           Usage Ledger
         Supabase               Credits / Cost
              │                       │
              └───────────┬───────────┘
                          │
                    Realtime State
                          │
                    ORQ8 Dashboard
                          │
                       Founder


Supporting infrastructure may include:

Vercel
Supabase
Trigger.dev
OpenRouter
Railway
GitHub
MCP
External integrations

But ORQ8 must remain the abstraction layer.

==================================================
2. IMPORTANT ARCHITECTURAL PRINCIPLE
==================================================

Do not treat these as separate products.

Do not create:

"ORQ8 dashboard"

"Trigger.dev system"

"OpenRouter system"

"Agent system"

"Supabase system"

Instead build:

ONE ORQ8 execution platform.

Each infrastructure service has a specific responsibility.

==================================================
3. RESPONSIBILITY OF EACH SYSTEM
==================================================

Vercel:

Owns:

- ORQ8 web application
- frontend
- authenticated user experience
- lightweight API endpoints
- server-side application logic where appropriate
- streaming entry points where appropriate

Do NOT use Vercel request lifecycle as the primary execution engine for long-running AI work.

--------------------------------------------------

Supabase:

Owns:

- users
- organizations
- companies
- departments
- AI employees
- agents
- tasks
- workstreams
- goals
- decisions
- approvals
- permissions
- company memory
- organizational relationships
- files metadata
- integrations metadata
- credit ledger
- usage ledger
- audit events
- execution state
- system configuration where appropriate

Supabase/Postgres is the durable source of truth for ORQ8 business state.

--------------------------------------------------

Trigger.dev:

Owns:

- durable background execution
- long-running AI tasks
- scheduled work
- retries
- queues
- concurrency
- workflow orchestration
- pause/resume
- human approval waits
- multi-step execution
- background agent work
- execution lifecycle
- task runtime state

Trigger.dev is the execution infrastructure.

It is NOT the source of truth for ORQ8 organizational state.

--------------------------------------------------

OpenRouter:

Owns:

- model access
- provider/model routing at the external model layer

OpenRouter is NOT:

- ORQ8's agent runtime
- ORQ8's company database
- ORQ8's permission system
- ORQ8's credit ledger
- ORQ8's organizational state

--------------------------------------------------

ORQ8 Model Gateway:

Owns:

- model policy
- model selection
- provider abstraction
- credit checks
- budget checks
- model permissions
- usage recording
- cost recording
- retries/fallback policy
- request metadata
- organization context
- agent context
- department context

Every AI request must go through this layer.

--------------------------------------------------

ORQ8 Agent Runtime:

Owns:

- agent identity
- agent instructions
- agent responsibilities
- agent authority
- agent context
- tool access
- task planning
- task decomposition
- delegation
- execution decisions
- escalation
- reporting
- organizational coordination

--------------------------------------------------
4. SOURCE OF TRUTH RULE
==================================================

This rule is critical.

Supabase is the source of truth for:

Company state
Agent state
Task state
Approval state
Credit state
Permission state
Memory
Audit
Organization relationships

Trigger.dev is the source of truth for:

Current execution/run mechanics.

OpenRouter is the source of truth for:

Provider/model response and provider-reported model usage where available.

ORQ8 reconciles external execution into its own durable state.

Never make the frontend depend directly on Trigger.dev or OpenRouter as the business source of truth.

==================================================
5. ORQ8 EXECUTION OBJECT
==================================================

Create a unified ORQ8 execution abstraction.

Conceptually:

ORQ8 Execution

{
  executionId,
  organizationId,
  userId,
  agentId,
  departmentId,
  taskId,
  workstreamId,
  parentExecutionId,
  type,
  status,
  priority,
  autonomyLevel,
  requiredApproval,
  triggerRunId,
  modelRequestIds,
  startedAt,
  completedAt,
  failureReason,
  outcome
}

This becomes the bridge between ORQ8 and Trigger.dev.

Every durable operation should have an ORQ8 execution ID.

Example:

ORQ8 execution:
exec_123

Trigger.dev:
run_987

OpenRouter:
request_456

These IDs should be related.

==================================================
6. EXECUTION LIFECYCLE
==================================================

Implement a consistent lifecycle:

CREATED
↓
QUEUED
↓
STARTING
↓
RUNNING
↓
WAITING
↓
APPROVAL_REQUIRED
↓
RESUMING
↓
RUNNING
↓
COMPLETED

Possible terminal states:

COMPLETED
FAILED
CANCELLED
TIMED_OUT

Additional state:

BLOCKED

Do not confuse:

BLOCKED

with

FAILED.

Blocked means the work cannot continue because something external is required.

Example:

Engineering agent needs production permission.

The agent should become:

WAITING / APPROVAL_REQUIRED

rather than:

FAILED.

==================================================
7. WHAT HAPPENS WHEN FOUNDER GIVES ORQ8 A TASK
==================================================

Example:

Founder says:

"Prepare our product launch."

Flow:

Founder
↓
ORQ8 frontend
↓
ORQ8 API
↓
Executive Agent
↓
Understand request
↓
Create workstream
↓
Break work into tasks
↓
Assign departments
↓
Determine required tools
↓
Determine authority
↓
Determine approvals
↓
Create ORQ8 executions
↓
Queue durable work in Trigger.dev
↓
Trigger.dev starts tasks
↓
Agents execute
↓
Model Gateway handles AI calls
↓
OpenRouter provides models
↓
Tools execute
↓
Results return
↓
ORQ8 state updates
↓
Supabase persists state
↓
Realtime updates dashboard
↓
EA summarizes progress
↓
Founder receives required approvals
↓
Trigger.dev resumes after approval
↓
Work completes
↓
Outcome stored
↓
Memory updated
↓
Audit recorded
↓
Credits settled

This is the complete company execution loop.

==================================================
8. FAST VS DURABLE EXECUTION
==================================================

Do not send every request through Trigger.dev unnecessarily.

Use two execution classes.

FAST:

Suitable for:

- simple EA conversation
- lightweight queries
- reading company state
- simple summaries
- basic UI interactions

DURABLE:

Suitable for:

- AI employee tasks
- research
- coding
- GitHub work
- browser automation
- long reasoning
- multi-step workflows
- scheduled jobs
- decision councils
- background work
- large reports
- tasks involving approvals
- anything expected to run longer than a normal API request

The Agent Runtime should decide which execution path is appropriate.

==================================================
9. TRIGGER.DEV TASK ARCHITECTURE
==================================================

Create a clean Trigger.dev task architecture.

Examples:

executeAgentTask
executeWorkstream
executeResearch
executeDecision
executeEngineeringTask
executeMarketingTask
executeSalesTask
executeFinanceTask
processMemory
generateCompanyReport
runScheduledCompanyWork
processApprovalContinuation

Do not create hundreds of unrelated tasks unnecessarily.

Prefer reusable execution primitives.

==================================================
10. TRIGGER.DEV TASK CONTEXT
==================================================

Every Trigger.dev task must receive an ORQ8 context.

Example:

{
  executionId,
  organizationId,
  agentId,
  departmentId,
  taskId,
  workstreamId,
  userId,
  autonomyLevel
}

Do not trust IDs coming from arbitrary clients.

Validate them server-side before execution.

==================================================
11. AGENT EXECUTION
==================================================

When an AI employee receives work:

Agent
↓
Check authority
↓
Check permissions
↓
Check budget
↓
Check required tools
↓
Create execution
↓
Trigger.dev
↓
Agent runtime
↓
Model Gateway
↓
Model
↓
Tool calls
↓
Evaluate result
↓
Continue / wait / escalate / complete

An agent must never bypass:

- permissions
- budgets
- approval requirements
- organizational policy

==================================================
12. MODEL GATEWAY
==================================================

All AI calls must use:

ORQ8 Model Gateway

Never:

Agent → OpenRouter directly

Never:

Trigger.dev → OpenRouter directly

Never:

Frontend → OpenRouter

Instead:

Trigger.dev task
↓
Agent Runtime
↓
Model Gateway
↓
Policy
↓
Credit check
↓
Model routing
↓
OpenRouter
↓
Model

==================================================
13. OPENROUTER CONFIGURATION
==================================================

Set up:

OPENROUTER_API_KEY

Server-side only.

Never expose it to:

- browser
- frontend
- client components
- logs
- analytics
- database
- public environment variables

If Railway hosts the Model Gateway, configure it there.

If Vercel calls the gateway, only expose a secure internal endpoint.

Use the existing infrastructure where possible.

Do not create duplicate model routers.

==================================================
14. MODEL CATALOG
==================================================

Create centralized model configuration.

Logical capabilities:

fast
general
reasoning
coding
research
vision
background
premium

Map those to actual OpenRouter models.

Do not hard-code model names throughout agents.

Example:

Agent asks:

"coding"

Router chooses configured coding model.

This allows changing models without rewriting agents.

==================================================
15. TRIGGER.DEV + MODEL GATEWAY
==================================================

This is one of the most important boundaries.

Trigger.dev controls:

WHEN and HOW LONG work runs.

Model Gateway controls:

HOW AI reasoning is performed.

Therefore:

Trigger.dev
=
Execution

Model Gateway
=
Intelligence access

ORQ8 Agent Runtime
=
Organizational reasoning and authority

Supabase
=
Persistent organizational state

==================================================
16. CREDITS
==================================================

Every model call must be associated with:

organization
user
agent
department
task
execution
request type

Before expensive execution:

Estimate required credits.

Reserve credits.

Execute.

Receive actual usage.

Calculate actual ORQ8 Credits.

Settle reservation.

Release unused reservation.

If execution fails safely:

settle actual usage.

Never double-charge.

==================================================
17. CREDIT FLOW
==================================================

Example:

Agent starts task.

ORQ8:

Estimated:
450 Credits

Reserve:
450

Trigger.dev begins execution.

Agent makes:

5 model calls.

Actual usage:

327 Credits.

ORQ8:

Consume:
327

Release:
123

Database:

Credit reservation
→ settled

Usage ledger:
→ 327 Credits

Admin:
→ sees 327 Credits

Founder:
→ sees 327 Credits

==================================================
18. EXECUTION COST TRACKING
==================================================

For every model request record:

requestId
executionId
organizationId
userId
agentId
departmentId
taskId
model
provider
input tokens
output tokens
reasoning tokens where available
provider cost
ORQ8 Credits
latency
status
retry count
fallback
timestamp

Raw token information is internal.

Founder-facing product uses:

ORQ8 Credits.

==================================================
19. REALTIME
==================================================

The founder must see execution state in realtime.

Example:

Agent starts:

WORKING

Agent requests approval:

APPROVAL REQUIRED

Founder approves:

RESUMING

Agent continues:

WORKING

Agent completes:

DONE

Agent fails:

FAILED

Use existing Supabase realtime where appropriate.

Use Trigger.dev realtime capabilities where appropriate.

Do not create competing sources of truth.

The frontend should ultimately subscribe to ORQ8 state.

==================================================
20. REALTIME SOURCE RULE
==================================================

The frontend should NOT have to understand Trigger.dev's internal state model.

Instead:

Trigger.dev
↓
ORQ8 execution state update
↓
Supabase
↓
Realtime
↓
ORQ8 frontend

This means the ORQ8 UI understands:

RUNNING
WAITING
BLOCKED
APPROVAL_REQUIRED
DONE
FAILED

not provider-specific execution states.

==================================================
21. HUMAN APPROVAL
==================================================

Example:

Engineering Agent wants to deploy production.

Agent
↓
Authority check
↓
Approval required
↓
Create ORQ8 approval
↓
Create/update execution
↓
Trigger.dev waits
↓
Founder sees Founder Attention
↓
Founder approves
↓
ORQ8 records approval
↓
Trigger.dev resumes
↓
Agent continues

If rejected:

execution stops safely.

The agent must not attempt to bypass the rejection.

==================================================
22. WAITING STATES
==================================================

Support waiting for:

- founder approval
- external API
- GitHub event
- customer response
- scheduled time
- integration
- another task
- human input

Waiting should NOT consume continuous model calls.

Persist the state.

Resume when the condition is satisfied.

==================================================
23. DEPENDENCIES
==================================================

Support:

Task A
↓
Task B
↓
Task C

and parallel:

Task A
├── Task B
├── Task C
└── Task D
       ↓
    Task E

Do not serialize everything.

Independent agents should work simultaneously.

==================================================
24. BLOCKED WORK
==================================================

If Engineering is blocked:

Engineering:
BLOCKED

Marketing:
WORKING

Sales:
WORKING

Finance:
WORKING

Do not globally block the company.

Only dependent executions should wait.

==================================================
25. FAILURE HANDLING
==================================================

When a Trigger.dev task fails:

Do not simply show:

"Something went wrong."

Record:

what failed
why
execution ID
agent
task
step
model
provider
tool
retry count
what completed
what remains
whether founder action is required

Attempt retry when safe.

If retry fails:

mark execution FAILED.

Do not hide the failure.

==================================================
26. IDEMPOTENCY
==================================================

This is critical.

A retry must not accidentally:

- send the same email twice
- deploy twice
- charge twice
- create duplicate records
- publish duplicate content
- create duplicate GitHub PRs

Every consequential external action must have an idempotency strategy.

Use:

executionId
stepId
actionId

where appropriate.

==================================================
27. TOOL EXECUTION
==================================================

AI agents may use:

GitHub
email
calendar
database
browser
MCP
cloud
Vercel
Supabase
CRM
analytics
other integrations

Tool execution must follow:

Agent
↓
Authority
↓
Permission
↓
Tool access
↓
Approval if required
↓
Execution
↓
Audit

Trigger.dev can execute the durable workflow around the tool.

ORQ8 remains responsible for authorization.

==================================================
28. MCP
==================================================

Integrate MCP through ORQ8's tool layer.

Do not let models directly discover unrestricted tools.

The Agent Runtime decides:

Which tool is available?

Why?

What permissions?

What scope?

What budget?

What approval?

Then execution occurs.

==================================================
29. COMPANY MEMORY
==================================================

When meaningful execution finishes:

Execution
↓
Outcome
↓
Evaluate significance
↓
Store useful information
↓
Company Memory

Examples:

- decision
- preference
- policy
- successful workflow
- failure
- customer insight
- technical discovery
- strategic context

Do not store every raw model response as memory.

==================================================
30. AUDIT
==================================================

Every consequential action should produce an audit event.

Example:

Founder approved deployment.

Audit:

WHO:
Founder

WHAT:
Approved production deployment

WHY:
Engineering release

AGENT:
Engineering Agent

EXECUTION:
exec_123

AUTHORITY:
Founder approval

RESULT:
Deployment continued

==================================================
31. ADMIN OBSERVABILITY
==================================================

The ORQ8 admin console should combine:

ORQ8 business state
+
Trigger.dev execution data
+
OpenRouter model usage
+
ORQ8 credit ledger

Admin should see:

Active executions
Queued executions
Waiting executions
Failed executions
Completed executions
Model requests
Credits
Provider costs
Latency
Errors
Retries
Fallbacks
Organizations
Users
Agents
Departments

==================================================
32. ADMIN EXECUTION VIEW
==================================================

Admin should be able to open:

Execution ID

and see:

Organization
User
Agent
Department
Task
Workstream
Status
Trigger run ID
Model requests
Models
Tools
Credits
Cost
Duration
Retries
Approvals
Errors
Outcome

Timeline:

14:01 Created
14:02 Started
14:03 Model request
14:04 GitHub call
14:07 Tests started
14:10 Tests failed
14:11 Retry
14:14 Tests passed
14:16 Approval requested
14:20 Founder approved
14:21 Deployment
14:23 Completed

==================================================
33. ORGANIZATION ADMIN VIEW
==================================================

Admin opens an organization.

Show:

Company
Plan
Users
Departments
AI Employees
Active executions
Completed work
Failed work
Credits
Usage
Provider cost
Models
Requests
Errors
Budgets

Drill down:

Organization
→ Department
→ Agent
→ Task
→ Execution
→ Model request

==================================================
34. GLOBAL ORQ8 OPERATIONS
==================================================

Admin dashboard should answer:

How much AI work is ORQ8 executing?

How many organizations are active?

How many AI employees are active?

How many executions are running?

How many are waiting?

How many failed?

How many credits were consumed?

What is provider cost?

Which model is used most?

Which model costs most?

Which organizations consume most?

Which agents consume most?

What is failure rate?

What is average execution time?

What is average model latency?

Are there runaway executions?

==================================================
35. SCHEDULED WORK
==================================================

Use Trigger.dev schedules for recurring ORQ8 operations.

Examples:

Daily:
company briefing

Daily:
sales review

Daily:
competitor research

Weekly:
finance report

Weekly:
engineering health report

Weekly:
marketing review

Monthly:
company performance report

Each schedule should create an ORQ8 execution.

Do not make schedules exist only inside Trigger.dev.

Store the ORQ8 schedule configuration in the ORQ8 database.

==================================================
36. EVENT-DRIVEN WORK
==================================================

ORQ8 should eventually be able to respond to events.

Examples:

GitHub PR opened
→ Engineering Agent

New customer
→ Customer Success Agent

New lead
→ Sales Agent

Payment received
→ Finance Agent

Support ticket
→ Customer Success Agent

Deployment failure
→ Engineering Agent

Important email
→ EA

The event creates an ORQ8 execution.

Trigger.dev executes it.

==================================================
37. CONCURRENCY
==================================================

Do not allow one company to accidentally consume the entire execution system.

Configure concurrency at multiple levels.

Possible levels:

Global ORQ8
Organization
Department
Agent
Task type

Example:

ORQ8:
100 concurrent executions

Company A:
10

Engineering:
4

Agent:
2

These values must be configurable.

==================================================
38. RATE LIMITS
==================================================

Apply limits to:

- model requests
- tool calls
- executions
- credits
- background jobs

Do not depend solely on Trigger.dev limits.

ORQ8 business limits must be enforced by ORQ8.

==================================================
39. RUNAWAY AGENT PROTECTION
==================================================

Every execution should have:

Maximum runtime
Maximum model calls
Maximum credits
Maximum iterations
Maximum retries
Maximum tool calls

If exceeded:

STOP

Create an admin-visible event.

Do not allow an agent to continue indefinitely.

==================================================
40. CANCELLATION
==================================================

Founder must be able to:

Pause agent
Cancel task
Pause department
Pause workstream
Pause execution

Cancellation must propagate to the underlying Trigger.dev run when appropriate.

Do not simply change the UI status.

Actually stop execution.

==================================================
41. RESUME
==================================================

Where safe:

Founder can resume a paused/blocked execution.

The execution should continue from the correct durable state.

Do not restart the entire workflow unnecessarily.

==================================================
42. ENVIRONMENT SETUP
==================================================

Before implementation, identify the required environments.

Likely:

Vercel
Supabase
Trigger.dev
OpenRouter
Railway if still required

Create a clear environment matrix.

Example:

LOCAL
STAGING
PRODUCTION

Document where each secret lives.

==================================================
43. REQUIRED ENVIRONMENT VARIABLES
==================================================

Audit existing variables first.

Potential required values:

NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY

OPENROUTER_API_KEY

TRIGGER_SECRET_KEY
TRIGGER_PROJECT_REF

Any existing Railway/model gateway credentials

Any integration credentials already required by ORQ8

Do NOT blindly add variables that are not required by the actual SDK/version.

Use the current official Trigger.dev setup for the installed version.

==================================================
44. TRIGGER.DEV SETUP
==================================================

Set up Trigger.dev correctly for the project.

Determine:

- current Trigger.dev SDK version
- project configuration
- task directory
- deployment configuration
- development workflow
- production environment
- secret configuration
- realtime configuration
- queues/concurrency
- schedules

Do not assume outdated Trigger.dev APIs.

Use the current official API for the version actually installed.

==================================================
45. OPENROUTER SETUP
==================================================

Set up:

OPENROUTER_API_KEY

Configure the model gateway.

Verify:

simple model call
streaming
usage response
error response
timeout
fallback

Do not expose the key.

==================================================
46. SUPABASE SETUP
==================================================

Inspect existing database schema before migrations.

Reuse existing:

organizations
users
agents
departments
tasks
workstreams
approvals
credits
memory
audit

Add only what is necessary.

Possible additions:

executions
execution_steps
execution_events
ai_requests
ai_usage_events
credit_reservations
scheduled_work

Do not duplicate existing tables.

==================================================
47. DATABASE RELATIONSHIPS
==================================================

The database should allow:

Organization
→ executions

Agent
→ executions

Department
→ executions

Task
→ execution

Workstream
→ executions

Execution
→ steps

Execution
→ model requests

Execution
→ approvals

Execution
→ audit events

Execution
→ outcome

Model request
→ usage event

Usage event
→ credit ledger

==================================================
48. REALTIME DATABASE EVENTS
==================================================

When execution state changes:

Trigger.dev
↓
ORQ8 execution update
↓
Supabase
↓
Realtime
↓
Dashboard

Examples:

RUNNING
WAITING
APPROVAL_REQUIRED
COMPLETED
FAILED

Founder should see these without refreshing.

==================================================
49. FRONTEND
==================================================

The existing ORQ8 dashboard should consume ORQ8 state.

Do not expose infrastructure-specific UI everywhere.

The founder sees:

Engineering Agent
Working

not:

Trigger.dev run #891293

The admin sees both.

==================================================
50. COMPANY HUB
==================================================

Company page should show:

Founder Attention
Workstreams
Departments
AI Employees
Active Work
Execution Status
Recent Outcomes

Example:

Engineering Agent
● Working

Marketing Agent
● Waiting

Finance Agent
● Completed

EA
● Coordinating 4 workstreams

Clicking an agent:

Current execution
Task
Progress
What it is doing
Why
Tools
Credits
Approval state

==================================================
51. EA
==================================================

EA is the organizational coordinator.

EA decides:

What needs to happen?

Who should do it?

What departments are involved?

What needs approval?

What can happen automatically?

EA does NOT directly bypass the Agent Runtime.

EA:

Founder
↓
EA
↓
Agent Runtime
↓
Execution

==================================================
52. MULTI-AGENT EXECUTION
==================================================

Example:

Founder:

"Prepare us for our fundraising launch."

EA creates:

Fundraising Workstream

Tasks:

Product:
prepare product narrative

Finance:
prepare financial model

Marketing:
prepare positioning

Research:
competitive research

Engineering:
prepare product metrics

Each becomes an ORQ8 execution.

Trigger.dev runs independent tasks concurrently.

Dependent tasks wait appropriately.

==================================================
53. DECISION CENTER
==================================================

Decision workflows should also be durable.

Example:

Decision:
Which pricing model should we launch?

Trigger.dev:

Research
↓
Independent analysis
↓
Market evidence
↓
Financial analysis
↓
Product analysis
↓
Risk analysis
↓
Synthesis
↓
Founder decision

Every model call uses Model Gateway.

Every step is tracked.

==================================================
54. ENGINEERING AGENT
==================================================

Engineering is an important first test.

Example:

Founder:

"Investigate why production requests are failing."

ORQ8:

Create execution.

Trigger.dev:

Start Engineering Agent.

Agent:

Inspect logs
↓
Inspect repository
↓
Inspect deployment
↓
Analyze code
↓
Identify likely cause
↓
Create fix
↓
Run tests
↓
Prepare PR
↓
Request deployment approval if required
↓
Deploy
↓
Verify
↓
Report

Every step is traceable.

==================================================
55. MODEL + EXECUTION RELATIONSHIP
==================================================

One Trigger.dev execution may make many model requests.

Example:

Execution:
exec_123

Model requests:

req_1
req_2
req_3
req_4
req_5

Therefore:

Execution ≠ Model Request.

An execution represents work.

A model request represents one intelligence call.

Keep these separate.

==================================================
56. CREDITS RELATIONSHIP
==================================================

Credits should attach to model usage, but can be aggregated at:

request
task
execution
agent
department
organization

Example:

Execution:
500 Credits

Agent:
2,000 Credits today

Engineering:
7,200 Credits this month

Organization:
21,430 Credits this month

ORQ8:
2.4M Credits this month

==================================================
57. COST RELATIONSHIP
==================================================

Keep these separate:

Provider Cost

ORQ8 Credits

Customer Revenue

They are not the same thing.

Admin should be able to compare:

Revenue
vs
AI provider cost
vs
Credits consumed

This becomes important for ORQ8 unit economics.

==================================================
58. ADMIN ALERTS
==================================================

Admin alerts should include:

Provider failure spike
Model failure spike
Credit spike
Organization usage spike
Agent runaway
Execution timeout spike
Queue backlog
Trigger failure
OpenRouter failure
Supabase failure
Integration failure

==================================================
59. SECURITY
==================================================

Perform a complete security review.

Verify:

- tenant isolation
- server-side permissions
- server-side credit checks
- server-side model limits
- Trigger.dev secrets protected
- OpenRouter key protected
- Supabase service key protected
- admin routes protected
- execution IDs not enough to access data
- organization ownership verified
- tool permissions verified
- approval checks server-side
- agent cannot modify its own authority
- model cannot grant itself permission
- prompt cannot bypass policy
- external actions audited

==================================================
60. OBSERVABILITY
==================================================

Create structured logs with:

requestId
executionId
organizationId
agentId
taskId
model
provider
status
duration

Important events:

EXECUTION_CREATED
EXECUTION_STARTED
EXECUTION_WAITING
EXECUTION_RESUMED
EXECUTION_COMPLETED
EXECUTION_FAILED
EXECUTION_CANCELLED

MODEL_REQUEST_STARTED
MODEL_REQUEST_COMPLETED
MODEL_REQUEST_FAILED

TOOL_STARTED
TOOL_COMPLETED
TOOL_FAILED

APPROVAL_REQUESTED
APPROVAL_GRANTED
APPROVAL_REJECTED

CREDITS_RESERVED
CREDITS_SETTLED

==================================================
61. ERROR HANDLING
==================================================

Use clear failure boundaries.

Example:

Trigger.dev failure

vs

Model failure

vs

Tool failure

vs

Database failure

vs

Permission failure

vs

Approval timeout

vs

Credit exhaustion

vs

Integration failure

The founder should see an understandable explanation.

Admin should see technical details.

==================================================
62. NO FAKE EXECUTION
==================================================

Never fabricate:

agent activity
execution progress
completed tasks
model usage
credits
cost
results

If no agent is working:

show no active work.

If an execution is waiting:

show waiting.

If it failed:

show failed.

ORQ8's credibility depends on this.

==================================================
63. MIGRATION OF EXISTING SYSTEM
==================================================

Do not rewrite ORQ8 from scratch.

First:

Audit.

Then:

Map existing components.

Identify:

KEEP
REFACTOR
REPLACE
ADD
REMOVE ONLY IF DUPLICATE

Preserve working functionality.

Especially inspect existing:

Railway model-router
Railway jobs
Supabase realtime
agent runtime
AI calls
task system
approval system
credit system

Determine which existing Railway workloads should remain and which should move to Trigger.dev.

==================================================
64. DO NOT DUPLICATE SYSTEMS
==================================================

Before creating anything, search the codebase.

Do not create:

second model router
second credit ledger
second agent runtime
second task system
second queue
second approval system
second audit system
second realtime layer

Integrate with existing systems.

==================================================
65. IMPLEMENTATION ORDER
==================================================

PHASE 1

Full architecture audit.

PHASE 2

Map existing AI calls and jobs.

PHASE 3

Map existing database state.

PHASE 4

Define unified execution model.

PHASE 5

Configure Trigger.dev.

PHASE 6

Configure OpenRouter.

PHASE 7

Standardize Model Gateway.

PHASE 8

Connect Agent Runtime to Trigger.dev.

PHASE 9

Connect Model Gateway to OpenRouter.

PHASE 10

Implement execution state persistence.

PHASE 11

Implement realtime execution updates.

PHASE 12

Implement credit reservation/settlement.

PHASE 13

Migrate EA.

PHASE 14

Migrate AI employees.

PHASE 15

Migrate background jobs.

PHASE 16

Migrate Decision Center.

PHASE 17

Migrate engineering execution.

PHASE 18

Implement schedules.

PHASE 19

Implement admin execution observability.

PHASE 20

Implement limits/runaway protection.

PHASE 21

Security audit.

PHASE 22

Load testing.

PHASE 23

Production deployment.

==================================================
66. FIRST IMPLEMENTATION TEST
==================================================

Do NOT start with the entire company.

Build one complete vertical slice.

Test:

Founder
↓
EA
↓
Create Engineering task
↓
Create ORQ8 execution
↓
Trigger.dev
↓
Engineering Agent
↓
Model Gateway
↓
OpenRouter
↓
Model
↓
Agent response
↓
Supabase execution state
↓
Realtime
↓
Founder dashboard
↓
Credits recorded
↓
Admin usage recorded

This must work end-to-end.

Only after this works should you migrate the remaining agent types.

==================================================
67. SECOND TEST
==================================================

Test a long-running task.

Example:

"Research our top five competitors and produce a report."

Requirements:

- multiple model calls
- external research
- retries
- background execution
- progress updates
- final report
- Credits
- usage
- memory
- audit

==================================================
68. THIRD TEST
==================================================

Test human approval.

Example:

"Prepare a production deployment."

Agent:

Work
↓
Approval required
↓
Pause
↓
Founder sees approval
↓
Approve
↓
Resume
↓
Deploy
↓
Verify
↓
Complete

==================================================
69. FOURTH TEST
==================================================

Test failure.

Force model/provider failure.

Expected:

Retry
↓
Fallback if configured
↓
If still failing:
FAILED

Admin sees failure.

Founder sees meaningful explanation.

Credits remain accurate.

No duplicate external action.

==================================================
70. FIFTH TEST
==================================================

Test concurrent agents.

Start:

Engineering
Marketing
Sales
Finance

All simultaneously.

Verify:

No cross-company state contamination.

No credit race conditions.

No task collision.

No global blocking.

Admin sees all executions.

Founder sees all agents.

==================================================
71. FINAL PRODUCTION ARCHITECTURE
==================================================

The desired final architecture is:

                    ┌─────────────────┐
                    │     FOUNDER     │
                    └────────┬────────┘
                             │
                             ▼
                    ┌─────────────────┐
                    │  ORQ8 FRONTEND  │
                    │     Vercel      │
                    └────────┬────────┘
                             │
                             ▼
                    ┌─────────────────┐
                    │    ORQ8 API     │
                    └────────┬────────┘
                             │
                             ▼
                    ┌─────────────────┐
                    │  AGENT RUNTIME  │
                    └────────┬────────┘
                             │
                  ┌──────────┴──────────┐
                  │                     │
                  ▼                     ▼
          Fast interaction       Durable execution
                                      │
                                      ▼
                               ┌──────────────┐
                               │ TRIGGER.DEV  │
                               └──────┬───────┘
                                      │
                                      ▼
                               Agent execution
                                      │
                                      ▼
                              ┌───────────────┐
                              │ MODEL GATEWAY │
                              └───────┬───────┘
                                      │
                                      ▼
                               ┌─────────────┐
                               │ OPENROUTER  │
                               └──────┬──────┘
                                      │
                              ┌───────┼───────┐
                              ▼       ▼       ▼
                           Model   Model   Model
                                      │
                                      ▼
                              Agent response
                                      │
                   ┌──────────────────┼──────────────────┐
                   │                  │                  │
                   ▼                  ▼                  ▼
               Supabase          Credits             Audit
                   │                  │                  │
                   └──────────────────┼──────────────────┘
                                      │
                                      ▼
                                Realtime state
                                      │
                                      ▼
                              ORQ8 COMPANY HUB


====================================================================================================
SECTION 4 — NEXT-GENERATION EXECUTION INFRASTRUCTURE (CLOUD RUN + TRIGGER.DEV + SUPABASE + OPENROUTER)
====================================================================================================

You are implementing the next-generation execution infrastructure for ORQ8.

ORQ8 is an AI operating system for running a company.

The product is not intended to behave like a chatbot, an AI-agent marketplace, a collection of AI tools, or a dashboard that only displays simulated activity.

The intended experience is:

Founder
→ Company
→ Executive Agent
→ Departments
→ AI Employees
→ Work
→ Execution
→ Tools / Models / Data
→ Approvals
→ Outcomes
→ Company Memory
→ New decisions and work

The founder sets direction and remains the ultimate authority.

ORQ8 should handle the operational execution of the company through AI employees.

The company should feel continuously alive because real work is being executed, not because the UI is generating fake activity.

==================================================
1. PRIMARY OBJECTIVE
==================================================

Implement the ORQ8 execution architecture using:

- Vercel
- Supabase/Postgres
- Google Cloud Run
- Trigger.dev
- OpenRouter

The architecture must separate:

Vercel
= frontend and lightweight request entry

Supabase/Postgres
= durable source of truth for company and organizational state

Cloud Run
= fast ORQ8 backend compute layer

Trigger.dev
= durable background execution and workflow orchestration

OpenRouter
= external model access

ORQ8 Model Gateway
= internal model policy, routing, credits and provider abstraction

ORQ8 Agent Runtime
= employee behavior, context, authority, planning, tool access and execution

Executive Agent / EA
= organizational coordination and founder interface

Execution Graph
= relationship between goals, workstreams, tasks, agents, executions, tools, approvals and outcomes

Company Memory
= persistent organizational knowledge and learning

ORQ8 Policy
= authority, permissions, autonomy, budgets and governance

Credits
= customer-facing execution capacity/economics

Audit
= accountability and traceability

Do NOT simply replace Railway with Cloud Run and recreate the same architecture.

Cloud Run should become the fast compute layer.

Trigger.dev should become the durable execution layer.

Supabase remains the durable business state.

==================================================
2. FIRST RULE: AUDIT BEFORE MODIFYING
==================================================

DO NOT immediately rewrite the existing system.

First inspect the existing ORQ8 repository thoroughly.

Understand:

- framework
- routes
- components
- database schema
- Supabase configuration
- authentication
- existing company model
- existing agent model
- existing department model
- existing task system
- existing EA
- existing model router
- existing Railway services
- existing background jobs
- existing realtime implementation
- existing permissions
- existing approvals
- existing credits/usage
- existing audit logs
- existing integrations
- existing API routes
- existing environment variables
- existing admin system
- existing dashboards
- existing Trigger.dev implementation, if any

Map what already exists.

For every relevant subsystem classify it as:

1. KEEP
2. REFACTOR
3. MOVE
4. REPLACE
5. EXTEND
6. MISSING

Do not create duplicate implementations.

In particular, do NOT accidentally create:

- two model gateways
- two agent runtimes
- two credit ledgers
- two approval systems
- two task systems
- two queues
- two audit systems
- two realtime systems
- two execution systems

Reuse working infrastructure whenever possible.

Before major changes, produce an implementation audit containing:

1. Current architecture
2. Current routes
3. Current database model
4. Current agent architecture
5. Current execution architecture
6. Current Railway services
7. Current API routes
8. Current realtime
9. Current permissions
10. Current credits
11. Current admin observability
12. Problems discovered
13. Proposed migration
14. Files/modules affected
15. Database migrations required
16. Environment variables required
17. Risks
18. Implementation order

Then begin implementation.

==================================================
3. TARGET ARCHITECTURE
==================================================

Implement the following conceptual architecture:

                    FOUNDER
                       |
                       v
                ORQ8 FRONTEND
                    Vercel
                       |
                       v
                  ORQ8 API
                       |
             +---------+---------+
             |                   |
          FAST PATH          DURABLE PATH
             |                   |
             v                   v
        GOOGLE CLOUD RUN     TRIGGER.DEV
             |                   |
             |                   v
             |              execution state
             |                   |
             +---------+---------+
                       |
                       v
               ORQ8 AGENT RUNTIME
                       |
                       v
                ORQ8 POLICY LAYER
                       |
                       v
                ORQ8 MODEL GATEWAY
                       |
                       v
                   OPENROUTER
                       |
              +--------+--------+
              |        |        |
           Models    Tools    Integrations
              |        |        |
              +--------+--------+
                       |
                       v
                  SUPABASE
                       |
            +----------+----------+
            |          |          |
         Realtime   Memory      Audit
            |
            v
                 ORQ8 COMPANY HUB


The architectural ownership must remain clear.

==================================================
4. SERVICE RESPONSIBILITIES
==================================================

Vercel:

Responsible for:

- web application
- founder interface
- company dashboard
- EA UI
- task UI
- approvals UI
- reports
- lightweight API entry points
- authentication-facing operations
- realtime subscriptions

Do not place long-running execution here.

Do not expose provider API keys here.

--------------------------------------------------

Supabase/Postgres:

This is the durable source of truth.

Store:

- users
- organizations
- company configuration
- founders
- departments
- agents
- agent authority
- tasks
- workstreams
- goals
- decisions
- approvals
- executions
- execution steps
- execution dependencies
- tool calls
- model requests
- credits
- credit reservations
- credit transactions
- company memory
- audit logs
- integrations
- schedules
- events
- outcomes
- performance
- notifications

The database must remain authoritative.

Cloud Run and Trigger.dev must not become the source of truth.

--------------------------------------------------

Google Cloud Run:

Cloud Run is the fast compute/backend layer.

Use it for:

- ORQ8 API services
- Agent Runtime
- Model Gateway
- Tool Gateway
- execution API
- webhooks
- event processing
- fast AI operations
- model calls
- lightweight-to-medium agent execution
- provider routing
- tool execution where appropriate

Cloud Run services should be stateless.

Do not rely on container memory for durable company state.

If a Cloud Run instance disappears, the company must not lose work.

--------------------------------------------------

Trigger.dev:

Trigger.dev is the durable execution/orchestration layer.

Use it for:

- long-running jobs
- multi-step workflows
- retries
- scheduled execution
- durable waits
- human approval waits
- external event waits
- large research
- codebase migrations
- multi-department work
- Decision Councils
- campaigns
- long-running automation
- workflows that may run for minutes/hours
- background execution
- concurrency control
- workflow dependencies

Trigger.dev should orchestrate execution.

It should not become the company database.

--------------------------------------------------

OpenRouter:

OpenRouter provides model access.

It must NOT become:

- the agent runtime
- the permission system
- the credit system
- the company memory
- the workflow engine
- the source of truth

Every model request must go through the ORQ8 Model Gateway.

Never call OpenRouter directly from frontend code.

==================================================
5. ORQ8 MODEL GATEWAY
==================================================

Create or refactor the Model Gateway into a clean internal abstraction.

The rest of ORQ8 should not need to know provider-specific implementation details.

The Agent Runtime should call:

ORQ8 Model Gateway

not:

OpenRouter directly.

The gateway is responsible for:

- provider abstraction
- model selection
- routing
- model capability matching
- cost awareness
- latency awareness
- fallback
- retry policy
- usage tracking
- credit estimation
- credit reservation
- credit settlement
- model request logging
- organization limits
- agent limits
- safety/policy enforcement

Example conceptual interface:

requestModel({
    organizationId,
    agentId,
    departmentId,
    executionId,
    taskId,
    purpose,
    modelPreference,
    complexity,
    messages,
    tools,
    maxCredits,
    metadata
})

Return:

{
    modelRequestId,
    provider,
    model,
    response,
    usage,
    creditsUsed,
    providerCost,
    latency,
    finishReason
}

The exact implementation should follow the existing codebase conventions.

==================================================
6. MODEL ROUTING
==================================================

Do not use the most expensive model for everything.

Introduce task-aware routing.

Examples:

Simple:

- classification
- extraction
- summarization
- basic EA response

→ fast/cheap model

Medium:

- content generation
- analysis
- coding assistance
- research synthesis

→ capable model

Complex:

- architecture
- difficult reasoning
- strategic analysis
- complex debugging
- Decision Council

→ high reasoning capability

The routing layer should eventually consider:

- task complexity
- required reasoning
- latency
- cost
- context size
- tool support
- reliability
- historical performance

Models are replaceable infrastructure.

ORQ8 should remain functional even if the provider changes.

==================================================
7. AGENT RUNTIME
==================================================

Implement a proper ORQ8 Agent Runtime.

An AI employee is not simply a prompt.

An agent has:

- identity
- name
- role
- department
- mission
- responsibilities
- authority
- tools
- budget
- context
- memory
- goals
- current work
- reporting structure
- escalation rules
- approval requirements
- autonomy level
- performance history

The runtime is responsible for:

1. Loading agent identity
2. Loading relevant company context
3. Loading department context
4. Loading task context
5. Loading relevant memory
6. Checking authority
7. Determining required tools
8. Planning execution
9. Calling models
10. Calling tools
11. Updating execution state
12. Handling failures
13. Requesting approval when required
14. Reporting progress
15. Producing an outcome
16. Writing relevant memory
17. Updating performance

Do not create a generic agent loop that blindly calls a model until it returns something.

The runtime must operate within explicit boundaries.

==================================================
8. AGENT AUTHORITY
==================================================

Every agent must have an authority profile.

Conceptually:

CAN DO
CAN SPEND
REQUIRES APPROVAL
CANNOT DO

Examples:

Engineering Agent:

CAN DO:
- inspect repository
- analyze code
- create branch
- run tests
- create draft PR

REQUIRES APPROVAL:
- production deployment
- destructive database migration
- production infrastructure changes

CANNOT DO:
- change its own permissions
- modify company governance
- increase its own budget
- approve its own restricted action

The authority system must be enforced server-side.

Never rely only on prompts.

A model must not be able to grant itself authority.

A prompt must not bypass authority.

An agent must not modify its own permissions.

==================================================
9. AUTONOMY MODES
==================================================

Support:

MANUAL
ASSISTED
AUTONOMOUS

MANUAL:

Founder approval is required for relevant actions.

ASSISTED:

Agent prepares work and recommendations, founder approves consequential actions.

AUTONOMOUS:

Agent can execute within explicitly configured authority.

Autonomy must be granular.

Support restrictions by:

- organization
- department
- agent
- tool
- action
- financial threshold
- risk
- environment

Example:

Agent can deploy to staging automatically.

Agent cannot deploy to production without approval.

==================================================
10. EXECUTION MODEL
==================================================

Introduce a unified ORQ8 Execution abstraction.

Every meaningful execution gets an ORQ8 execution ID.

Conceptually:

{
    executionId,
    organizationId,
    userId,
    agentId,
    departmentId,
    taskId,
    workstreamId,
    parentExecutionId,
    type,
    status,
    priority,
    autonomyLevel,
    requiredApproval,
    triggerRunId,
    startedAt,
    completedAt,
    failureReason,
    outcome
}

Execution states:

CREATED
QUEUED
STARTING
RUNNING
WAITING
APPROVAL_REQUIRED
RESUMING
COMPLETED
FAILED
CANCELLED
TIMED_OUT

BLOCKED should represent a meaningful business dependency and should be distinguishable from technical failure.

One execution may contain many steps.

One execution may make many model requests.

One execution may call many tools.

One execution may create child executions.

==================================================
11. EXECUTION GRAPH
==================================================

Implement the execution relationship:

GOAL
→ WORKSTREAM
→ TASK
→ DEPENDENCY
→ AGENT
→ EXECUTION
→ TOOL / MODEL
→ APPROVAL
→ OUTCOME

Example:

Goal:
Launch product

Workstream:
ORQ8 v2 launch

Tasks:

Engineering:
Build execution runtime

Design:
Finalize company hub

Marketing:
Prepare launch campaign

Sales:
Prepare founder outreach

Finance:
Prepare pricing model

Independent tasks should run concurrently.

Only dependent tasks should wait.

Do NOT serialize the entire company.

==================================================
12. FAST PATH VS DURABLE PATH
==================================================

Implement execution classification.

CLASS A: INSTANT

Examples:

- read company state
- retrieve memory
- simple EA question
- simple classification
- lightweight summarization

Path:

Vercel
→ Cloud Run
→ Supabase / Model Gateway
→ response

Target:

sub-second to a few seconds where practical.

--------------------------------------------------

CLASS B: ACTIVE AI WORK

Examples:

- content generation
- code analysis
- feedback analysis
- small research
- task creation
- simple planning

Path:

Vercel
→ Cloud Run
→ Agent Runtime
→ Model Gateway
→ tools/models
→ Supabase

If execution becomes long-running, transition to Trigger.dev.

--------------------------------------------------

CLASS C: DURABLE

Examples:

- large research
- full codebase migration
- marketing campaign
- multi-department workstream
- Decision Council
- scheduled execution
- browser automation
- large data processing

Path:

ORQ8
→ Trigger.dev
→ Cloud Run
→ Agent Runtime
→ Model Gateway
→ OpenRouter/tools
→ Supabase

==================================================
13. HANDOFF BETWEEN CLOUD RUN AND TRIGGER.DEV
==================================================

The system must support clean handoff.

Example:

User asks EA:

"Analyze our competitors and recommend a launch strategy."

EA determines this is durable work.

Create:

executionId = exec_123

Then:

ORQ8
→ Trigger.dev run
→ Cloud Run Agent Runtime
→ model/tool calls
→ results
→ Supabase
→ realtime
→ founder UI

The founder should see:

"Research started"

Then:

"Research in progress"

Then:

"Research completed"

The founder must be able to inspect what happened.

Do not hide durable execution behind a loading spinner.

==================================================
14. DURABLE WAITING
==================================================

Never keep a model call or Cloud Run process alive just waiting.

Trigger.dev should support durable waits for:

- founder approval
- scheduled time
- external webhook
- customer response
- GitHub event
- integration reconnect
- another task
- human input

Example:

Engineering Agent creates production deployment.

Policy says approval required.

Execution becomes:

APPROVAL_REQUIRED

Trigger.dev waits.

Founder approves.

Execution resumes.

Do not restart the entire workflow unnecessarily.

==================================================
15. APPROVAL FLOW
==================================================

Approval flow:

Agent wants to perform action
↓
Authority check
↓
If allowed:
execute

If approval required:
↓
Create approval
↓
Execution becomes APPROVAL_REQUIRED
↓
Founder Attention receives item
↓
Founder reviews:
WHAT
WHY
WHO
AUTHORITY
RISK
COST
EXPECTED RESULT
↓
Approve / Reject
↓
Audit action
↓
Resume or terminate execution

The agent must never bypass a rejected approval.

Approval requests must be real database records.

==================================================
16. CREDITS SYSTEM
==================================================

Customer-facing usage is called:

ORQ8 Credits

Never expose raw "tokens" to customers.

Raw tokens may be visible to internal administrators.

Credit flow:

1. Estimate
2. Reserve
3. Execute
4. Measure actual usage
5. Settle
6. Release unused reservation

Track credits by:

- model request
- execution
- task
- agent
- department
- organization

Conceptually:

credit_reservation
credit_transaction
credit_balance

Do not charge twice for retries.

Make credit operations idempotent.

Separate:

Provider cost
ORQ8 Credits
Customer revenue

These are different concepts.

==================================================
17. COMPANY MEMORY
==================================================

Memory must be operational.

It is not simply chat history.

Store relevant:

- company facts
- strategic decisions
- policies
- founder preferences
- successful workflows
- failed workflows
- customer insights
- product decisions
- marketing learnings
- agent performance
- important documents
- historical outcomes

Example:

A marketing campaign performs poorly.

ORQ8 records:

campaign objective
strategy
execution
result
measured outcome
lesson

Later:

Marketing Agent plans another campaign.

Relevant memory is retrieved automatically.

The memory should change behavior.

==================================================
18. EVENT-DRIVEN EXECUTION
==================================================

ORQ8 should not depend entirely on founder clicking buttons.

Implement an event-driven architecture.

Potential events:

TASK_CREATED
TASK_COMPLETED
TASK_FAILED
TASK_BLOCKED
APPROVAL_GRANTED
APPROVAL_REJECTED
CUSTOMER_CREATED
LEAD_CREATED
PR_OPENED
PR_MERGED
DEPLOYMENT_FAILED
DEPLOYMENT_SUCCEEDED
NEW_FEEDBACK
GOAL_CHANGED
DEADLINE_APPROACHING
BUDGET_THRESHOLD_REACHED
NEW_EMAIL
NEW_DOCUMENT
INTEGRATION_CONNECTED
PAYMENT_RECEIVED
SUPPORT_TICKET_CREATED

Event:

DEPLOYMENT_FAILED

Could produce:

Event Router
→ Engineering Department
→ Engineering Agent
→ create investigation execution
→ inspect deployment
→ inspect recent changes
→ identify cause
→ propose fix
→ implement fix if authorized
→ test
→ create PR
→ approval if required
→ deploy
→ verify
→ close incident
→ record outcome

This is the intended organic behavior.

==================================================
19. EVENT ROUTER
==================================================

Create a clean internal event abstraction.

An event should contain:

eventId
organizationId
type
source
entityType
entityId
payload
createdAt
actor
correlationId

Events should be persisted.

Consumers should be idempotent.

Do not allow one event to accidentally trigger duplicate work.

Use correlation IDs.

==================================================
20. ORGANIC COMPANY EXECUTION
==================================================

The company should behave like:

COMPANY
↓
GOALS
↓
EA
↓
DEPARTMENTS
↓
WORK
↓
EXECUTION
↓
OUTCOMES
↓
MEMORY
↓
NEW DECISIONS

Not:

USER
↓
CHATBOT
↓
ANSWER

The EA should coordinate work.

Agents should react to relevant events.

Departments should continue unrelated work while another department is blocked.

The system should naturally produce new work when a meaningful event requires it.

Do not create artificial activity simply to make the UI look alive.

==================================================
21. PARALLEL EXECUTION
==================================================

Use concurrency intentionally.

Example:

Founder:
"Prepare the company for launch."

EA decomposes:

Engineering:
finalize release

Marketing:
prepare campaign

Sales:
prepare outreach

Finance:
review pricing

Operations:
prepare support workflow

These can execute concurrently.

Then a synthesis task can wait for them.

Use Trigger.dev concurrency controls.

Prevent uncontrolled agent spawning.

The EA should determine:

- what work is necessary
- what can run concurrently
- what depends on what
- what requires approval
- what should not be done

==================================================
22. RUNAWAY PROTECTION
==================================================

Implement hard limits.

Examples:

- max execution duration
- max model calls
- max credits
- max tool calls
- max iterations
- max retries
- max child executions
- max concurrency
- organization quotas
- agent quotas

If exceeded:

STOP execution safely.

Record:

what happened
why it stopped
what completed
what remains
credits consumed
founder action required

Do not allow an agent loop to continue indefinitely.

==================================================
23. FAILURE HANDLING
==================================================

Differentiate failures.

Examples:

MODEL_FAILURE
TOOL_FAILURE
DATABASE_FAILURE
PERMISSION_FAILURE
APPROVAL_TIMEOUT
CREDIT_EXHAUSTED
INTEGRATION_FAILURE
TRIGGER_FAILURE
EXECUTION_TIMEOUT
VALIDATION_FAILURE

Every failure should capture:

executionId
step
agent
task
department
error
reason if known
retry count
model
provider
tool
completed work
remaining work
required founder action

The UI should clearly explain failures.

Never silently swallow errors.

Never display "completed" if the underlying work failed.

==================================================
24. RETRIES AND IDEMPOTENCY
==================================================

Retries must be safe.

Prevent duplicate:

- emails
- deployments
- payments
- records
- PRs
- external API actions
- notifications

Use idempotency keys for consequential operations.

A retry should know whether a previous step already succeeded.

==================================================
25. CANCELLATION AND PAUSE
==================================================

Founder must be able to:

- pause agent
- pause department
- pause workstream
- cancel execution
- cancel task
- resume execution where possible

Cancellation should propagate to Trigger.dev when appropriate.

Do not simply change a database status while the underlying execution continues running.

Resume from durable state.

Do not unnecessarily restart completed work.

==================================================
26. ADMIN OBSERVABILITY
==================================================

Build internal observability around the same execution model.

Admin should see:

Organizations
Departments
Agents
Tasks
Executions
Trigger runs
Model requests
Tool calls
Credits
Provider cost
Latency
Failures
Retries
Approvals
Anomalies

Drill-down:

Organization
→ Department
→ Agent
→ Task
→ Execution
→ Execution step
→ Model request/tool call

Every execution should be traceable.

Example:

ORQ8 execution:
exec_123

Trigger run:
run_987

Model request:
req_456

Tool calls:
tool_001
tool_002

Approval:
approval_456

Credits:
420

Provider cost:
$0.08

Duration:
2m 13s

Outcome:
completed

This correlation is extremely important.

==================================================
27. ADMIN DASHBOARD METRICS
==================================================

Provide real metrics:

- active companies
- active AI employees
- active executions
- queued executions
- waiting executions
- completed executions
- failed executions
- cancelled executions
- Credits consumed
- provider cost
- average execution duration
- average model latency
- failure rate
- retry rate
- workload by department
- model usage
- provider usage
- anomalies
- runaway executions

Never fabricate these metrics.

==================================================
28. FOUNDER EXPERIENCE
==================================================

The founder should not need to understand Trigger.dev, Cloud Run or OpenRouter.

They should see:

ORQ8 is working.

Examples:

"Engineering is investigating a failed deployment."

"Marketing is preparing the launch campaign."

"Finance is reviewing the pricing model."

"Engineering needs approval to deploy to production."

"Customer Success has processed 18 new tickets."

"Your launch workstream is waiting on final pricing approval."

The founder can ask EA:

"What happened today?"

"What are my biggest blockers?"

"What needs me?"

"What did Engineering accomplish?"

"What are we spending?"

"What is consuming Credits?"

"What decisions are waiting for me?"

"Why did this task fail?"

"Why did the agent choose this approach?"

The answers must come from actual system state.

==================================================
29. FOUNDER'S ATTENTION
==================================================

Create a unified attention system.

Important items:

- approval requests
- blocked work
- strategic decisions
- budget requests
- permission requests
- failed important execution
- unusual spending
- major risks
- deadline risks
- integration failures

Each item should explain:

WHAT
WHY
WHO
AUTHORITY
IMPACT
COST
NEXT ACTION

Possible actions:

Approve
Reject
Ask EA
View details
Delegate
Modify authority
Pause
Retry
Cancel

==================================================
30. REALTIME
==================================================

Use Supabase realtime or the existing realtime architecture where appropriate.

When important state changes:

- execution started
- execution completed
- task changed
- agent status changed
- approval created
- approval approved
- approval rejected
- execution failed
- credits changed
- workstream progress changed

The UI should update without requiring a full page refresh.

Do not introduce unnecessary polling.

==================================================
31. AGENT STATUS
==================================================

Agent statuses should represent actual execution state.

Examples:

ACTIVE
WORKING
WAITING
BLOCKED
REVIEW
DONE
PAUSED
OFFLINE

Do not update status simply because the UI is open.

Status should reflect actual system state.

==================================================
32. TASK SYSTEM
==================================================

Tasks should support:

BACKLOG
TO DO
DOING
REVIEW
DONE
BLOCKED

Task fields should support:

- title
- description
- department
- agent
- priority
- status
- dependencies
- deadline
- approval requirements
- workstream
- tools
- files
- activity
- decisions
- outcome
- executionId

Task status should be driven by actual execution.

Do not simulate progress.

==================================================
33. DEPARTMENT EXECUTION
==================================================

Departments are organizational units, not filters.

Each department should have:

- mission
- responsible agent
- agents
- work
- goals
- workstreams
- tools
- files
- decisions
- approvals
- performance
- budget
- activity
- memory
- integrations

Departments should be capable of producing work independently.

==================================================
34. EXAMPLE: ENGINEERING
==================================================

Engineering execution should eventually support:

GitHub
→ repository
→ branch
→ files
→ commits
→ PR
→ CI
→ deployment
→ monitoring

Example:

Deployment fails.

Event:
DEPLOYMENT_FAILED

Engineering Agent:

1. receives event
2. loads incident context
3. loads recent deployment
4. inspects relevant commits
5. checks logs
6. identifies likely cause
7. determines authority
8. creates investigation execution
9. proposes fix
10. implements if authorized
11. runs tests
12. creates PR
13. requests review if necessary
14. deploys if authorized
15. verifies
16. closes incident
17. records outcome
18. stores useful memory

The founder should see this progress in real time.

==================================================
35. EXAMPLE: SALES
==================================================

New lead arrives.

Event:
LEAD_CREATED

Sales Agent:

1. enriches lead
2. checks ICP
3. researches account
4. scores opportunity
5. checks previous company knowledge
6. drafts outreach
7. checks authority
8. sends automatically if authorized
9. otherwise requests approval
10. waits for response
11. schedules follow-up
12. updates CRM
13. escalates important opportunity

Do not repeatedly ask the model what to do if the workflow state already tells the runtime what comes next.

==================================================
36. EXAMPLE: MARKETING
==================================================

Marketing workstream:

"Launch ORQ8 v2"

Marketing Agent:

1. loads launch goal
2. retrieves brand memory
3. reviews prior campaigns
4. researches relevant competitors
5. proposes campaign
6. creates assets
7. requests approval where required
8. publishes if authorized
9. monitors results
10. evaluates performance
11. adapts campaign
12. records learning

This should become an ongoing operational loop.

==================================================
37. DECISION CENTER
==================================================

Strategic decisions should use structured execution.

Flow:

DEFINE DECISION
↓
LOAD COMPANY CONTEXT
↓
GATHER EVIDENCE
↓
ANALYZE
↓
IDENTIFY ASSUMPTIONS
↓
CHALLENGE ASSUMPTIONS
↓
RISKS
↓
ALTERNATIVES
↓
TRADEOFFS
↓
RECOMMENDATION
↓
FOUNDER APPROVAL IF REQUIRED
↓
EXECUTE
↓
MEASURE OUTCOME
↓
STORE DECISION

Do not create theatrical "AI debates."

If multiple models are used, they should provide useful analytical diversity.

==================================================
38. IDEA VALIDATION
==================================================

EA should not blindly execute every founder idea.

For appropriate decisions, evaluate:

Problem
Customer
Evidence
Assumptions
Market
Feasibility
Cost
Opportunity cost
Risks
Alternatives
Expected value
Strategic alignment

Classify information as:

FACT
EVIDENCE
ASSUMPTION
RECOMMENDATION

Possible result:

Proceed
Modify
Validate first
Do not proceed

The founder remains the final authority unless explicit autonomy exists.

==================================================
39. SECURITY
==================================================

Enforce security server-side.

Required:

- tenant isolation
- organization authorization
- department authorization
- agent authorization
- tool authorization
- secret protection
- admin authentication
- execution authorization
- credit checks
- approval checks
- audit logging

Never trust:

- model output
- client-side permissions
- frontend status
- prompt instructions
- agent-generated authority
- user-provided organization IDs without authorization

Never expose:

OPENROUTER_API_KEY
SUPABASE_SERVICE_ROLE_KEY
TRIGGER_SECRET_KEY
Cloud credentials

to the browser.

==================================================
40. ENVIRONMENT VARIABLES
==================================================

Audit current environment variables first.

Expected categories include:

Supabase:
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY

OpenRouter:
OPENROUTER_API_KEY

Trigger.dev:
TRIGGER_SECRET_KEY
TRIGGER_PROJECT_REF

Google Cloud:
appropriate Cloud Run service configuration
service authentication
runtime secrets

Do not blindly create variables that already exist.

Do not hard-code secrets.

Do not commit secrets.

Use the project's current deployment conventions.

==================================================
41. GOOGLE CLOUD RUN IMPLEMENTATION
==================================================

Cloud Run should initially support clearly separated internal modules/services.

Possible boundaries:

orq8-execution-api
orq8-agent-runtime
orq8-model-gateway
orq8-tool-gateway
orq8-webhooks

Do not over-fragment the deployment unnecessarily.

It is acceptable to deploy fewer Cloud Run services initially while maintaining logical code boundaries.

For example:

Cloud Run
├── execution API
├── agent runtime
├── model gateway
├── tool gateway
└── webhook/event handlers

These can initially share a deployment if that is more practical.

The important thing is architectural separation.

==================================================
42. TRIGGER.DEV IMPLEMENTATION
==================================================

Create Trigger.dev tasks around business workflows.

Examples:

runAgentExecution
runResearchWorkflow
runDecisionWorkflow
runApprovalWorkflow
runScheduledCompanyBriefing
runCampaignWorkflow
runEngineeringIncidentWorkflow

Trigger tasks should:

- load durable state
- call Cloud Run where appropriate
- update execution state
- wait when necessary
- retry safe operations
- respect concurrency
- respect cancellation
- record failures
- return meaningful outcomes

Do not put all business logic into Trigger.dev task definitions.

The Agent Runtime should own agent behavior.

==================================================
43. DATABASE MODEL
==================================================

Extend the existing database carefully.

Likely entities:

organizations
departments
agents
agent_authority
goals
workstreams
tasks
task_dependencies
executions
execution_steps
execution_dependencies
events
approvals
model_requests
tool_calls
credit_balances
credit_reservations
credit_transactions
memories
decisions
outcomes
audit_logs
integrations
schedules
notifications

Reuse existing tables where possible.

Do not duplicate existing concepts under new names without reason.

Use migrations.

Maintain backward compatibility where practical.

==================================================
44. OBSERVABILITY
==================================================

Every execution should have:

executionId

Every model call:

modelRequestId

Every Trigger.dev workflow:

triggerRunId

Every consequential tool call:

toolCallId

Correlate them.

Logs should allow:

executionId
organizationId
agentId
taskId
departmentId
modelRequestId
triggerRunId

to be traced across the system.

Do not rely only on console logs.

==================================================
45. PERFORMANCE
==================================================

Optimize for real execution speed.

Do NOT optimize by removing important controls.

Use:

- fast path
- durable path
- model routing
- parallel execution
- selective context retrieval
- selective memory retrieval
- caching where safe
- connection reuse
- asynchronous processing
- durable waits
- appropriate model selection
- bounded retries

Avoid:

- unnecessary model calls
- unnecessary database round trips
- sequential execution of independent tasks
- keeping Cloud Run instances alive waiting for external events
- polling Trigger.dev unnecessarily
- sending the entire company history into every model request

The objective is:

FAST WHEN POSSIBLE
DURABLE WHEN NECESSARY
SAFE ALWAYS

==================================================
46. CONTEXT MANAGEMENT
==================================================

Do not send the entire company database to every agent.

Context should be assembled from:

Company
+
Department
+
Agent
+
Task
+
Relevant workstream
+
Relevant memory
+
Relevant decisions
+
Relevant files
+
Relevant events
+
Relevant tool results

Only retrieve what is necessary.

Context assembly should be deterministic and observable.

==================================================
47. COMPANY CONTINUITY
==================================================

The company must continue operating even when the founder is not actively using the dashboard.

Example:

Founder logs out.

Marketing campaign continues.

Engineering task continues.

Scheduled finance review runs.

An approval remains waiting.

An external event can trigger work.

When founder returns:

The dashboard reflects actual current state.

Do not fabricate "while you were away" activity.

==================================================
48. FOUNDER CONTROL
==================================================

The founder remains in control.

The system must make it easy to:

- pause
- approve
- reject
- modify authority
- change budget
- change autonomy
- cancel
- inspect
- understand
- resume

The product should reduce operational overhead without removing control.

==================================================
49. ADMIN VS FOUNDER DATA
==================================================

Founder sees:

- Credits
- work
- outcomes
- execution status
- meaningful usage
- company-level performance

Admin can see:

- raw model usage
- tokens
- provider costs
- request metadata
- model latency
- provider failures
- infrastructure metrics
- execution traces
- organization usage
- anomalies

Never expose internal infrastructure complexity unnecessarily to founders.

==================================================
50. MIGRATION FROM RAILWAY
==================================================

Audit the existing Railway system.

For every Railway component identify:

KEEP
MOVE TO CLOUD RUN
MOVE TO TRIGGER.DEV
REMOVE
REFACTOR

Do not shut down Railway until the replacement is verified.

Recommended migration approach:

1. Map Railway functionality
2. Build Cloud Run equivalent
3. Build Trigger.dev durable workflows
4. Connect ORQ8 API
5. Run both paths where safe
6. Test
7. Compare results
8. Migrate traffic
9. Monitor
10. Remove obsolete Railway functionality only after confirmation

Do not create two active production model routers indefinitely.

==================================================
51. VERTICAL SLICE FIRST
==================================================

Before attempting to migrate every feature, implement one complete end-to-end vertical slice.

Use:

Founder
→ EA
→ Engineering task
→ ORQ8 Execution
→ Trigger.dev if durable
→ Agent Runtime
→ Model Gateway
→ OpenRouter
→ Supabase
→ Realtime
→ Founder dashboard
→ Credits
→ Admin observability

Example:

Founder tells EA:

"Investigate the current engineering backlog and identify the highest priority task."

EA creates execution.

Agent retrieves company context.

Agent retrieves engineering context.

Agent retrieves relevant tasks.

Agent calls model through Model Gateway.

Model Gateway routes through OpenRouter.

Agent produces structured result.

Execution is persisted.

Credits are settled.

Realtime updates founder.

Admin can inspect the complete execution.

This vertical slice must work before building broad infrastructure.

==================================================
52. TEST THE FOLLOWING AFTER VERTICAL SLICE
==================================================

Test 1:
Simple EA question.

Test 2:
Medium AI task.

Test 3:
Long-running research.

Test 4:
Human approval pause.

Test 5:
Approval rejection.

Test 6:
Resume after approval.

Test 7:
Model failure.

Test 8:
Model fallback.

Test 9:
Tool failure.

Test 10:
Credit exhaustion.

Test 11:
Execution timeout.

Test 12:
Cancellation.

Test 13:
Retry.

Test 14:
Duplicate-event protection.

Test 15:
Parallel department execution.

Test 16:
Concurrent agents.

Test 17:
Company logout while work continues.

Test 18:
Founder returns after work completes.

Test 19:
Realtime state update.

Test 20:
Admin trace from organization → agent → execution → model request.

==================================================
53. REAL-TIME UI EXPECTATION
==================================================

The company dashboard should visibly reflect actual execution.

Example:

Engineering Agent
WORKING

Task:
Investigate deployment failure

Progress:
Inspecting recent deployment

Then:

Inspecting logs

Then:

Fix identified

Then:

Awaiting production approval

Then founder sees:

APPROVAL REQUIRED

Founder approves.

Agent:

RESUMING

Then:

DEPLOYING

Then:

VERIFYING

Then:

DONE

The UI should not invent intermediate states.

Only display states backed by actual execution records/events.

==================================================
54. EA BEHAVIOR
==================================================

The EA is not merely a chat assistant.

The EA understands:

- company
- goals
- departments
- agents
- workstreams
- tasks
- decisions
- permissions
- approvals
- memory
- budgets
- execution state

The EA can:

- answer questions
- create work
- delegate
- coordinate
- explain
- summarize
- escalate
- request approval
- monitor execution
- identify blockers
- synthesize department results

The EA should not personally perform every task.

It coordinates the organization.

==================================================
55. UI IMPLEMENTATION
==================================================

The backend implementation must support the redesigned ORQ8 company hub.

Company hub hierarchy:

1. Founder's Attention
2. Major goals/workstreams
3. Live organization
4. Active agents
5. Current work
6. Recent activity
7. Performance
8. Secondary information

Persistent EA on the company page.

Agent status should come from real execution.

Tasks should reflect actual state.

Approvals should come from real approval records.

Credits should come from real credit records.

Do not build static dashboard mockups.

==================================================
56. NO FAKE DATA
==================================================

This is a hard requirement.

Do not create fake:

- agents
- activity
- tasks
- metrics
- execution progress
- completed work
- model usage
- credits
- performance
- approvals
- outcomes

For development, test fixtures may exist behind explicit development/test configuration.

Production must use real state.

Never make a UI look operational when the backend is not actually executing work.

==================================================
57. ERROR UX
==================================================

Errors should be understandable.

Bad:

"Something went wrong."

Good:

"Engineering Agent could not complete the deployment investigation because the GitHub integration is disconnected."

Show:

What happened
Why
What completed
What remains
What founder needs to do

Provide recovery actions where possible.

==================================================
58. BILLING ARCHITECTURE
==================================================

Do not hard-code final pricing.

The architecture should support:

subscription
+
included Credits
+
additional Credits
+
organization capacity
+
advanced governance
+
enterprise features

Credits should be metered independently from provider cost.

Do not expose provider economics directly to customers.

==================================================
59. CODE QUALITY
==================================================

Follow the existing project's:

- framework conventions
- TypeScript conventions
- database conventions
- API conventions
- error handling
- authentication
- testing patterns
- deployment architecture

Prefer small composable modules.

Do not create giant files.

Do not create giant universal "agent.ts" or "backend.ts" files containing the entire system.

Use clear boundaries:

agent-runtime
model-gateway
execution
events
approvals
credits
memory
tools
audit
integrations

==================================================
60. DO NOT OVERENGINEER
==================================================

The goal is not to create a distributed systems diagram for its own sake.

Start with the smallest architecture that correctly supports:

- real AI work
- durable execution
- approvals
- retries
- credits
- realtime
- audit
- multiple agents
- multiple departments
- events

Expand only when necessary.

Do not create unnecessary microservices.

Logical separation is more important than deploying every module separately.

==================================================
61. IMPLEMENTATION ORDER
==================================================

Implement in this order:

PHASE 1
Audit existing system.

PHASE 2
Define execution abstraction.

PHASE 3
Define/extend database state.

PHASE 4
Build/refactor ORQ8 Model Gateway.

PHASE 5
Build/refactor Agent Runtime.

PHASE 6
Integrate Cloud Run.

PHASE 7
Integrate Trigger.dev.

PHASE 8
Implement execution handoff.

PHASE 9
Implement approvals and durable waiting.

PHASE 10
Implement Credits reservation/settlement.

PHASE 11
Implement events/event router.

PHASE 12
Implement execution graph/dependencies.

PHASE 13
Implement realtime updates.

PHASE 14
Implement admin observability.

PHASE 15
Connect founder/company dashboard.

PHASE 16
Migrate Railway workloads.

PHASE 17
Implement event-driven department workflows.

PHASE 18
Performance optimization.

PHASE 19
Security audit.

PHASE 20
End-to-end QA.

==================================================
62. REQUIRED DELIVERABLE AFTER EACH PHASE
==================================================

For each phase provide:

- what was inspected
- what changed
- files changed
- database changes
- APIs added/changed
- environment variables
- migration requirements
- tests added
- known limitations
- next phase

Do not claim a feature is complete if it only exists in the UI.

A feature is complete only when:

UI
+
API
+
database
+
execution
+
permissions
+
error handling
+
realtime where needed
+
audit
+
tests

are appropriately connected.

==================================================
63. FINAL ACCEPTANCE CRITERIA
==================================================

The implementation is successful when all of the following are true:

1. Founder can ask EA to perform meaningful work.

2. EA can create and delegate work.

3. Agents have real identity and authority.

4. Agent execution goes through the ORQ8 Agent Runtime.

5. Model calls go through the ORQ8 Model Gateway.

6. OpenRouter is abstracted behind ORQ8.

7. Cloud Run performs fast compute.

8. Trigger.dev performs durable workflows.

9. Supabase stores durable business state.

10. Long-running work survives request termination.

11. Approval workflows pause and resume correctly.

12. Credits are reserved and settled correctly.

13. Provider cost is separately tracked.

14. Events can trigger real work.

15. Independent tasks can execute concurrently.

16. Dependencies are respected.

17. Failures are visible.

18. Retries are safe.

19. Consequential actions are authorized.

20. Founder can cancel/pause work.

21. Execution state reaches the dashboard in realtime.

22. Admin can trace an execution end-to-end.

23. Company memory is written and retrieved.

24. Agent performance reflects actual work.

25. No production fake activity exists.

26. No duplicate execution infrastructure exists.

27. Railway workloads can be migrated safely.

28. The system can continue working while the founder is offline.

29. The founder does not need to understand the underlying infrastructure.

30. The system feels like a continuously operating company.

==================================================
64. THE MOST IMPORTANT PRODUCT TEST
==================================================

Do not judge the implementation by how impressive the architecture diagram looks.

Judge it by this scenario:

A founder tells ORQ8:

"Prepare the company for our product launch."

ORQ8 should understand the company context.

EA should determine what work is actually necessary.

It should create an appropriate launch workstream.

It should delegate work across relevant departments.

Independent work should begin concurrently.

Engineering should work on release readiness.

Marketing should work on the launch campaign.

Sales should prepare outreach.

Finance should review pricing/revenue implications.

Operations should prepare support processes.

Agents should use their actual tools.

Long-running work should run through Trigger.dev.

Fast work should run through Cloud Run.

All AI requests should go through the Model Gateway and OpenRouter.

Credits should be consumed and recorded.

Approvals should appear only when authority requires them.

The founder should see meaningful progress.

If something fails, the system should explain it.

If something is blocked, unrelated work should continue.

If the founder approves an action, the workflow should resume.

When work completes, outcomes should be recorded.

Important learnings should enter company memory.

The EA should then be able to answer:

"What did the company accomplish?"

"What still needs me?"

"What is blocked?"

"What did Engineering do?"

"What did Marketing do?"

"What did this launch preparation cost?"

"What decisions did I make?"

"What should happen next?"

Those answers must come from actual company state.

==================================================
65. FINAL PRINCIPLE
==================================================

Build ORQ8 as an operating system for a company, not as an AI interface.

The underlying loop is:

EVENT
→ CONTEXT
→ DECISION
→ AUTHORITY CHECK
→ EXECUTION
→ TOOL/MODEL
→ OBSERVATION
→ OUTCOME
→ MEMORY
→ NEXT ACTION

The founder defines direction.

The EA coordinates.

Departments organize work.

AI employees execute.

Cloud Run provides fast compute.

Trigger.dev provides durable execution.

OpenRouter provides model access.

The Model Gateway controls AI access.

Supabase stores durable state.

The Execution Graph connects everything.

Credits measure execution capacity.

Approvals preserve founder control.

Memory allows the organization to learn.

Audit provides accountability.

Realtime makes the organization visible.

The final experience should be:

"This is my company."

"These are my AI employees."

"This is what they are doing."

"This is what has been completed."

"This is what is blocked."

"This is what needs my attention."

"This is what the company is spending."

"I can understand why ORQ8 did something."

"I can intervene when necessary."

"I do not have to manually operate every part of the company."

That is the standard for the implementation.


====================================================================================================
SECTION 5 — IMPLEMENTATION EXECUTION BRIEF (AUTH, FOUNDER ATTENTION, NAVIGATION, COMPANY HUB, LOAD SCALE, CLOUD RUN PREP)
====================================================================================================

ORQ8 IMPLEMENTATION EXECUTION BRIEF

You are continuing implementation of ORQ8.

ORQ8 is an AI operating system for running a company. The current objective is to move the product from the existing implementation toward the new organizational operating system architecture while preserving working functionality and avoiding unnecessary rewrites.

IMPORTANT:

Do not treat the items below as independent tasks.

They are a coordinated implementation sequence.

Before changing code, inspect the existing repository, current architecture, current database state, existing authentication, existing navigation, current company page, execution infrastructure, load-test state, and deployment configuration.

Do not guess about the current implementation.

Do not create duplicate systems.

Do not replace working infrastructure without first understanding why it exists.

==================================================
1. START WITH THE PRODUCT REDESIGN AUDIT
==================================================

First read:

docs/60_PRODUCT_REDESIGN_AUDIT.md

Do this BEFORE making code changes.

Use the audit as the starting point, but do not blindly follow it.

Compare the proposed architecture against the actual repository.

Specifically verify:

- current routes
- current layouts
- current auth flow
- current company page
- current navigation
- current EA implementation
- current task system
- current agent system
- current departments
- current approvals
- current realtime
- current database schema
- current API routes
- current execution infrastructure
- current Railway services
- current Trigger.dev implementation
- current Cloud Run preparation
- current testing infrastructure

Then produce an architecture reconciliation:

CURRENT SYSTEM
→ AUDIT PROPOSAL
→ ACTUAL GAP
→ REQUIRED CHANGE

Identify:

KEEP
REFACTOR
MOVE
REPLACE
MISSING

Do not begin UI implementation until this reconciliation is complete.

If the audit proposes something that conflicts with the newer ORQ8 architecture, update the proposed architecture before coding.

The newer execution architecture takes precedence:

Vercel
→ Cloud Run
→ ORQ8 Agent Runtime
→ ORQ8 Model Gateway
→ OpenRouter

and for durable execution:

Vercel / Cloud Run
→ Trigger.dev
→ Cloud Run / Agent Runtime
→ Model Gateway
→ OpenRouter

Supabase remains the durable source of truth.

==================================================
2. IMPLEMENTATION PRIORITY
==================================================

Follow this order unless the repository reveals a concrete dependency that requires a different sequence:

PHASE 0
Architecture audit and reconciliation

PHASE 1
Auth stabilization and verification

PHASE 2
Founder's Attention

PHASE 3
Global navigation

PHASE 4
Company page redesign

PHASE 5
Load-scale diagnostic recovery

PHASE 6
Browser QA of redesigned auth and core navigation

PHASE 7
Cloud Run deployment preparation and walkthrough

PHASE 8
Logical commits and final verification

Do not mix unrelated changes into the same implementation step.

==================================================
3. AUTH OVERHAUL
==================================================

The authentication overhaul has priority over the new application-shell work.

First inspect the current authentication implementation.

Verify:

- login
- signup
- logout
- session restoration
- protected routes
- middleware
- server-side auth
- client-side auth state
- redirects
- callback handling
- expired sessions
- invalid sessions
- loading state
- error state
- authenticated state
- unauthenticated state
- company selection
- first-time user onboarding
- existing users
- mobile behavior

Fix the underlying auth architecture rather than masking individual symptoms.

Do not introduce a second authentication system.

Do not break existing authenticated sessions unnecessarily.

Do not change unrelated application behavior while fixing auth.

==================================================
4. AUTH COMMIT
==================================================

Once the authentication overhaul is implemented:

Run the relevant tests.

Run type checking.

Run linting if configured.

Verify the major auth states.

Verify protected routes.

Verify redirects.

Verify logout.

Verify session persistence.

Verify that existing application functionality remains accessible.

Only after verification:

CREATE A DEDICATED AUTH COMMIT.

Commit only auth-related changes and the tests required for them.

Use a clear commit message such as:

feat(auth): overhaul authentication flow

Do not combine the company page redesign with this commit.

Do not combine navigation changes with this commit.

Do not combine Cloud Run work with this commit.

==================================================
5. FOUNDER'S ATTENTION
==================================================

After verified auth, implement Founder's Attention.

This must be backed by real data.

Do NOT build a static dashboard section.

The system should identify actual items requiring founder attention.

Examples:

- pending approval
- blocked task
- permission request
- budget request
- failed important execution
- strategic decision
- deadline risk
- integration failure
- unusual spending
- agent escalation

The API should derive these items from existing ORQ8 state.

Potential sources:

approvals
tasks
executions
agents
workstreams
decisions
budgets
integrations
notifications
audit/execution state

Do not invent attention items.

Each item should contain enough information for the founder to understand:

WHAT
WHY
WHO
IMPACT
AUTHORITY
NEXT ACTION

Actions should be connected to real backend operations.

Examples:

Approve
Reject
View
Ask EA
Retry
Pause
Cancel
Delegate

Do not build fake buttons that only update frontend state.

==================================================
6. FOUNDER'S ATTENTION PAGE
==================================================

Create the Founder's Attention page using the real API.

The page should prioritize urgency and relevance.

Avoid turning every item into a large decorative card.

Use a dense operational interface.

The founder should be able to understand:

"What needs me right now?"

before seeing lower-priority information.

The page should update when new attention items appear.

Use existing realtime infrastructure where appropriate.

Do not introduce unnecessary polling.

==================================================
7. COMPANY PAGE
==================================================

After Founder's Attention is functional, rebuild the company page.

Target layout:

75%:
Company / organizational operating hub

25%:
Persistent Executive Agent

The 75% section should represent the actual organization.

It should show meaningful live state such as:

- company goals
- active workstreams
- departments
- AI employees
- current work
- blocked work
- important activity
- execution state

The 25% EA area should be persistent.

It is not a separate chatbot page.

It should behave as the company's Executive Agent.

==================================================
8. PERSISTENT EA
==================================================

The EA conversation must be queue-based and execution-aware.

Do not implement:

user message
→ model response
→ forget

Instead:

Founder message
→ EA interprets intent
→ determine whether work is required
→ create/continue execution
→ delegate where necessary
→ show execution state
→ return response
→ continue monitoring
→ update founder when meaningful state changes occur

The conversation should be capable of showing:

- message
- task created
- agent assigned
- execution started
- waiting
- approval required
- completed
- failed
- blocked

The EA should be able to continue working while the founder sends another message.

Multiple founder requests should not unnecessarily cancel previous work.

==================================================
9. EA QUEUE
==================================================

Treat EA work as an execution queue rather than a sequence of blocking chat responses.

The EA should support:

QUEUED
RUNNING
WAITING
APPROVAL_REQUIRED
COMPLETED
FAILED
CANCELLED

The UI should make the relationship between conversation and work visible.

For example:

Founder:
"Prepare the launch."

EA:
"I'll coordinate Engineering, Marketing and Sales."

Then:

Launch preparation
RUNNING

Engineering
WORKING

Marketing
WORKING

Sales
WORKING

The founder should be able to continue talking to the EA without waiting for all work to finish.

==================================================
10. GLOBAL NAVIGATION
==================================================

After the verified auth overhaul and Founder's Attention implementation, begin the global navigation redesign.

New primary structure:

COMPANY
WORK
DEPARTMENTS
DECISIONS
REPORTS

Use this structure as the primary mental model.

Suggested:

COMPANY
- Overview
- Workstreams
- Activity

WORK
- All Work
- My Attention
- Tasks
- Reviews

DEPARTMENTS
- Engineering
- Product
- Marketing
- Sales
- Finance
- Operations
- etc.

DECISIONS
- Decision Center
- Pending Decisions
- Decision History

REPORTS
- Company
- Departments
- Performance
- Costs

Secondary functionality can remain available through appropriate submenus/settings:

- Memory
- Files
- Approvals
- Budgets
- Audit
- Integrations
- Notifications
- Governance
- Settings

Do not delete existing functionality merely because it is not in the primary navigation.

Move functionality into the correct workspace.

==================================================
11. NAVIGATION REDIRECTS
==================================================

Existing routes must not simply disappear.

For every route affected by the navigation redesign:

1. identify the existing route
2. identify its new destination
3. preserve functionality
4. create redirects where appropriate
5. update internal links
6. verify deep links
7. verify browser refresh
8. verify authenticated access
9. verify unauthorized access

Do not create redirect loops.

Do not silently break bookmarked routes.

Do not remove old routes until their replacement behavior is verified.

==================================================
12. NAVIGATION COMMIT
==================================================

Once the navigation redesign and redirects are tested:

Create a dedicated navigation commit.

Example:

feat(nav): rebuild company operating system navigation

Do not include unrelated Cloud Run changes.

Do not include load-test cleanup.

Do not mix experimental UI work into this commit.

==================================================
13. LOAD-SCALE WORK
==================================================

There is existing paused load-scale work.

Resume it carefully.

First inspect the previous diagnostic state.

Determine:

- what load test was running
- what processes were orphaned
- which Postgres processes are actually orphaned
- whether any active production process could be affected
- why the previous diagnostic was paused
- what the previous head-to-head comparison measured

DO NOT blindly kill database processes.

Only clear processes that are verified to be orphaned/stale and safe to terminate.

Do not interrupt healthy production workloads.

After cleanup:

rerun the head-to-head diagnostic.

Capture:

- throughput
- latency
- concurrency
- error rate
- CPU
- memory
- database pressure
- connection behavior
- queue behavior
- execution duration

Compare results against the previous baseline.

Do not declare an improvement without measured evidence.

==================================================
14. LOAD TEST OUTPUT
==================================================

Produce a concise diagnostic report:

BASELINE
CURRENT
DELTA
BOTTLENECK
RECOMMENDATION

If performance is worse, investigate why.

If performance improves, identify which change caused the improvement.

Do not optimize blindly.

==================================================
15. AUTH BROWSER QA
==================================================

After the auth overhaul is committed and the relevant application is running, open the redesigned authentication pages in a browser.

Visually inspect every important state.

Check:

- login
- signup
- forgot password if supported
- loading
- validation errors
- invalid credentials
- successful authentication
- logout
- session restoration
- expired session
- mobile viewport
- desktop viewport
- focus states
- keyboard navigation
- disabled states
- error messaging

Compare against ORQ8's brand rules.

The design should be:

premium
technical
human
calm
trustworthy
clear
operational

Avoid:

generic AI gradients
excessive glassmorphism
neon styling
decorative animations
AI-slop visuals
excessive rounded cards
unnecessary illustrations
marketing-style clutter

Use sentence case.

Do not use em dashes.

Do not sacrifice usability for visual polish.

==================================================
16. BRAND QA
==================================================

Check:

Typography
Spacing
Hierarchy
Buttons
Inputs
Borders
States
Icons
Loading states
Error states
Mobile layout
Desktop layout
Accessibility

The auth experience should feel like the same product as the company operating system.

==================================================
17. CLOUD RUN PREPARATION
==================================================

After the product-side work is stable, begin Cloud Run deployment preparation.

Do not immediately destroy or disable Railway.

First inspect the current Railway architecture.

Identify:

- model router
- API services
- background workers
- environment variables
- secrets
- endpoints
- scheduled jobs
- webhooks
- dependencies
- database access
- provider access

Map each component:

RAILWAY
→ CLOUD RUN
or
RAILWAY
→ TRIGGER.DEV
or
RAILWAY
→ REMOVE
or
RAILWAY
→ KEEP TEMPORARILY

The target architecture is:

Vercel
= frontend / entry point

Supabase
= durable state

Cloud Run
= fast ORQ8 compute

Trigger.dev
= durable execution

OpenRouter
= model provider access

ORQ8 Model Gateway
= model abstraction/routing/credits

ORQ8 Agent Runtime
= agent behavior

==================================================
18. CLOUD RUN WALKTHROUGH
==================================================

When reaching Cloud Run deployment, do not silently make production infrastructure changes that require my credentials, billing confirmation, or external authorization.

Walk me through the required setup.

Clearly separate:

YOU CAN PREPARE
from
I MUST CONFIGURE / AUTHORIZE

Prepare:

- Dockerfile if needed
- Cloud Run service structure
- runtime configuration
- health endpoint
- deployment configuration
- environment variable list
- secret requirements
- service boundaries
- local verification
- production verification checklist

Then tell me exactly what I need to do in Google Cloud.

Do not invent Google Cloud project IDs, service accounts, regions, credentials or secrets.

==================================================
19. CLOUD RUN SERVICE DESIGN
==================================================

Do not turn Cloud Run into a giant monolithic backend unnecessarily.

Logical boundaries should exist for:

- execution API
- Agent Runtime
- Model Gateway
- Tool Gateway
- webhooks/events

They may initially be deployed as one or a small number of Cloud Run services if that reduces operational complexity.

The important requirement is clear internal separation.

Cloud Run must remain stateless.

Durable company state belongs in Supabase.

==================================================
20. TRIGGER.DEV
==================================================

Trigger.dev remains responsible for durable work.

Use it for:

- long-running agent work
- retries
- scheduled jobs
- approval waits
- external event waits
- multi-step workflows
- large research
- multi-department workflows

Do not move durable execution into Cloud Run just because Cloud Run is being introduced.

Cloud Run:
FAST COMPUTE

Trigger.dev:
DURABLE EXECUTION

==================================================
21. OPENROUTER
==================================================

All model access must remain behind the ORQ8 Model Gateway.

Never:

frontend
→ OpenRouter

Never:

agent
→ direct provider call

Instead:

Agent Runtime
→ Model Gateway
→ OpenRouter
→ model

The Model Gateway remains responsible for:

- routing
- provider abstraction
- model selection
- usage tracking
- Credits
- fallback
- limits
- logging

==================================================
22. COMMITS
==================================================

Keep commits logical and reviewable.

At minimum, aim for commits such as:

1.
feat(auth): overhaul authentication flow

2.
feat(attention): add founder attention API and workspace

3.
feat(nav): rebuild company operating system navigation

4.
feat(company): rebuild company org hub and persistent EA

5.
test: stabilize auth and application integration tests

6.
chore(infra): prepare Cloud Run execution services

7.
chore(load): resume and document scale diagnostics

Do not create one giant commit containing the entire redesign.

Do not commit unrelated temporary/debug files.

Do not commit secrets.

==================================================
23. BEFORE EACH COMMIT
==================================================

Run the appropriate:

- tests
- typecheck
- lint
- build
- route checks
- database checks
- integration checks

Review the diff.

Remove accidental changes.

Ensure no credentials are included.

Ensure migrations are intentional.

Then commit.

Commit messages should describe the actual change.

==================================================
24. DO NOT DO THESE THINGS
==================================================

DO NOT:

- rewrite the whole application
- create duplicate systems
- create fake company activity
- create fake execution progress
- create fake metrics
- create fake Founder Attention items
- replace Railway before verification
- kill database processes blindly
- bypass auth
- expose secrets
- expose provider keys to the browser
- call OpenRouter directly from frontend
- put durable state in Cloud Run memory
- turn Trigger.dev into the database
- make EA a disconnected chatbot
- make the company page a static dashboard
- remove old routes without migration
- break existing functionality
- create unnecessary microservices
- optimize screenshots instead of execution
- introduce decorative UI that does not represent real state
- claim something is complete when only the frontend exists

==================================================
25. DEFINITION OF DONE
==================================================

A phase is NOT complete because the UI renders.

It is complete when the relevant layers work together.

For example, Founder's Attention is complete only when:

real data
→ API
→ authorization
→ database
→ UI
→ actions
→ realtime/update behavior
→ error handling

are connected.

The company hub is complete only when:

company state
→ departments
→ agents
→ work
→ execution
→ EA
→ realtime

are connected to real state.

Cloud Run preparation is complete only when:

local service
→ configuration
→ health check
→ authentication
→ Supabase
→ Model Gateway
→ deployment configuration

has been verified to the appropriate level.

==================================================
26. FINAL VALIDATION
==================================================

Before considering this implementation cycle complete, verify:

AUTH
- login works
- signup works
- logout works
- sessions persist
- protected routes work
- redirects work
- errors work

FOUNDER ATTENTION
- real data
- correct permissions
- real actions
- realtime updates

NAVIGATION
- new structure works
- old routes redirect
- no redirect loops
- deep links work
- existing functionality remains accessible

COMPANY HUB
- 75/25 layout
- real company data
- real departments
- real agents
- real work
- persistent EA
- queue-based execution visibility

LOAD SCALE
- orphan processes handled safely
- diagnostic rerun
- results recorded
- bottlenecks identified

AUTH BROWSER QA
- all states visually checked
- responsive
- accessible
- brand-consistent

CLOUD RUN
- service architecture prepared
- Docker/build verified
- environment variables identified
- secrets identified
- health endpoint verified
- Railway migration plan documented
- no premature production cutover

GIT
- logical commits
- clean working tree where appropriate
- no secrets
- no debug artifacts
- tests passing

==================================================
27. THE CORE PRINCIPLE
==================================================

Do not optimize for the appearance of progress.

Optimize for verified progress.

ORQ8 should increasingly behave like:

A continuously operating company.

The founder provides direction.

The EA coordinates.

Departments organize work.

AI employees execute.

Cloud Run provides fast compute.

Trigger.dev provides durable execution.

OpenRouter provides model access.

Supabase stores durable state.

The system records what happened.

The system knows what is waiting.

The system knows what needs the founder.

The founder can intervene at any time.

Every visible state should correspond to real system state.

Every consequential action should have authority.

Every important execution should be traceable.

Every major change should be tested and committed logically.

START NOW:

1. Read docs/60_PRODUCT_REDESIGN_AUDIT.md.
2. Inspect the current repository and architecture.
3. Reconcile the audit against the current ORQ8 architecture.
4. Report the proposed implementation sequence and any conflicts.
5. Begin with the auth overhaul.
6. Do not begin the company page redesign until auth is verified.


GLOBAL RULES (apply to everything you do on ORQ8)

1. Read the existing code before changing anything. Do not rewrite blindly. Preserve working behavior.
2. Never invent traction, fake data, fake activity, or fake metrics. Simulated data must be clearly labeled.
3. Product copy: sentence case, direct language, no hype words, no exclamation marks, no em dashes anywhere.
4. Terminology: "Hire" not "create" for employees. "Company" not "workspace". "Credits" not "tokens". "Employees" not "agents" in user-facing copy.
5. Brand: dark interface, dark green dominant, orange accent. Fine borders, compact radii, spacing on the 4/8/12/16/24/32 scale.
6. Fix root causes. Do not hide errors with UI workarounds. Make failures visible and actionable.
7. Never mask an infrastructure failure as an AI "thinking" state forever.
8. Do not remove existing functionality. If something does not fit, move it to the right place.
9. Test the real flow after every change, not just the code.

CONTEXT


====================================================================================================
SECTION 6 — DECISION COMMAND CENTER HARDENING (WORKSTREAMS A-D)
====================================================================================================

These tasks harden the Decision Command Center, the deliberation pipeline, and the rehearsal infrastructure ahead of external testing. Work in the order below. Complete each workstream before starting the next. Report progress at the end of every workstream.

STEP 0: REPORT FIRST
Before changing anything, map where these features live today: the council/deliberation flow, the polling mechanism, the orphaned-execution reaper, agent hire defaults, the demo/showcase org, the rehearsal workflow, and QA scoring. List what exists, what is partially built, and what is missing. Wait for confirmation if anything is ambiguous.

WORKSTREAM A: DELIBERATION PIPELINE (highest priority)
A1. Replace deliberation polling with SSE stage events so the founder watches council rounds happen live on the council page. Requirements:

- The council page renders each deliberation stage (framing, positions, challenges, convergence) as it happens, from real server events, not simulated timers.
- If the event stream drops, show an honest reconnecting state. Never fake progress.
- Keep the existing record view as the post-session state.
A2. Render the routing-consequence state on the council page itself: when a decision routes to founder approval, the page must show why synthesis requires approval (authority level, what triggered escalation, what happens next), not just a generic pending state.
A3. Add an e2e test that starts a council session and asserts the UI shows honest progress states (stage indicators, no fake completion) until the decision record appears.

WORKSTREAM B: VISIBILITY AND TRUST
B1. Make the orphaned-execution reaper report its reapings to the Jobs page: what was reaped, why, when, and what state the work was left in. Self-healing must be visible to the founder, silent recovery is a trust risk.
B2. Default new agent hires to execute_with_approval instead of observe. At hire time, show the autonomy choice clearly (observe, execute_with_approval, autonomous within limits) with one plain-language line per option. The default must be execute_with_approval.
B3. Extend the rehearsal to assert that QA scores persist to agent reliability signals, closing the per-agent learning loop. If a QA score does not affect the agent's reliability record, that is a bug, not a missing feature.

WORKSTREAM C: REHEARSAL INFRASTRUCTURE
C1. The nightly rehearsal workflow: trigger it once against production and confirm it runs green end to end using the E2E_ENV_LOCAL and DEMO_ENV_LOCAL secrets.
C2. Add a weekly auto-comment to the rehearsal issue summarizing the last 7 runs: flaky failures vs hard failures, counts, and links. Flaky means passes on retry without code change. Hard means fails consistently.
C3. Record this session's rehearsal evidence and known limitations in the launch checklist doc. Known limitations must be stated honestly, not softened.

WORKSTREAM D: SHOWCASE ORG
D1. Raise the demo account's plan limit so Finance can be provisioned in the showcase org. This is a demo environment change, not a product pricing change. Label any demo-limited data as simulated.

VERIFICATION (run after each workstream)

1. CI goes green on main.
2. Both deploys ship (web and model-router, or whichever services changed).
3. CTA click-through on production returns 200 for async deliberation start.
4. The nightly rehearsal runs green end to end.
5. The e2e council test passes locally and in CI.

FINAL QA BEFORE REPORTING DONE

- Live deliberation rounds render from real SSE events on production.
- Routing-consequence state explains every founder escalation on the council page.
- Reaper reapings appear on the Jobs page with cause and resulting state.
- New hires default to execute_with_approval with the choice visible at hire time.
- QA scores visibly affect agent reliability signals.
- Rehearsal issue has a weekly summary of flaky vs hard failures.
- Launch checklist doc contains this session's evidence and honest limitations.
- Finance is provisioned in the showcase org.
- No em dashes in any user-facing copy touched. Sentence case everywhere.

REPORT FORMAT
Workstream by workstream: what changed, files touched, test evidence (commands run and results), anything flagged for human review, and anything you could not complete with the reason.




You are working on the ORQ8 application.


====================================================================================================
SECTION 7 — NAVIGATION AND INFORMATION ARCHITECTURE REDESIGN
====================================================================================================

Your task is to redesign and restructure the application's navigation and information architecture based on the current ORQ8 product direction.

IMPORTANT:

This is NOT a request to rebuild ORQ8 from scratch.

This is NOT a request to remove existing functionality.

This is NOT a request to create fake placeholder pages.

You must first inspect the existing application, routes, components, database usage, APIs, permissions, realtime behavior, and existing pages before making changes.

The goal is to reorganize the existing functionality into a much cleaner operating-system-style navigation structure.

ORQ8 should feel like an operating system for running a company with AI employees, not a collection of 30+ independent admin pages.

==================================================
1. CORE ORQ8 PRODUCT MODEL
==================================================

The application should communicate this hierarchy:

Founder
  ↓
Company
  ↓
Executive Agent (EA)
  ↓
Departments
  ↓
AI Employees
  ↓
Work
  ↓
Executions
  ↓
Outcomes
  ↓
Company Memory

The founder should feel:

"This is my company."

"These are my AI employees."

"This is what they are doing."

"This is what needs my attention."

"This is what the company is trying to accomplish."

"This is what is blocked."

"This is what has been completed."

"This is how much execution capacity we are using."

"I can talk to my EA at any time."

"I remain in control."

The application should feel closer to OPERATING A COMPANY than USING AN AI APPLICATION.

==================================================
2. PRIMARY NAVIGATION
==================================================

Replace the current flat navigation structure with these six primary navigation areas:

1. COMPANY
2. WORK
3. ORGANIZATION
4. DECISIONS
5. RESOURCES
6. GOVERNANCE

Do not create additional primary navigation categories unless you find an existing technical requirement that genuinely requires one.

The sidebar should be significantly cleaner and less overwhelming.

==================================================
3. FINAL NAVIGATION STRUCTURE
==================================================

Implement the following information architecture.

------------------------------------------
COMPANY
------------------------------------------

Company
├── Overview
├── Health
├── Strategy
├── Reports
└── Activity

### Company → Overview

This is the main company hub.

It should become the primary operating surface for the founder.

The overview should surface:

- Founder’s Attention
- important approvals
- blocked work
- important decisions
- major goals
- active workstreams
- company health
- departments
- active AI employees
- current work
- recent outcomes
- important activity
- risks
- execution state
- EA

The company overview should not simply be a renamed dashboard.

It should communicate the live state of the company.

The EA should remain persistent/contextually accessible.

------------------------------------------

### Company → Health

Move the current Company Health functionality here.

Health can include:

- company health
- department health
- execution health
- agent health
- integration health
- budget health
- blocked work
- risks
- operational issues

Do not create fake metrics.

All displayed data must come from real application state or be explicitly identified as simulated/test data.

------------------------------------------

### Company → Strategy

Move the current Strategy functionality here.

Structure:

Strategy
├── Company Strategy
├── Goals
├── Priorities
└── Strategic Lineage

Strategic Lineage should no longer be a top-level sidebar destination.

It belongs under strategy.

The strategic model should connect:

Goal
→ Strategy
→ Decision
→ Workstream
→ Task
→ Execution
→ Outcome

------------------------------------------

### Company → Reports

Move these existing capabilities here:

- Weekly Report
- Performance
- AI Workforce ROI
- Briefings

Structure:

Reports
├── Weekly Reports
├── Performance
├── AI Workforce
├── Department Reports
└── Briefings

AI Workforce ROI should be treated as a reporting/performance capability, not as a separate product area.

Reports must use actual company data.

------------------------------------------

### Company → Activity

Create/use a centralized company activity stream.

Examples of legitimate activity:

- agent started work
- agent completed work
- task changed
- task became blocked
- approval requested
- approval completed
- decision created
- decision approved
- deployment completed
- deployment failed
- workstream changed
- integration event
- important company event

Never fabricate activity simply to make the interface look alive.

==================================================
4. WORK
==================================================

Work
├── My Attention
├── All Work
├── Tasks
├── Workstreams
├── Scheduled Work
└── Reviews

This is the execution layer of ORQ8.

------------------------------------------

### Work → My Attention

This is one of the most important areas in the application.

It should aggregate things requiring founder attention from across the company.

Examples:

- approvals
- decisions
- blocked work
- permission requests
- budget requests
- risks
- important failures
- deadline risks
- strategic conflicts

Each item should explain:

WHAT
WHY
WHO
AUTHORITY REQUIRED
IMPACT
WHAT HAPPENS NEXT

Available actions can include:

- Approve
- Reject
- Ask EA
- View details
- Delegate
- Change authority
- Pause
- Modify

The founder should not have to search multiple pages to find something requiring attention.

------------------------------------------

### Work → All Work

Centralized execution view.

Allow filtering by:

- department
- AI employee
- status
- priority
- workstream
- deadline
- task type

------------------------------------------

### Work → Tasks

Use the existing task system.

Task states should support:

BACKLOG
TO DO
DOING
REVIEW
BLOCKED
DONE

Tasks should include, where supported:

- title
- description
- department
- assigned employee
- priority
- status
- dependencies
- deadline
- approval requirements
- workstream
- tools
- files
- activity
- decisions
- outcome

Do not create a second task system.

Reuse and refactor the existing one.

------------------------------------------

### Work → Workstreams

Major company initiatives.

Examples:

- Launch ORQ8 v2
- Raise funding
- Acquire first 100 customers
- Launch marketing campaign
- Reduce infrastructure costs

A workstream should connect:

Goal
→ Departments
→ AI employees
→ Tasks
→ Dependencies
→ Decisions
→ Executions
→ Outcomes

------------------------------------------

### Work → Scheduled Work

Rename/restructure the current Scheduled Jobs functionality.

Examples:

- daily company briefing
- weekly sales analysis
- weekly engineering report
- monthly financial review
- competitor monitoring

Do not create a second scheduling system.

Reuse the existing scheduling infrastructure.

------------------------------------------

### Work → Reviews

Work that requires review.

Examples:

- code review
- content review
- campaign review
- financial review
- task review
- AI-generated proposal review

==================================================
5. ORGANIZATION
==================================================

Organization
├── AI Employees
├── Departments
├── Teams
├── Org Explorer
└── Business Import

This area represents WHO is doing the work.

------------------------------------------

### Organization → AI Employees

Move the current AI Employees functionality here.

Employees should have:

- name
- role
- department
- responsibilities
- authority
- tools
- budget
- current work
- performance
- activity
- memory
- status

Statuses can include:

ACTIVE
WORKING
WAITING
BLOCKED
REVIEW
DONE
PAUSED
OFFLINE

AI employees must feel like organizational entities, not chatbot instances.

------------------------------------------

### Organization → Departments

Move the current Departments functionality here.

Departments are first-class organizational units.

Potential departments:

- Engineering
- Product
- Design/Brand
- Marketing
- Sales
- Customer Success
- Finance
- Operations
- People
- Legal/Compliance
- Research/Strategy
- Data/Analytics
- Security/IT
- Partnerships
- Procurement

Do not force every department to have an identical interface.

Department workspaces should be specialized.

For example:

Engineering should expose relevant concepts such as:

- repositories
- branches
- files
- issues
- PRs
- deployments
- CI/CD
- environments
- incidents
- technical decisions
- tools
- activity

Marketing should expose:

- campaigns
- content
- channels
- experiments
- analytics
- brand assets
- competitors

Sales should expose:

- pipeline
- accounts
- opportunities
- outreach
- proposals
- deals

Finance should expose:

- budgets
- expenses
- invoices
- forecasts
- approvals

Reuse existing department functionality where available.

------------------------------------------

### Organization → Teams

Teams are persistent groups of employees.

Do not duplicate the Department model.

A department is an organizational function.

A team is a group working together.

If Squads already exist, determine whether they represent temporary execution groups.

If so:

Teams = persistent organizational groups

Squads = temporary cross-functional execution groups

Move Squads into the appropriate Work context rather than keeping them as a primary navigation item.

Do not create duplicate concepts.

------------------------------------------

### Organization → Org Explorer

Visual organization structure.

It should show relationships such as:

Founder
→ EA
→ Departments
→ AI Employees
→ Teams

Where useful, show:

- reporting relationships
- assignments
- active work
- status
- authority
- organizational relationships

------------------------------------------

### Organization → Business Import

Move Business Import here.

This should support existing companies importing:

- employees
- departments
- tools
- documents
- workflows
- customers
- projects
- existing systems

==================================================
6. DECISIONS
==================================================

Decisions
├── Decision Center
├── Decision History
└── Decision Council

This is a first-class ORQ8 capability.

------------------------------------------

### Decision Center

Structured decision workflow:

1. Define decision
2. Gather company context
3. Gather evidence
4. Identify assumptions
5. Analyze alternatives
6. Identify risks
7. Analyze tradeoffs
8. Produce recommendation
9. Governance check
10. Founder approval if required
11. Execute
12. Record outcome
13. Store learning

Do not turn this into theatrical AI debate.

------------------------------------------

### Decision History

Move Decision Memory functionality into this broader decision history/context.

It should preserve:

- previous decisions
- rationale
- evidence
- assumptions
- approvals
- outcomes
- lessons

The system should be able to use previous decisions as organizational context.

------------------------------------------

### Decision Council

Move the current Decision Council functionality here.

It may use multiple agents/models to independently analyze a decision.

The final decision still follows ORQ8 authority and founder governance.

==================================================
7. RESOURCES
==================================================

Resources
├── Files
├── Knowledge
├── Memory
├── Integrations
└── Tools & MCP

This represents what the company KNOWS and USES.

------------------------------------------

### Resources → Files

Move Files here.

Do not create a new file system.

------------------------------------------

### Resources → Knowledge

Move Knowledge Graph here.

Knowledge should represent company knowledge, including:

- people
- customers
- products
- projects
- departments
- decisions
- documents
- relationships

The graph should be a visualization/view of knowledge, not an entire top-level product concept.

------------------------------------------

### Resources → Memory

Move Company Memory and Decision Memory into the broader memory system.

Potential categories:

- Company Memory
- Decision Memory
- Agent Memory
- Workflow Memory
- Learned Patterns

Memory must influence actual execution.

It cannot simply be a chat history database.

------------------------------------------

### Resources → Integrations

Move Integrations here.

Examples:

- GitHub
- Gmail
- Google
- Slack
- Linear
- Vercel
- CRM
- finance systems
- cloud systems
- other supported services

------------------------------------------

### Resources → Tools & MCP

Move MCP & Tools here.

Structure can include:

- connected tools
- MCP servers
- tool permissions
- tool health
- available capabilities

Do not create a duplicate tool permission system.

==================================================
8. GOVERNANCE
==================================================

Governance
├── Approvals
├── Budgets
├── Authority & Permissions
├── Usage & Credits
├── Audit Trail
├── Constitution
└── Quality & Learning

This defines HOW ORQ8 is allowed to operate.

------------------------------------------

### Governance → Approvals

Central approval policy/history system.

Important:

There must only be ONE underlying approval system.

Work → My Attention → Approvals

is the founder-facing action surface.

Governance → Approvals

is the configuration/history surface.

Do not build two approval systems.

------------------------------------------

### Governance → Budgets

Company, department, employee and execution spending controls.

Support the hierarchy:

Company
→ Department
→ Employee
→ Execution

------------------------------------------

### Governance → Authority & Permissions

Define:

CAN DO
CAN SPEND
REQUIRES APPROVAL
CANNOT DO

Authority must be enforced server-side.

Agents cannot:

- modify their own authority
- grant themselves permissions
- bypass approval requirements
- override company policy
- bypass tool restrictions

------------------------------------------

### Governance → Usage & Credits

Customer-facing unit must be:

ORQ8 CREDITS

Never expose "tokens" as the customer-facing usage concept.

Track credits by:

- company
- department
- employee
- task
- workstream
- execution

Where appropriate show:

- credits available
- credits reserved
- credits consumed
- estimated usage
- usage by department
- usage by employee
- usage by workstream
- limits

Raw model tokens and provider costs may remain visible to internal ORQ8 administrators but not as the primary customer-facing concept.

------------------------------------------

### Governance → Audit Trail

Every consequential action should be traceable.

Record:

- who/what acted
- agent
- company
- department
- task
- execution
- action
- time
- authority
- approval
- tool
- cost
- result

------------------------------------------

### Governance → Constitution

Company operating rules.

Examples:

- company principles
- policies
- autonomy rules
- approval rules
- spending rules
- strategic constraints
- prohibited actions

------------------------------------------

### Governance → Quality & Learning

Combine existing Quality & Learning and Learning functionality where possible.

Measure actual execution:

- work completed
- outcome quality
- failure rate
- intervention rate
- blocked work
- approval wait
- agent success
- department throughput
- execution cost
- learning from successful/failed work

Do not use vanity metrics such as number of AI messages generated.

==================================================
9. SETTINGS
==================================================

Settings should NOT be part of the primary company navigation.

Use:

Settings
├── Account
├── Company Settings
├── Security
├── Notifications
├── Billing
├── Providers
├── API
└── Environment

The current Provider Keys page belongs under:

Settings → Providers

Do not expose provider API keys in the normal company navigation.

==================================================
10. SIMULATION
==================================================

Simulation should not appear in the normal founder sidebar.

Treat it as an environment/admin capability.

Possible structure:

Settings
└── Environment
    ├── Production
    ├── Test
    └── Simulation

If the existing application has internal admin access controls, Simulation should preferably only be visible to authorized users.

Do not delete the existing simulation functionality.

Move it.

==================================================
11. NOTIFICATIONS
==================================================

Notifications should not be a primary sidebar item.

They should be accessible from the global top bar.

Example:

ORQ8
Company
Search
EA
Notifications
Founder Profile

The notification system should surface:

- approvals
- failures
- important decisions
- blocked work
- budget events
- permission requests
- important company events

Settings → Notifications should contain notification preferences/configuration.

==================================================
12. EXECUTIVE AGENT
==================================================

The EA is NOT a normal sidebar page.

The EA is part of the ORQ8 operating experience.

The EA should be:

- visible on Company Overview
- available contextually throughout the application
- able to understand the current page/workspace
- able to explain company state
- able to delegate work
- able to answer questions
- able to show execution progress
- able to surface Founder’s Attention
- able to coordinate departments
- able to report outcomes

The founder should be able to interact with the EA without leaving their current workflow.

Do not turn EA into a generic ChatGPT-style page.

==================================================
13. NAVIGATION BEHAVIOR
==================================================

The sidebar must support:

- collapsed state
- expanded state
- active route
- nested submenu expansion
- mobile responsive behavior
- company switching
- search
- permissions-based visibility

Do not make every submenu permanently expanded.

The sidebar should remain visually compact.

The primary categories should be visually obvious.

Use clear hierarchy:

PRIMARY AREA
  Submenu
  Submenu
  Submenu

Do not show 30+ routes at the same hierarchy level.

==================================================
14. CURRENT → NEW ROUTE MAPPING
==================================================

Map existing routes/functionality as follows:

Dashboard
→ Company / Overview

Company Health
→ Company / Health

Scheduled Jobs
→ Work / Scheduled Work

Command Center / Approvals
→ Work / My Attention
→ Governance / Approvals

Weekly Report
→ Company / Reports / Weekly Reports

Performance
→ Company / Reports / Performance

Engineering
→ Organization / Departments / Engineering

MCP & Tools
→ Resources / Tools & MCP

Simulation
→ Settings / Environment / Simulation

Squads
→ Work / Squads if squads are temporary execution groups

AI Workforce ROI
→ Company / Reports / AI Workforce

AI Employees
→ Organization / AI Employees

Departments
→ Organization / Departments

Teams
→ Organization / Teams

Strategy
→ Company / Strategy

Goals & Tasks
→ Work / Tasks
→ Company / Strategy / Goals where appropriate

Org Explorer
→ Organization / Org Explorer

Business Import
→ Organization / Business Import

Integrations
→ Resources / Integrations

Notifications
→ Global top bar

Company Memory
→ Resources / Memory

Strategic Lineage
→ Company / Strategy / Strategic Lineage

Decision Memory
→ Decisions / Decision History

Decision Council
→ Decisions / Decision Council

Knowledge Graph
→ Resources / Knowledge

Audit Trail
→ Governance / Audit Trail

Budgets
→ Governance / Budgets

Usage & Limits
→ Governance / Usage & Credits

Files
→ Resources / Files

Constitution
→ Governance / Constitution

Quality & Learning
→ Governance / Quality & Learning

Learning
→ Governance / Quality & Learning

Briefings
→ Company / Reports / Briefings

Provider Keys
→ Settings / Providers

==================================================
15. CRITICAL IMPLEMENTATION RULE
==================================================

DO NOT simply change labels.

The application architecture and routing should reflect the new information architecture.

Before implementation:

1. Inspect every existing route.
2. Inspect the current sidebar/navigation component.
3. Inspect route guards.
4. Inspect page dependencies.
5. Inspect shared layouts.
6. Inspect database relationships.
7. Inspect API endpoints.
8. Inspect server actions.
9. Inspect realtime behavior.
10. Inspect permissions.
11. Inspect existing links between pages.
12. Identify duplicate functionality.
13. Identify routes that can safely be nested.
14. Identify routes that must remain accessible.
15. Identify redirects required for old URLs.
16. Identify mobile navigation behavior.

Do not blindly rename or delete routes.

==================================================
16. ROUTE COMPATIBILITY
==================================================

Existing URLs may already be referenced by:

- internal links
- bookmarks
- integrations
- tests
- API logic
- user workflows

Where routes change, implement appropriate redirects or compatibility handling.

Do not break existing functionality simply because the navigation hierarchy changes.

Example:

Old:
 /app/agents

New:
 /app/organization/employees

If the architecture supports it, the old route should redirect safely to the new route.

Do this consistently.

==================================================
17. NO DUPLICATE SYSTEMS
==================================================

During the refactor, identify and prevent duplicate implementations.

There should be one:

- task system
- approval system
- agent system
- department system
- memory system
- audit system
- credit ledger
- scheduling system
- permission system
- execution system
- integration system

Navigation restructuring must not create duplicate backend concepts.

==================================================
18. DESIGN DIRECTION
==================================================

The new navigation should support the existing ORQ8 design language:

- premium SaaS
- technical
- operational
- trustworthy
- calm
- clear
- dense where useful
- human
- modern

Avoid:

- generic AI gradients
- excessive glassmorphism
- neon interfaces
- excessive rounded cards
- meaningless charts
- fake activity
- stock illustrations
- generic chatbot UI
- excessive animation
- decorative UI that does not communicate state

Use visual hierarchy rather than making everything a card.

Do not turn every piece of information into a card.

==================================================
19. MOBILE
==================================================

The new navigation must work properly on mobile.

Do not simply shrink the desktop sidebar.

Determine an appropriate mobile navigation pattern.

The same information hierarchy must remain understandable.

==================================================
20. ACCESS CONTROL
==================================================

Navigation visibility must respect permissions.

For example:

A normal founder should not necessarily see internal administration tools such as:

- simulation
- provider administration
- internal infrastructure controls

But hiding a menu item must never replace server-side authorization.

Security must remain enforced on the server.

==================================================
21. WHAT NOT TO DO
==================================================

DO NOT:

- delete existing functionality
- rewrite the entire application
- create duplicate systems
- create fake data
- create fake activity
- make every page a dashboard
- make every feature a card
- make every interaction a chatbot
- turn EA into a separate disconnected page
- make every department identical
- expose raw model tokens to customers
- remove functionality just because it is no longer top-level
- break existing routes without migration/redirects
- create unnecessary new abstractions
- introduce a second task system
- introduce a second approval system
- introduce a second memory system
- introduce a second permissions system
- optimize only for screenshots

==================================================
22. REQUIRED FIRST STEP
==================================================

Before changing code, perform a complete navigation and architecture audit.

Produce a mapping containing:

CURRENT ROUTE
CURRENT PURPOSE
CURRENT COMPONENTS
CURRENT DATA SOURCE
CURRENT DEPENDENCIES
NEW LOCATION
NEW ROUTE
KEEP / REFACTOR / MERGE / MOVE
RISKS
REDIRECT REQUIRED
PERMISSION IMPACT

Then identify:

- duplicate functionality
- orphaned pages
- obsolete navigation items
- pages that should become contextual workspaces
- pages that should become submenus
- pages that should become detail views
- pages that should become top-bar utilities
- pages that should move into Settings/Admin

==================================================
23. IMPLEMENTATION ORDER
==================================================

Implement in this order unless the repository architecture requires a different dependency order:

PHASE 1
Navigation architecture and route audit.

PHASE 2
New global sidebar/navigation shell.

PHASE 3
Company navigation and Company Overview.

PHASE 4
Work navigation and My Attention.

PHASE 5
Organization navigation.

PHASE 6
Decision navigation.

PHASE 7
Resources navigation.

PHASE 8
Governance navigation.

PHASE 9
Settings/Admin restructuring.

PHASE 10
Route redirects and backwards compatibility.

PHASE 11
Responsive/mobile navigation.

PHASE 12
Full QA.

==================================================
24. COMPANY OVERVIEW PRIORITY
==================================================

The most important result of this refactor is not the sidebar itself.

It is the Company Overview.

The founder should open ORQ8 and immediately understand:

1. What is happening?
2. What needs my attention?
3. What is the company trying to accomplish?
4. What are my AI employees doing?
5. What work is active?
6. What is blocked?
7. What has been completed?
8. What decisions need me?
9. What risks exist?
10. What is the EA doing?

The navigation should support this experience rather than compete with it.

==================================================
25. SUCCESS CRITERIA
==================================================

The refactor is successful when:

- The sidebar no longer feels like an admin sitemap.
- There are only six primary navigation areas.
- Existing functionality remains accessible.
- Related functionality is grouped logically.
- Founder attention is centralized.
- Company state is centralized.
- Work is centralized.
- AI employees and departments are centralized.
- Decisions are centralized.
- Resources and company knowledge are centralized.
- Governance is centralized.
- Settings/admin functionality is separated.
- Notifications are treated as a global utility.
- EA remains available throughout the application.
- No duplicate systems are created.
- Existing routes are safely migrated or redirected.
- No important existing functionality is silently removed.
- Mobile navigation works.
- Permissions still work.
- Realtime behavior still works.
- No fake data or fake activity is introduced.

The final mental model should be:

COMPANY
→ What is happening?

WORK
→ What is being done?

ORGANIZATION
→ Who is doing it?

DECISIONS
→ What are we deciding?

RESOURCES
→ What does the company know and use?

GOVERNANCE
→ What is allowed?

That is the target ORQ8 information architecture.

Do not implement anything until you have inspected the current application and understand how the existing routes and functionality map into this structure.

Do not treat the navigation list above as permission to invent missing functionality. The repository is the source of truth for what currently exists. The ORQ8 product architecture is the target information architecture. Your job is to map the former into the latter, preserving working functionality and identifying gaps rather than pretending they already exist.


====================================================================================================
SECTION 8 — TRIGGER.DEV PROJECT SETUP
====================================================================================================

Set up Trigger.dev in this project.

Trigger.dev runs your background tasks. This is an existing codebase — add Trigger.dev to it and get one task running in the development environment.

Project reference: proj_frubeqhpsrmvrwpfdegd

How to do it:
1. If you have the Trigger.dev MCP server available, use its "initialize_project" tool with the project reference above.
2. Otherwise run this and follow its output:
   npx trigger.dev@latest init -p proj_frubeqhpsrmvrwpfdegd
3. If you set it up by hand, follow https://trigger.dev/docs/manual-setup and make sure you end up with:
   - "@trigger.dev/sdk" installed (latest) and "@trigger.dev/build" as a dev dependency
   - a trigger.config.ts with: import { defineConfig } from "@trigger.dev/sdk", project: "proj_frubeqhpsrmvrwpfdegd", dirs: ["./src/trigger"], and a maxDuration
   - a src/trigger/ directory with at least one exported task created with task() from "@trigger.dev/sdk"
   - trigger.config.ts added to tsconfig "include", and ".trigger" added to .gitignore

Golden rules:
- Import from "@trigger.dev/sdk". Never "@trigger.dev/sdk/v3" or the deprecated client.defineJob.
- Export every task, including subtasks.
- Use the built-in fetch, not node-fetch.
- Never wrap wait.*, triggerAndWait, or batchTriggerAndWait in Promise.all.

Two steps I have to do myself — ask me when you need them:
- Running "npx trigger.dev@latest login" (it opens a browser).
- Giving you the development TRIGGER_SECRET_KEY from the dashboard to put in .env.

When you're done, run "npx trigger.dev@latest dev" and confirm the task shows up in the Trigger.dev dashboard.


====================================================================================================
SECTION 9 — DASHBOARD WELCOME HUB AND EXECUTIVE AGENT FIRST-RUN EXPERIENCE
====================================================================================================

# ORQ8 — Dashboard Welcome Hub + Executive Agent First-Run Experience

## ROLE

Act as the principal product architect, senior UX engineer, and senior full-stack engineer for ORQ8.

Your task is to redesign the **existing dashboard landing experience** so that it becomes the user's **company oversight hub and Executive Agent welcome experience**.

Do not treat this as a cosmetic redesign.

The goal is to make the first dashboard experience feel like the user has entered an intelligent company operating system and has just met the Executive Agent who will help them build and operate their company.

---

# 1. CORE PRODUCT EXPERIENCE

When a user logs into ORQ8 for the first time, the dashboard should immediately answer:

1. Where am I?
2. What is ORQ8?
3. Who is the Executive Agent?
4. What can the Executive Agent do for me?
5. What should I do next?
6. Have I completed onboarding?
7. What does ORQ8 currently know about my company?
8. What should happen next?

The Executive Agent should be the primary guide.

The experience should feel like:

> "You are the CEO. This is your organization. I am your Executive Agent. Tell me what you are building, and I will help you turn it into an operating company."

Do NOT make this feel like a chatbot welcome message pasted onto a normal SaaS dashboard.

It needs to feel native to ORQ8's organizational operating system.

---

# 2. EXECUTIVE AGENT INTRODUCTION

The Executive Agent needs a branded identity.

Do not hard-code a generic name such as "AI Assistant" or "AI Agent."

Create the architecture so the EA has a configurable branded name.

For example:

> "Atlas"

or another ORQ8-approved name.

The name should be configurable in the future without changing the underlying system.

The first interaction should feel natural and intelligent.

Example direction:

> "Welcome to ORQ8, Joshua. I'm Atlas, your Executive Agent."

Then explain its role concisely:

> "I'm here to help you turn your direction into an operating company. I can help structure your organization, identify what needs to be done, coordinate your teams, and keep you informed as work moves forward."

Do NOT use generic AI marketing language.

Do NOT say things such as:

* "I'm here to supercharge your productivity."
* "Let's unlock your potential."
* "Your AI-powered journey begins."
* "Welcome to the future."
* "I'm your AI copilot."

The language should feel like an actual executive speaking to a founder.

---

# 3. FIRST-LOGIN STATE

Determine whether the user has completed onboarding using the actual persisted onboarding/company state.

Do NOT infer onboarding completion from frontend state.

There should be a reliable backend representation of:

* onboarding started
* onboarding completed
* company information collected
* organization generated
* initial goals established
* initial employees/departments created where applicable

The dashboard must know whether this is:

### State A — New user, onboarding not completed

The Executive Agent should explicitly guide the user into onboarding.

### State B — Onboarding in progress

The Executive Agent should explain what remains and provide a clear continuation action.

### State C — Onboarding completed

The welcome experience should change into an intelligent operating conversation rather than continuing to push onboarding.

---

# 4. NEW USER EXPERIENCE

For a first-time user who has not completed onboarding:

The dashboard should prominently communicate:

> "Let's get your company set up."

The Executive Agent should briefly explain why onboarding matters.

For example:

> "Before I start organizing work, I need to understand what you're building, where you are today, and what you want to accomplish. That gives me enough context to recommend the right organization and priorities."

Then provide a clear primary action:

### Continue onboarding

The user should also be able to begin by telling the EA about their idea.

Do not force the user through a rigid questionnaire before allowing natural conversation.

The user should be able to say:

> "I'm building an AI platform for Nigerian businesses."

The EA should understand that and continue intelligently.

---

# 5. ASK ABOUT THE USER'S IDEA

The Executive Agent should ask an intelligent first question.

Something along the lines of:

> "What are you building, and what would you like to accomplish with it?"

Allow the user to describe:

* an idea
* an existing company
* a product
* a business problem
* an existing codebase
* an existing operation

Do not assume they already have a company.

ORQ8 must support both:

### Idea-stage users

and

### Existing businesses.

---

# 6. INTELLIGENT FOLLOW-UP

The EA must NOT immediately dump a long list of questions.

It should reason about the user's response and ask the next most useful question.

For example:

User:

> "I'm building a platform that helps small businesses manage inventory."

EA:

> "That gives me the product direction. Are you still validating the idea, or do you already have something customers can use?"

Then based on the answer:

> "Do you already have a codebase or product team?"

Then:

> "What is the most important outcome you want in the next 30 to 90 days?"

The questions must adapt to context.

This is critical.

Do not implement a static scripted chatbot.

---

# 7. EA SHOULD GIVE SUGGESTIONS

The Executive Agent should not only ask questions.

It should also provide useful observations.

For example:

> "Based on what you've told me, I would prioritize customer validation before expanding the engineering team."

Or:

> "You appear to be at an early validation stage. I would start with Product, Research, and Growth rather than creating a large organization immediately."

The suggestions should be grounded in the user's actual answers.

Do not generate arbitrary departments simply to make the demo look impressive.

---

# 8. ONBOARDING + ORGANIZATION GENERATION

Once sufficient context has been collected, the EA should be able to propose an initial company structure.

For example:

> "Based on what you've told me, I recommend starting with four functions:
>
> Product
> Engineering
> Growth
> Operations
>
> I can explain why each is needed before we activate them."

The founder remains in control.

Nothing consequential should be silently activated.

The EA should distinguish between:

### Recommendation

"What I recommend."

### Proposed action

"What I would like to do."

### Approval

"What I need you to approve."

### Execution

"What has actually happened."

Never blur these states.

---

# 9. AFTER ONBOARDING

Once onboarding is complete, the dashboard should stop behaving like an onboarding page.

The EA should become an ongoing company operator.

The welcome area should transition into something closer to:

> "Good morning, Joshua. Here's where your company stands."

Then surface meaningful information such as:

* current company goal
* active work
* pending approvals
* blockers
* recent decisions
* organizational activity
* important recommendations
* company health

The user should immediately understand what is happening in their company.

---

# 10. DASHBOARD AS OVERSIGHT SYSTEM

Redesign the dashboard so it becomes the founder's **company oversight center**.

Do not redesign the entire application.

Do not move unrelated navigation.

Do not unnecessarily change existing routes.

Do not randomly rearrange working components.

Preserve useful existing dashboard functionality.

Instead, reorganize the main dashboard around the founder's most important questions:

### What is happening?

### What needs my attention?

### What is progressing?

### What is blocked?

### What did the organization accomplish?

### What should I do next?

---

# 11. RECOMMENDED DASHBOARD STRUCTURE

Use the existing visual system and components where possible.

A strong hierarchy is:

## A. Executive Agent Welcome / Command Area

Top-level area.

The EA greets the founder and provides the most important current context.

For a new user:

> Welcome + introduction + onboarding guidance.

For an existing user:

> Company status + current priorities + recommended next action.

---

## B. Company Overview

Show meaningful company-level information.

Examples:

* active goals
* active jobs
* active departments
* active employees
* pending approvals
* blocked work
* current AI usage
* company health

Do not fill this with meaningless vanity metrics.

Every metric should help the founder understand the state of the company.

---

## C. Needs Your Attention

This should be highly actionable.

Examples:

* Approval required
* Agent blocked
* Budget approaching limit
* Important decision awaiting review
* Integration disconnected
* Goal falling behind

The founder should be able to act directly from this area.

---

## D. Active Work

Show what the organization is currently doing.

Examples:

> Engineering Agent — implementing authentication

> Growth Agent — analyzing competitor positioning

> Research Agent — evaluating target market

> EA — coordinating product launch plan

Show meaningful execution status.

Avoid fake animations.

Only show work that corresponds to actual jobs/events.

---

## E. Goals

Show the company's most important active goals.

For each:

* progress
* responsible department/team
* active work
* blockers
* expected outcome

---

## F. Recent Decisions

Surface meaningful decisions made by the organization.

Show:

* decision
* responsible agent/team
* status
* expected outcome
* approval status

This reinforces that ORQ8 is an organizational intelligence system.

---

## G. Executive Recommendations

The EA should be able to surface recommendations such as:

> "Engineering is waiting on a product decision."

> "Your current goal is likely to miss its target without additional research."

> "Marketing has capacity available while Product is becoming a bottleneck."

These recommendations should be based on real system data whenever possible.

---

# 12. DO NOT CREATE A STATIC WELCOME SCREEN

Avoid:

* giant generic hero sections
* stock illustrations
* unnecessary gradients
* oversized "Welcome to ORQ8" text
* generic AI copy
* decorative cards with no function
* fake activity
* excessive empty space

The dashboard should feel like an operating console.

Premium, intelligent, calm and purposeful.

---

# 13. FIRST-RUN EXPERIENCE SHOULD BE PROGRESSIVE

Do not overwhelm a new user.

Initial experience:

### Step 1

Meet the EA.

### Step 2

Explain what ORQ8 can do.

### Step 3

Ask what they are building.

### Step 4

Understand their current stage.

### Step 5

Understand their desired outcome.

### Step 6

Recommend what should happen next.

### Step 7

Build/propose the organization.

### Step 8

Get approval where necessary.

### Step 9

Begin execution.

### Step 10

Transition into continuous company oversight.

The user should feel that ORQ8 becomes increasingly intelligent as it learns about their company.

---

# 14. RETURNING USERS

Do not show the same welcome experience every time.

Persist state.

On subsequent visits, the EA should understand:

* what the founder has already told it
* onboarding status
* company goals
* active work
* previous decisions
* pending approvals
* current organizational state

For example:

> "Welcome back. Your Product Launch goal is 68% complete. Engineering finished the integration yesterday, but the marketing team is waiting for your approval on the launch budget."

That is dramatically more valuable than:

> "Welcome back! How can I help?"

---

# 15. EMPTY STATES

Every dashboard section should have an intelligent empty state.

Do not show:

> "No data."

Instead show useful context.

Example:

> "No active goals yet. Tell Atlas what you want the company to accomplish and it can help you define your first goal."

Or:

> "No employees have been hired yet. I can recommend an initial team based on your company setup."

Empty states should guide the user toward the next meaningful action.

---

# 16. EA CONVERSATION PERSISTENCE

The EA conversation should persist appropriately.

The system should maintain relevant company context rather than treating every dashboard visit as a new conversation.

The EA should have access to appropriate:

* company context
* onboarding responses
* goals
* organization
* employees
* jobs
* decisions
* memory

Do not expose private/internal system information unnecessarily.

---

# 17. REAL DATA ONLY

Do not create fake metrics simply to make the dashboard look populated.

If demo data exists, clearly maintain the demo state.

If the company is new, show meaningful empty states.

If a job has not actually run, do not display it as running.

If an agent has not actually completed work, do not display it as completed.

The dashboard must reinforce trust.

---

# 18. EXISTING UI PRESERVATION

Before making changes:

1. Inspect the current dashboard implementation.
2. Identify existing components.
3. Identify existing data sources.
4. Identify existing API endpoints.
5. Identify existing dashboard state.
6. Identify existing design tokens.
7. Identify existing responsive behavior.
8. Identify existing EA components.

Reuse working infrastructure wherever possible.

Do NOT rebuild working systems unnecessarily.

Do NOT redesign unrelated pages.

Do NOT alter the application's global visual language without justification.

Do NOT move existing navigation unless there is a concrete usability reason.

---

# 19. DESIGN DIRECTION

The experience should feel:

* premium
* intelligent
* calm
* executive
* modern
* operational
* trustworthy

Avoid:

* AI slop
* excessive glassmorphism
* unnecessary gradients
* excessive rounded cards
* generic chatbot styling
* cartoon AI imagery
* meaningless animations

Use the existing ORQ8 visual identity.

Maintain the established dark green and orange accent direction where appropriate.

Maintain strong contrast and accessibility.

Use black text on light backgrounds and white text on dark backgrounds.

---

# 20. RESPONSIVE DESIGN

The dashboard must work properly on:

* desktop
* laptop
* tablet
* mobile

The EA interaction must not collide with:

* navigation
* dashboard controls
* cards
* buttons
* mobile menus

The existing floating EA launcher should remain collision-aware.

Do not introduce another floating button that competes with it.

---

# 21. EXECUTION REQUIREMENTS

Implement this end to end.

Do not stop at frontend mockups.

Verify:

* onboarding state
* backend persistence
* EA identity
* first-login detection
* onboarding continuation
* onboarding completion
* dashboard state transition
* EA conversation persistence
* company context
* goals
* jobs
* approvals
* recommendations
* responsive UI
* loading states
* error states
* empty states

---

# 22. TEST THE COMPLETE USER JOURNEY

Test at minimum:

### Journey 1 — Brand new user

Login

→ dashboard

→ EA introduction

→ onboarding reminder

→ user explains idea

→ EA asks intelligent follow-up

→ EA provides recommendation

→ onboarding continues

→ onboarding completes

→ company structure is proposed/generated

→ dashboard transitions into company oversight mode.

---

### Journey 2 — User who started onboarding

Login

→ dashboard recognizes incomplete onboarding

→ EA explains what remains

→ user continues

→ state persists correctly.

---

### Journey 3 — Fully onboarded user

Login

→ no onboarding interruption

→ EA understands company

→ dashboard shows current company state

→ recommendations are based on real data.

---

### Journey 4 — Returning active company

Login

→ EA summarizes meaningful company activity

→ active jobs shown

→ approvals shown

→ blockers shown

→ goals shown

→ recommendations shown.

---

# 23. IMPORTANT PRODUCT PRINCIPLE

The dashboard should answer:

> **"What is happening in my company, and what do I need to do?"**

The EA should answer:

> **"What should we do next, and why?"**

The rest of the application should allow the founder to investigate and control the underlying organization.

That creates a clear hierarchy:

**Dashboard = oversight**

**Executive Agent = intelligence + direction**

**Departments = organizational execution**

**Jobs = work**

**Agents = workers**

**Tools = capabilities**

**Approvals = founder control**

**Memory = organizational context**

**Reports = organizational understanding**

---

# 24. FINAL QUALITY BAR

Do not consider this complete because the new UI renders.

It is complete only when the experience feels coherent from the moment a founder logs in.

A first-time founder should think:

> "I understand what ORQ8 is."

Then:

> "I understand who this Executive Agent is."

Then:

> "I know what I need to do."

Then:

> "It understands what I'm building."

Then:

> "It is giving me useful advice."

Then:

> "It is actually organizing my company."

And eventually:

> "I can see my company operating from here."

That is the experience we are building.

Before finishing, inspect the current implementation and make only the changes necessary to achieve this product experience. Preserve working functionality, avoid unnecessary redesigns, and do not introduce fake data or fake execution states.

After implementation, run a complete end-to-end QA of the dashboard, onboarding state, EA interaction, persistence, responsive behavior, and production build. Fix all issues discovered rather than merely reporting them.
