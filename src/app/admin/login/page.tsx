import Link from "next/link";
import { AdminLoginForm } from "@/components/AdminLoginForm";

export default async function AdminLoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-8 bg-slate-50 px-4 py-16">
      <div className="text-center">
        <h1 className="text-2xl font-semibold text-slate-900">Admin Login</h1>
        <p className="mt-1 text-sm text-slate-500">Shop management access.</p>
      </div>
      {error === "not_admin" && (
        <p className="max-w-sm text-center text-sm font-medium text-red-600">
          That account is signed in but does not have Admin access.
        </p>
      )}
      <AdminLoginForm />
      <Link href="/" className="text-xs text-slate-400 hover:text-slate-600">
        Back to shop login
      </Link>
    </div>
  );
}
