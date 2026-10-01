/**
 * Scanner: find client-module functions imported into server components.
 *
 * The dashboard crashed in production with "Attempted to call computeScore()
 * from the server but computeScore is on the client" because a server page
 * imported a plain function from a `"use client"` module. TypeScript and the
 * production build both accept that; only a render throws. This scan finds the
 * rest of the class before a reviewer does.
 *
 * A server file is any .ts/.tsx under app/ or components/ that does NOT start
 * with "use client". A client module is one that does. We flag imports of
 * non-component, non-type exports (lowercase identifier or `compute*`) from a
 * client module into a server file.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const ROOT = "apps/web";
const SKIP = new Set(["node_modules", ".next", ".turbo", "dist"]);

function walk(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    if (SKIP.has(entry)) continue;
    const full = join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) walk(full, out);
    else if (/\.(ts|tsx)$/.test(entry)) out.push(full);
  }
  return out;
}

const files = walk(ROOT);
const source = new Map(files.map((f) => [f, readFileSync(f, "utf8")]));
const isClient = (f) => /^\s*(?:\/\/[^\n]*\n)*\s*["']use client["']/.test(source.get(f) ?? "");

/** Non-component exported names in a client module (lowercase-led). */
function riskyExports(f) {
  const src = source.get(f) ?? "";
  const names = new Set();
  const re = /export\s+(?:async\s+)?(?:function|const|let|var)\s+([A-Za-z_$][\w$]*)/g;
  let m;
  while ((m = re.exec(src))) {
    const name = m[1];
    // Components are PascalCase; plain helpers are camelCase. Also treat
    // compute*/get*/format*/build*/parse* as helpers even if capitalised oddly.
    if (/^[a-z]/.test(name) || /^(compute|get|format|build|parse|resolve|make|derive)[A-Z]/.test(name)) {
      names.add(name);
    }
  }
  return names;
}

const report = [];
for (const file of files) {
  if (isClient(file)) continue; // only server-side consumers matter
  const src = source.get(file) ?? "";
  const importRe = /import\s+(?:type\s+)?\{([^}]+)\}\s+from\s+["']([^"']+)["']/g;
  let m;
  while ((m = importRe.exec(src))) {
    if (/^\s*type\b/.test(m[0]) || file.endsWith(".d.ts")) continue;
    const rawNames = m[1];
    const spec = m[2];
    let resolved = null;
    if (spec.startsWith(".")) {
      const base = join(file, "..", spec);
      for (const cand of [`${base}.ts`, `${base}.tsx`, join(base, "index.ts"), join(base, "index.tsx")]) {
        if (source.has(cand)) { resolved = cand; break; }
      }
    }
    if (!resolved || !isClient(resolved)) continue;
    const risky = riskyExports(resolved);
    for (const part of rawNames.split(",")) {
      const name = part.replace(/^\s*type\s+/, "").split(/\s+as\s+/)[0].trim();
      if (!name || !risky.has(name)) continue;
      report.push(
        `${relative(ROOT, file)}  imports  { ${name} }  from client module  ${relative(ROOT, resolved)}`,
      );
    }
  }
}

if (report.length === 0) {
  console.log("OK — no client-module functions imported into server components.");
} else {
  console.log(`FOUND ${report.length} server→client function import(s):`);
  for (const line of report) console.log(`  ${line}`);
}
