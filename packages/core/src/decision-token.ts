// docs/82 §decision-token — binding a founder's approval to the exact call.
//
// An approval card shows the founder one sentence and one argument object. The
// decision they make must authorize THAT call and no other: not a re-ordered
// version of the same arguments, not the same tool with a swapped recipient,
// not a different call that happens to reuse an open gate. The mechanism is a
// decision token: sha256(tool_id + canonical_json(tool_params)), stored on the
// approval row when the gate opens, recomputed when the gate is consumed — and
// a mismatch is a denial, audited.
//
// Canonicalization matters as much as the hash. `JSON.stringify` emits keys in
// insertion order, so `{a:1,b:2}` and `{b:2,a:1}` — the same call — hash
// differently, while structurally distinct values (`{"a":"1"}` vs `{"a":1}`)
// must hash differently and do. Every hash that binds a decision therefore
// goes through `canonicalJson`, never raw stringify.

import { createHash } from 'node:crypto';

/**
 * Deterministic, sorted-key JSON serialization (RFC 8785 subset).
 *
 * - Object keys are recursively sorted lexicographically.
 * - Arrays keep their order (order is information in a list).
 * - `undefined` is dropped from objects and arrays, matching JSON semantics.
 * - Non-finite numbers are rejected: they have no JSON representation, so a
 *   payload containing one must fail loudly instead of hashing to `null`.
 *
 * Used for decision tokens and payload hashes — anywhere two parties must
 * agree byte-for-byte on what was authorized.
 */
export function canonicalJson(value: unknown): string {
  return canonicalValue(value, '$');
}

function canonicalValue(value: unknown, path: string): string {
  if (value === null) return 'null';

  const type = typeof value;
  switch (type) {
    case 'string':
      return JSON.stringify(value);
    case 'boolean':
      return value ? 'true' : 'false';
    case 'number':
      if (!Number.isFinite(value as number)) {
        throw new Error(`canonicalJson: non-finite number at ${path}`);
      }
      return JSON.stringify(value);
    case 'object':
      break;
    default:
      // undefined, function, symbol, bigint — none are representable in JSON.
      // `undefined` is silently dropped by real JSON serialization, so it is
      // treated the same here; anything callable or symbolic is a bug in the
      // caller and fails loudly.
      if (value === undefined) return 'null';
      throw new Error(`canonicalJson: unserializable ${type} at ${path}`);
  }

  if (value instanceof Date) return JSON.stringify(value.toISOString());
  if (Array.isArray(value)) {
    return `[${value.map((item, i) => canonicalValue(item, `${path}[${i}]`)).join(',')}]`;
  }

  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonicalValue(v, `${path}.${k}`)}`).join(',')}}`;
}

/** sha256 of a canonicalized payload — the one hash everything reuses. */
export function canonicalSha256(value: unknown): string {
  return createHash('sha256').update(canonicalJson(value)).digest('hex');
}

/**
 * The decision token for a gated tool call.
 *
 * `params` is canonicalized, so the same logical call hashes identically no
 * matter the key order it arrived in; a different call — a swapped recipient,
 * an extra argument, a changed amount — hashes differently and is refused.
 */
export function decisionToken(toolId: string, toolParams: unknown): string {
  return canonicalSha256({ toolId, toolParams: toolParams ?? null });
}

/**
 * Task-level gates bind the same way: the founder authorized "run THIS task",
 * so the consumed call must be that task's execute. No params to canonicalize
 * — the task id is the exact thing being authorized.
 */
export function taskDecisionToken(taskId: string): string {
  return createHash('sha256').update(`task.execute:${taskId}`).digest('hex');
}
