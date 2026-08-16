import Link from "next/link";
import { AuthForm } from "../../components/auth-form";

export const metadata = { title: "Sign in" };

export default function LoginPage() {
  return (
    <div id="main" className="flex min-h-screen flex-col items-center justify-center bg-canvas px-6">
      <Link href="/" className="mb-8 text-2xl font-semibold tracking-tight text-navy-900">
        ORQ8
      </Link>
      <div className="w-full max-w-sm rounded-xl border border-hairline bg-white p-8 shadow-sm">
        <h1 className="text-xl font-semibold text-ink">Welcome back</h1>
        <p className="mt-1 text-sm text-muted">Sign in to your organization.</p>
        <div className="mt-6">
          <AuthForm mode="login" />
        </div>
        <p className="mt-6 text-center text-sm text-muted">
          New to ORQ8?{" "}
          <Link href="/register" className="font-medium text-navy-800 hover:underline">
            Create an organization
          </Link>
        </p>
      </div>
    </div>
  );
}
