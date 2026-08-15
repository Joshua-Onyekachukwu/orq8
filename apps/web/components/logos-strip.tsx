// Landing "logos" strip — the models ORQ8 routes to (docs/23.1 provider catalog).
// Honest BYOK message: wordmarks, not paid placements.
const PROVIDERS = [
  { name: "OpenAI", dot: "bg-emerald-400" },
  { name: "Anthropic", dot: "bg-amber-300" },
  { name: "Gemini", dot: "bg-sky-400" },
  { name: "DeepSeek", dot: "bg-violet-400" },
  { name: "Groq", dot: "bg-rose-400" },
  { name: "OpenRouter", dot: "bg-teal-400" },
  { name: "Ollama", dot: "bg-white/50" },
];

export function LogosStrip() {
  return (
    <section className="border-b border-hairline bg-white">
      <div className="mx-auto max-w-6xl px-6 py-14">
        <p className="eyebrow text-center text-muted">Runs on the models you already use</p>
        <p className="mx-auto mt-2 max-w-xl text-center text-sm text-muted">
          Bring your own keys for frontier models — or run free local ones. ORQ8 routes every
          task to the cheapest adequate model. No lock-in, no markup.
        </p>
        <ul className="mt-8 flex flex-wrap items-center justify-center gap-x-10 gap-y-5">
          {PROVIDERS.map((p) => (
            <li
              key={p.name}
              className="flex items-center gap-2 font-mono text-sm font-medium tracking-tight text-navy-700/70 transition-colors hover:text-navy-900"
            >
              <span aria-hidden className={`h-1.5 w-1.5 rounded-full ${p.dot}`} />
              {p.name}
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
