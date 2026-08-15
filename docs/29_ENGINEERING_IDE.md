# 29 — Engineering Workspace (IDE)

**Product:** ORQ8 · **Status:** Phase 0 · full documentation set

## 29.1 Purpose (§41)

Engineering gets a dedicated workspace that feels like an **AI-native IDE / project control center** — not a task board. The user must be able to see exactly what the engineering agent did, why, and what tests ran, and approve consequential operations (R-ENG-2).

## 29.2 Layout (§67)

```
┌─────────────────────────────────────────────────────────────┐
│ Top: branch · environment · deployment status · approval    │
├──────────────┬──────────────────────────────┬───────────────┤
│ Left:        │ Center:                     │ Right:        │
│ repo tree    │ Monaco editor (tabs, diff,  │ engineering   │
│ branches     │ inline AI changes)          │ agent chat    │
│ project files│                             │ task plan     │
│              │                             │ activity      │
│              │                             │ review (files │
│              │                             │ changed, why, │
│              │                             │ tests, risk,  │
│              │                             │ recommendation│
├──────────────┴──────────────────────────────┴───────────────┤
│ Bottom: sandboxed terminal · logs · test output             │
└─────────────────────────────────────────────────────────────┘
```

## 29.3 Panels (R-ENG-1)

- **Repository Explorer:** files, folders, search, symbols, dependencies; repository import (GitHub via integration, 25).
- **Editor:** Monaco; tabs; diff view; inline AI changes with accept/reject.
- **Agent Activity:** reading / searching / planning / editing / running command / running tests / reviewing / waiting (low-level events hidden by default, 33.6).
- **Terminal:** streamed from the sandbox (30); allow-listed commands.
- **Git:** branches, commits, diffs, PRs, merge status.
- **Tests:** runs, failures, logs.
- **Preview:** app preview / browser preview where appropriate.
- **Task:** current task, plan, progress, blockers, approvals.
- **Review:** files changed, reason per change, tests, risk, agent recommendation.

## 29.4 Approval Gates

- Consequential operations (merge to protected branches, deploy, publish) render as review panels → Approval Engine (19).
- The user reviews diffs before approving; nothing lands silently.

## 29.5 Sandbox Ties

All execution via sandbox (30); host access never granted. Repository access controls per org/agent.

## 29.6 Phase 9 Scope

Repository import → browser/editor → agent activity → sandbox terminal → git/PRs → tests → preview → review gates. Platform-native engineering agent interface (ADR-010): Codebuff/OpenHands concepts studied/reused only where license and architecture permit.
