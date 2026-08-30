import "server-only";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server-client";
import type { User } from "@supabase/supabase-js";

// Every Admin-role account is a real Supabase Auth user with app_metadata.role
// set to "admin" (app_metadata can only be written with the service-role key,
// so a rep/shop code can never self-escalate into this). See README for how
// to promote a newly-created auth user to admin.
export async function requireAdmin(): Promise<User> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/admin/login");
  }

  if (user.app_metadata?.role !== "admin") {
    redirect("/admin/login?error=not_admin");
  }

  return user;
}
