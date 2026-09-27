import type { Metadata } from "next";

// The verify-email page is a client component (useSearchParams), so it cannot
// export metadata itself. This layout gives it its own title and description
// so its head never inherits the root layout's marketing copy.
export const metadata: Metadata = {
  title: "Verify your email | ORQ8",
  description: "Verify your email address to activate your ORQ8 account.",
};

export default function VerifyEmailLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return children;
}
