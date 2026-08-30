import "server-only";
import { createClient } from "@supabase/supabase-js";

// Service-role client. Bypasses RLS entirely — never import this into anything
// that runs in the browser. Used for: shop-code lookups (shop reps have no
// Supabase Auth identity), submission writes, and admin shop management.
export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    throw new Error(
      "Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY. Copy .env.local.example to .env.local and fill in your Supabase project's values."
    );
  }

  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
