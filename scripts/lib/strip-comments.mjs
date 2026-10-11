/**
 * Comment-stripping for source scans, shared by the verification scripts
 * (`verify-live-assets.mjs`, `verify-no-store.mjs`).
 *
 * Both scripts scan source for *code* — an asset reference, a fetch cache
 * option — and both were written after a scan that read comments and produced a
 * false positive: prose that names a path or a caching option is documentation,
 * not behavior, and a gate that fails on a comment gets deleted the first time
 * it is inconvenient. String and template contents are kept, because a value
 * there is exactly what these scans look for, and `//` inside `"https://…"` is
 * therefore left alone.
 *
 * One implementation on purpose: a second copy would drift, and the scan that
 * drifts is the one that starts lying.
 */
export function stripComments(text) {
  let out = "";
  let quote = null;
  let i = 0;
  while (i < text.length) {
    const c = text[i];
    const next = text[i + 1];
    if (quote) {
      out += c;
      if (c === "\\") {
        out += next ?? "";
        i += 2;
        continue;
      }
      if (c === quote) quote = null;
      i++;
      continue;
    }
    if (c === '"' || c === "'" || c === "`") {
      quote = c;
      out += c;
      i++;
      continue;
    }
    if (c === "/" && next === "/") {
      while (i < text.length && text[i] !== "\n") {
        out += " ";
        i++;
      }
      continue;
    }
    if (c === "/" && next === "*") {
      i += 2;
      while (i < text.length && !(text[i] === "*" && text[i + 1] === "/")) {
        out += text[i] === "\n" ? "\n" : " ";
        i++;
      }
      i += 2;
      continue;
    }
    out += c;
    i++;
  }
  return out;
}
