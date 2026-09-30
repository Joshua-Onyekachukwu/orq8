export const metadata = { title: "Settings" };

export default function SettingsLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return <div className="bg-canvas">{children}</div>;
}
