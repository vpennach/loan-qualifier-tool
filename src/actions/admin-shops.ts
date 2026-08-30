"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/require-admin";
import { createAdminClient } from "@/lib/supabase/admin-client";

export interface CreateShopState {
  error: string | null;
}

function generateShopCode(): string {
  // 8 chars, uppercase alphanumeric, unambiguous character set (no 0/O/1/I).
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let i = 0; i < 8; i++) {
    code += alphabet[Math.floor(Math.random() * alphabet.length)];
  }
  return code;
}

export async function createShop(
  _prevState: CreateShopState,
  formData: FormData
): Promise<CreateShopState> {
  const admin = await requireAdmin();
  const shopName = String(formData.get("shop_name") ?? "").trim();

  if (!shopName) {
    return { error: "Shop name is required." };
  }

  const supabase = createAdminClient();

  // Regenerate on the rare collision with an existing unique shop_code.
  for (let attempt = 0; attempt < 5; attempt++) {
    const shopCode = generateShopCode();
    const { error } = await supabase
      .from("shops")
      .insert({ shop_name: shopName, shop_code: shopCode, created_by: admin.id });

    if (!error) {
      revalidatePath("/admin");
      return { error: null };
    }
    if (error.code !== "23505") {
      // not a unique-violation — don't retry
      return { error: "Could not create shop. Please try again." };
    }
  }

  return { error: "Could not generate a unique shop code. Please try again." };
}

export async function setShopActive(shopId: string, active: boolean) {
  await requireAdmin();
  const supabase = createAdminClient();
  await supabase.from("shops").update({ active }).eq("id", shopId);
  revalidatePath("/admin");
}
