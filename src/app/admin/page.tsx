import { requireAdmin } from "@/lib/require-admin";
import { createAdminClient } from "@/lib/supabase/admin-client";
import { logoutAdmin } from "@/actions/admin-auth";
import { CreateShopForm } from "@/components/CreateShopForm";
import { ShopRow } from "@/components/ShopRow";
import type { Shop } from "@/lib/types";

export default async function AdminPage() {
  await requireAdmin();

  const supabase = createAdminClient();
  const { data: shops } = await supabase
    .from("shops")
    .select("*")
    .order("created_at", { ascending: false });

  return (
    <div className="mx-auto w-full max-w-3xl flex-1 px-4 py-12">
      <div className="mb-8 flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-slate-900">Shop Management</h1>
        <form action={logoutAdmin}>
          <button type="submit" className="text-sm text-slate-500 underline hover:text-slate-800">
            Sign out
          </button>
        </form>
      </div>

      <div className="mb-10 rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
        <CreateShopForm />
      </div>

      <div className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
        <table className="w-full text-left">
          <thead>
            <tr className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-400">
              <th className="pb-2 pr-4 font-medium">Shop</th>
              <th className="pb-2 pr-4 font-medium">Code</th>
              <th className="pb-2 pr-4 font-medium">Status</th>
              <th className="pb-2 text-right font-medium">Action</th>
            </tr>
          </thead>
          <tbody>
            {(shops as Shop[] | null)?.map((shop) => (
              <ShopRow key={shop.id} shop={shop} />
            ))}
            {(!shops || shops.length === 0) && (
              <tr>
                <td colSpan={4} className="py-6 text-center text-sm text-slate-400">
                  No shops yet — create one above.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
