/**
 * Executive Agent brand identity.
 *
 * The EA's name is configurable through NEXT_PUBLIC_EA_NAME so it can be
 * rebranded without touching component code. The API carries the same name
 * into the EA's system prompt via EA_DISPLAY_NAME (packages/core config);
 * set both to keep the spoken name and the UI name identical.
 */
export const EA_NAME: string = (process.env.NEXT_PUBLIC_EA_NAME ?? "").trim() || "Atlas";
