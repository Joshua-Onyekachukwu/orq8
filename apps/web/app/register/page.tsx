import Link from "next/link";
import { AuthForm } from "../../components/auth-form";

export const metadata = { title: "Create your organization" };

export default function RegisterPage() {
  return (
    <div id="main" className="flex min-h-screen flex-col items-center justify-center bg-canvas px-6">
      <Link href="/" className="mb-8 text-2xl font-semibold tracking-tight text-navy-900">
        ORQ8
      </Link>
      <div className="w-full max-w-sm rounded-xl border border-hairline bg-white p-8 shadow-sm">
        <h1 className="text-xl font-semibold text-ink">Create your organization</h1>
        <p className="mt-1 text-sm text-muted">
          You stay the CEO. The system runs the organization.
        </p>
        <div className="mt-6">
          <AuthForm mode="register" />
        </div>
        <p className="mt-6 text-center text-sm text-muted">
          Already have an account?{" "}
          <Link href="/login" className="font-medium text-navy-800 hover:underline">
            Sign in
          </Link>
        </p>
      </div>
    </div>
  );
}
