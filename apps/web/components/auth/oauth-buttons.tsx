import type { ReactNode } from "react";

// Provider sign-in buttons. GitHub and Google publish their own mark rules, so
// each button keeps the official mark and the wordmark-free "Continue with X"
// label. Buttons render only for providers this deployment has configured, so
// the page never offers a flow that cannot complete.

function GitHubMark() {
  return (
    <svg viewBox="0 0 16 16" aria-hidden className="h-4 w-4 fill-current">
      <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27s1.36.09 2 .27c1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0 0 16 8c0-4.42-3.58-8-8-8z" />
    </svg>
  );
}

function GoogleMark() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden className="h-4 w-4">
      <path
        fill="#4285F4"
        d="M23.49 12.27c0-.79-.07-1.54-.19-2.27H12v4.51h6.47a5.57 5.57 0 0 1-2.4 3.58v3h3.86c2.26-2.09 3.56-5.17 3.56-8.82z"
      />
      <path
        fill="#34A853"
        d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.86-3c-1.08.72-2.45 1.16-4.07 1.16-3.13 0-5.78-2.11-6.73-4.96H1.29v3.09A11.99 11.99 0 0 0 12 24z"
      />
      <path
        fill="#FBBC05"
        d="M5.27 14.29a7.2 7.2 0 0 1-.38-2.29c0-.8.14-1.57.38-2.29V6.62H1.29A11.99 11.99 0 0 0 0 12c0 1.94.46 3.77 1.29 5.38l3.98-3.09z"
      />
      <path
        fill="#EA4335"
        d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.31 0 3.26 2.69 1.29 6.62l3.98 3.09C6.22 6.86 8.87 4.75 12 4.75z"
      />
    </svg>
  );
}

function ProviderLink({
  href,
  children,
  label,
}: {
  href: string;
  children: ReactNode;
  label: string;
}) {
  return (
    <a
      href={href}
      aria-label={label}
      className="inline-flex h-11 w-full items-center justify-center gap-2.5 rounded-lg border border-white/10 bg-white/[0.03] text-sm text-white transition-colors hover:border-white/20 hover:bg-white/[0.06]"
    >
      {children}
      <span>{label}</span>
    </a>
  );
}

export function OAuthButtons({
  providers,
  next,
}: {
  providers: { github: boolean; google: boolean };
  next?: string | null;
}) {
  if (!providers.github && !providers.google) return null;
  const qs = next ? `?next=${encodeURIComponent(next)}` : "";

  return (
    <div className="mt-6">
      <div className="flex items-center gap-3" aria-hidden>
        <span className="h-px flex-1 bg-white/10" />
        <span className="text-xs text-white/40">or</span>
        <span className="h-px flex-1 bg-white/10" />
      </div>
      <div className="mt-4 grid gap-3">
        {providers.github && (
          <ProviderLink
            href={`/api/auth/oauth/start/github${qs}`}
            label="Continue with GitHub"
          >
            <GitHubMark />
          </ProviderLink>
        )}
        {providers.google && (
          <ProviderLink href={`/api/auth/oauth/start/google${qs}`} label="Continue with Google">
            <GoogleMark />
          </ProviderLink>
        )}
      </div>
    </div>
  );
}
