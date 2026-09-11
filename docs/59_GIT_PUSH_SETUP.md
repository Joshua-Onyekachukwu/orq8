# 59 — Non-Interactive Git Push Setup (One-Time)

## Why pushes hang on this machine

The repo lives under `C:/Users/Administrator/...`. Git Credential Manager has **no
GitHub credential stored for the Administrator Windows account**, so a `git push`
opens an interactive prompt that no agent session can answer — the command waits
forever. Reads (`git ls-remote`, `git pull` from public access) still work because
the repo is reachable anonymously.

## What is already configured (repo-local, committed nothing)

`.git/config` for this repo now has:

```ini
[credential "https://github.com"]
    helper = !f() { if test -n "$GH_TOKEN"; then printf "username=oauth\npassword=%s\n" "$GH_TOKEN"; fi; :; }; f
[credential]
    interactive = false
```

Behavior after this change:

- **`GH_TOKEN` set in the environment** → pushes authenticate via the token, fully
  non-interactive.
- **No `GH_TOKEN`** → push fails in ~2 seconds with
  `fatal: unable to get password from user` instead of hanging a session.
- Nothing is written to disk by the helper; the token is read from the process
  environment only and never logged.

## One-time step that requires you

Create a Personal Access Token (scopes: `repo` for private repos, or
`Contents: Read and write` fine-grained), then pick **one** of these:

### Option A — PowerShell (persists for all future sessions of this account)

```powershell
[Environment]::SetEnvironmentVariable("GH_TOKEN", "ghp_xxxxxxxxxxxxxxxxxxxx", "User")
```

Restart the terminal/agent afterwards.

### Option B — Windows Credential Manager (GUI prompt, once)

Run this from a normal terminal; answer the browser/prompt once:

```bash
git credential-manager github login
```

The local token helper only fires when `GH_TOKEN` is set, so GCM's stored
credential is used otherwise — both paths are non-interactive afterwards.

### Option C — per-invocation (no persistence)

```bash
GH_TOKEN=ghp_xxx git push origin main
```

## Verify

```bash
git push origin main          # with GH_TOKEN set: pushes immediately
git ls-remote origin main     # always worked (anonymous read)
```

## Security notes

- The token is stored only in your Windows user profile / env, never in the repo.
- Never paste a token into chat, CI logs, or committed files.
- The helper prints the token only to git's credential protocol (in-memory).
