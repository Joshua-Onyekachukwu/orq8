/**
 * Password strength scoring — client-side feedback for the registration form.
 *
 * The score is advisory UX only; the authoritative policy (min length) is
 * enforced server-side by the API. No password material ever leaves the
 * browser — this runs on the typed value locally.
 *
 * Scoring (0–4): length, character variety, and penalty heuristics for
 * common passwords, repeats and predictable sequences.
 */

export type StrengthLabel = 'weak' | 'fair' | 'good' | 'strong';

export interface StrengthResult {
  score: 0 | 1 | 2 | 3 | 4;
  label: StrengthLabel;
  suggestions: string[];
}

const COMMON_PASSWORDS = new Set([
  'password', 'password1', 'password123', '123456', '12345678', '123456789',
  '1234567890', 'qwerty', 'qwerty123', 'abc123', 'letmein', 'welcome',
  'admin', 'admin123', 'iloveyou', 'monkey', 'dragon', 'football',
  'baseball', 'sunshine', 'princess', 'superman', 'trustno1', 'orq8',
]);

const KEYBOARD_SEQUENCES = ['qwerty', 'asdf', 'zxcv', '1234', '4321', 'abcd'];

export function scorePassword(password: string): StrengthResult {
  const suggestions: string[] = [];
  if (password.length === 0) {
    return { score: 0, label: 'weak', suggestions: [] };
  }

  const lower = password.toLowerCase();

  // Common-password check dominates — no composition tricks save it.
  if (COMMON_PASSWORDS.has(lower)) {
    return {
      score: 0,
      label: 'weak',
      suggestions: ['This is one of the most commonly used passwords — choose something unique.'],
    };
  }

  let score = 0;

  // Length — the single strongest predictor.
  if (password.length >= 8) score += 1;
  if (password.length >= 12) score += 1;
  if (password.length >= 16) score += 1;
  if (password.length < 8) {
    suggestions.push('Use at least 8 characters (12+ is stronger).');
  }

  // Variety.
  const hasLower = /[a-z]/.test(password);
  const hasUpper = /[A-Z]/.test(password);
  const hasDigit = /[0-9]/.test(password);
  const hasSymbol = /[^a-zA-Z0-9]/.test(password);
  const variety = [hasLower, hasUpper, hasDigit, hasSymbol].filter(Boolean).length;
  if (variety >= 3) score += 1;
  if (variety < 3) {
    suggestions.push('Mix upper and lower case letters, numbers, or symbols.');
  }

  // Penalties — repetitive characters (aaa, 111).
  if (/(.)\1{2,}/.test(password)) {
    score = Math.max(0, score - 1);
    suggestions.push('Avoid repeating the same character three or more times.');
  }

  // Penalties — keyboard sequences (qwerty, 1234).
  if (KEYBOARD_SEQUENCES.some((seq) => lower.includes(seq))) {
    score = Math.max(0, score - 1);
    suggestions.push('Avoid keyboard patterns like "qwerty" or "1234".');
  }

  const bounded = Math.min(4, Math.max(0, score)) as StrengthResult['score'];
  const labels: Record<StrengthResult['score'], StrengthLabel> = {
    0: 'weak',
    1: 'weak',
    2: 'fair',
    3: 'good',
    4: 'strong',
  };

  return { score: bounded, label: labels[bounded], suggestions };
}
