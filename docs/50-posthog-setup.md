# PostHog Analytics — Setup Guide

## Overview

PostHog provides product analytics, session recording, feature flags, and A/B testing for ORQ8. It's self-hostable or available as a cloud service.

## Setup Steps

### 1. Create PostHog Account

1. Go to [posthog.com](https://posthog.com) and create an account
2. Create a new project (e.g., "ORQ8 Production")
3. Copy the **Project API Key** (starts with `phc_`)

### 2. Configure Environment Variables

Add these to Railway (API service) and Vercel (web app):

```
# PostHog Analytics
NEXT_PUBLIC_POSTHOG_KEY=phc_your_project_key_here
NEXT_PUBLIC_POSTHOG_HOST=https://us.i.posthog.com
```

**Railway** (API service → Variables tab):
- `NEXT_PUBLIC_POSTHOG_KEY`
- `NEXT_PUBLIC_POSTHOG_HOST`

**Vercel** (Web app → Settings → Environment Variables):
- `NEXT_PUBLIC_POSTHOG_KEY`
- `NEXT_PUBLIC_POSTHOG_HOST`

### 3. Install PostHog JS

```bash
cd apps/web
npm install posthog-js
```

### 4. Verify

After deployment, check the browser console for:
```
[analytics] user_registered { method: "email" }
```

If you see analytics logs, PostHog is working.

## Events Tracked

### Auth Events
| Event | Properties | When |
|---|---|---|
| `user_registered` | `method` | New user signs up |
| `user_logged_in` | `method` | User logs in |
| `user_logged_out` | — | User logs out |

### AI Workforce Events
| Event | Properties | When |
|---|---|---|
| `agent_hired` | `role` | New agent created |
| `agent_paused` | `agent_id` | Agent paused |
| `agent_emergency_stop` | — | All agents stopped |
| `goal_created` | `priority` | New goal created |
| `goal_completed` | `goal_id` | Goal marked complete |
| `command_sent` | `command_length` | Executive Agent command |
| `command_completed` | `status`, `duration_ms` | Command finished |
| `task_created` | `agent_role` | Task assigned to agent |
| `task_completed` | `agent_role`, `duration_ms` | Task finished |
| `task_failed` | `agent_role`, `error` | Task failed |
| `tool_executed` | `tool_id`, `success` | Tool invoked |

### Provider Events
| Event | Properties | When |
|---|---|---|
| `provider_key_added` | `provider` | API key configured |
| `provider_key_tested` | `provider`, `success` | Key tested |
| `provider_fallback` | `from`, `to`, `reason` | Provider fallback |

### System Events
| Event | Properties | When |
|---|---|---|
| `api_error` | `endpoint`, `status` | API error |
| `llm_error` | `provider`, `error` | LLM failure |
| `slow_request` | `endpoint`, `duration_ms` | Request > 5s |
| `credits_low` | `remaining` | Credits < 20% |

## Using Analytics in Components

```tsx
import { analytics } from "@/lib/analytics";

// Track a custom event
analytics.agentHired("marketing");

// Track with custom properties
analytics.commandSent("Research competitors", 25);
```

## Dashboard

After events start flowing:
1. Go to [PostHog Dashboard](https://app.posthog.com)
2. Navigate to Insights → Product Analytics
3. Create dashboards for:
   - **User Funnel**: Register → Onboard → First Agent → First Goal → First Command
   - **AI Execution**: Commands sent → Tasks created → Tasks completed/failed
   - **Provider Health**: Fallbacks, errors, latency
   - **Engagement**: Daily active users, commands per user

## Self-Hosting (Optional)

For full data control, self-host PostHog:

```bash
# Docker Compose
wget https://raw.githubusercontent.com/PostHog/posthog/master/docker-compose.yml
docker-compose up -d
```

Then set `NEXT_PUBLIC_POSTHOG_HOST=https://your-posthog-domain.com`

## Privacy

- PostHog respects Do Not Track headers
- Session recording is disabled by default
- Autocapture is disabled — we only track explicit events
- API keys and secrets are never sent to PostHog
- Users can opt out via PostHog's built-in mechanism
