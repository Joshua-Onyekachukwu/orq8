/**
 * CSRF token helper for ORQ8 frontend.
 * Reads the csrf_token cookie and returns the value to include in X-CSRF-Token header.
 */
export function getCsrfToken(): string | undefined {
  if (typeof document === 'undefined') return undefined;
  const match = document.cookie.match(/csrf_token=([^;]+)/);
  return match?.[1];
}

/**
 * Returns headers object with CSRF token for state-changing requests.
 */
export function csrfHeaders(): Record<string, string> {
  const token = getCsrfToken();
  return token ? { 'X-CSRF-Token': token } : {};
}
