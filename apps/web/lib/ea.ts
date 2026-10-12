/**
 * Executive Agent brand identity — the deployment-wide default.
 *
 * The EA's name is a per-organization setting (settings.eaName, editable from
 * Settings → Account). This constant is only the fallback used when an org has
 * never renamed its Executive Agent: client components read the live name from
 * the EA context (`useEaName()`), and server components read it off the active
 * membership (`org.eaName`).
 *
 * NEXT_PUBLIC_EA_NAME remains the deployment-wide default so a rebranded
 * install ships with a branded default without touching component code.
 *
 * The API carries the same name into the founder's EA via EA_DISPLAY_NAME
 * (packages/core config); set both to keep the spoken name and the UI name
 * identical for orgs that never rename theirs.
 */
export const EA_NAME: string = (process.env.NEXT_PUBLIC_EA_NAME ?? "").trim() || "Atlas";