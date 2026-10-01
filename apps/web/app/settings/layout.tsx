import { CONSOLE_THEME_COOKIE, resolveConsoleTheme } from "../../lib/console-theme";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Settings" };

/**
 * The settings area renders inside the same console as the app (docs/71):
 * the theme cookie is read on the server so the first paint already carries
 * the founder's dark/light choice, exactly like `app/layout.tsx`.
 */
export default async function SettingsLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const { cookies } = await import("next/headers");
  const cookieStore = await cookies();
  const consoleTheme = resolveConsoleTheme(
    cookieStore.get(CONSOLE_THEME_COOKIE)?.value,
  );

  return (
    <div
      id="main"
      className="console min-h-screen"
      data-console-theme={consoleTheme}
    >
      {children}
    </div>
  );
}
