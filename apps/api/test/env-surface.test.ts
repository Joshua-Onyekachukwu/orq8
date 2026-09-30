import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { envRequiredInProduction, envSurface } from "@orq8/core";

/**
 * The environment surface guard.
 *
 * docs/62.13 found 35 of the 59 configuration keys appearing in no example
 * file at all. That is not a cosmetic gap: a deployer cannot learn the surface
 * from the examples, and the first symptom is a deployment that boots and then
 * quietly degrades (no email, no embeddings, no storage) or refuses to boot
 * because a production secret was never set.
 *
 * This test makes that drift impossible to reintroduce. Three files are
 * checked, each against the one source of truth (`envSchema` in
 * `@orq8/core`):
 *
 *   apps/api/.env.example   the canonical surface — must document EVERY key
 *   infra/.env.example      compose interpolation — a subset, but only real keys
 *   apps/web/.env.example   web runtime — only real keys plus web-only keys
 *
 * A key counts as documented when it appears as an assignment, commented out
 * or not, because a commented `# STRIPE_SECRET_KEY=` still tells a deployer
 * that the key exists and what it is for. The consequence is that prose must
 * never begin a line with `SOME_KEY=` — it reads as a setting. Write "Set
 * SOME_KEY to production" instead.
 */

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");

/** Every `KEY=...` and `# KEY=...` in a dotenv-style file, in file order. */
function documentedKeys(text: string): string[] {
  const keys: string[] = [];
  for (const line of text.split(/\r?\n/)) {
    const match = /^\s*#?\s*([A-Z][A-Z0-9_]*)\s*=/.exec(line);
    if (match?.[1]) keys.push(match[1]);
  }
  return keys;
}

/** Keys that are set and not commented out. */
function activeKeys(text: string): string[] {
  const keys: string[] = [];
  for (const line of text.split(/\r?\n/)) {
    const match = /^\s*([A-Z][A-Z0-9_]*)\s*=/.exec(line);
    if (match?.[1]) keys.push(match[1]);
  }
  return keys;
}

function read(relative: string): string {
  return readFileSync(path.join(repoRoot, relative), "utf8");
}

/**
 * Keys that legitimately live outside the API's configuration schema, because
 * they belong to a different runtime: compose interpolation (the stack's own
 * ports and credentials) and the web app's server and browser variables. They
 * are listed explicitly so that a genuinely unknown key still fails.
 */
const SURFACE_EXTRAS: Record<string, string[]> = {
  "infra/.env.example": [
    "POSTGRES_USER",
    "POSTGRES_PASSWORD",
    "POSTGRES_DB",
    "POSTGRES_PORT",
    "MINIO_ROOT_USER",
    "MINIO_ROOT_PASSWORD",
    "MINIO_BUCKET",
    "MINIO_API_PORT",
    "MINIO_CONSOLE_PORT",
    "LITELLM_PORT",
    "OLLAMA_PORT",
    "API_PORT",
    "WEB_PORT",
    "LANGFUSE_PORT",
  ],
  "apps/web/.env.example": [
    "API_URL",
    "NEXT_PUBLIC_API_URL",
    "NEXT_PUBLIC_EA_NAME",
    "NEXT_PUBLIC_POSTHOG_KEY",
    "NEXT_PUBLIC_POSTHOG_HOST",
    "REGISTRATION_OPEN",
    "AUTH_SECRET",
  ],
};

describe("environment surface", () => {
  const schema = envSurface();
  const canonical = "apps/api/.env.example";

  it("declares a plausible surface (guards against a broken parse)", () => {
    // If this fails the schema import is wrong, and every check below would
    // pass vacuously against an empty list.
    expect(schema.length).toBeGreaterThan(40);
    expect(schema).toContain("DATABASE_URL");
    expect(new Set(schema).size).toBe(schema.length);
  });

  it(`${canonical} documents every key the API can read`, () => {
    const documented = new Set(documentedKeys(read(canonical)));
    const missing = schema.filter((key) => !documented.has(key));
    expect(
      missing,
      `undocumented configuration keys — add them to ${canonical} (with a comment saying what they do and whether the dev default is safe):\n  ${missing.join("\n  ")}`,
    ).toEqual([]);
  });

  it(`${canonical} documents each key once`, () => {
    const keys = documentedKeys(read(canonical));
    const duplicates = keys.filter((key, index) => keys.indexOf(key) !== index);
    expect([...new Set(duplicates)], "a key documented twice reads as two different settings").toEqual([]);
  });

  it("sets every deploy-critical key to something a deployer must replace", () => {
    const active = new Set(activeKeys(read(canonical)));
    const missing = envRequiredInProduction().filter((key) => !active.has(key));
    expect(
      missing,
      `these keys must be present and uncommented in ${canonical}, because production refuses to boot without them`,
    ).toEqual([]);
  });

  it("does not document keys that exist in no runtime", () => {
    for (const file of ["infra/.env.example", "apps/web/.env.example"]) {
      const allowed = new Set([...schema, ...(SURFACE_EXTRAS[file] ?? [])]);
      const unknown = documentedKeys(read(file)).filter((key) => !allowed.has(key));
      expect(unknown, `${file} documents keys that no runtime reads`).toEqual([]);
    }
  });

  it("keeps the compose stack interpolating keys the API really reads", () => {
    // The infra file is a subset, but a subset that has to stay honest: a key
    // that no longer exists in the schema is a container starting with a
    // variable nothing consumes.
    const documented = new Set(documentedKeys(read("infra/.env.example")));
    expect(documented.has("SESSION_SECRET")).toBe(true);
    expect(documented.has("ENCRYPTION_KEY")).toBe(true);
  });
});
