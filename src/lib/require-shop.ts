import "server-only";
import { redirect } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin-client";
import { clearShopSessionCookie, getShopIdFromCookie } from "@/lib/shop-session";
import type { Shop } from "@/lib/types";

// Call at the top of any /deal page or submission-writing server action.
// Verifies the session cookie's signature AND re-checks the shop is still
// active in the DB (a rep can be sitting on a long-lived cookie for a shop
// that got deactivated after they logged in).
export async function requireActiveShop(): Promise<Shop> {
  const shopId = await getShopIdFromCookie();
  if (!shopId) {
    redirect("/");
  }

  const supabase = createAdminClient();
  const { data: shop } = await supabase
    .from("shops")
    .select("*")
    .eq("id", shopId)
    .maybeSingle();

  if (!shop || !shop.active) {
    await clearShopSessionCookie();
    redirect("/");
  }

  return shop as Shop;
}
