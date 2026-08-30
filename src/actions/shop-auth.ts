"use server";

import { redirect } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin-client";
import { clearShopSessionCookie, setShopSessionCookie } from "@/lib/shop-session";

export interface ShopCodeState {
  error: string | null;
}

// Deliberately generic error message — do not reveal whether a code is wrong
// vs. belongs to a deactivated shop (Section 5.2 of the spec).
const INVALID_CODE_ERROR = "Invalid shop code. Please check with your manager and try again.";

export async function submitShopCode(
  _prevState: ShopCodeState,
  formData: FormData
): Promise<ShopCodeState> {
  const shopCode = String(formData.get("shop_code") ?? "").trim();

  if (!shopCode) {
    return { error: INVALID_CODE_ERROR };
  }

  const supabase = createAdminClient();
  const { data: shop } = await supabase
    .from("shops")
    .select("id, active")
    .eq("shop_code", shopCode)
    .maybeSingle();

  if (!shop || !shop.active) {
    return { error: INVALID_CODE_ERROR };
  }

  await setShopSessionCookie(shop.id);
  redirect("/deal");
}

export async function logoutShop() {
  await clearShopSessionCookie();
  redirect("/");
}
