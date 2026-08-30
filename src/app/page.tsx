import { redirect } from "next/navigation";
import Link from "next/link";
import { ShopCodeForm } from "@/components/ShopCodeForm";
import { getShopIdFromCookie, clearShopSessionCookie } from "@/lib/shop-session";
import { createAdminClient } from "@/lib/supabase/admin-client";

export default async function Home() {
  const shopId = await getShopIdFromCookie();

  if (shopId) {
    const supabase = createAdminClient();
    const { data: shop } = await supabase
      .from("shops")
      .select("active")
      .eq("id", shopId)
      .maybeSingle();

    if (shop?.active) {
      redirect("/deal");
    }
    // Cookie signature was valid but the shop no longer exists/is deactivated.
    await clearShopSessionCookie();
  }

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-8 bg-slate-50 px-4 py-16">
      <div className="text-center">
        <h1 className="text-2xl font-semibold text-slate-900">Loan Pre-Qualification Tool</h1>
        <p className="mt-1 text-sm text-slate-500">Enter your shop code to start a deal.</p>
      </div>
      <ShopCodeForm />
      <Link href="/admin/login" className="text-xs text-slate-400 hover:text-slate-600">
        Admin login
      </Link>
    </div>
  );
}
