import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { verifyShopSessionValue, SHOP_SESSION_COOKIE_NAME } from "@/lib/shop-session";

// Cheap, signature-only checks (no DB calls in middleware). The DB-backed
// "is this shop/admin still active" check happens in the pages/actions
// themselves — see requireActiveShop() and requireAdmin().
export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (pathname.startsWith("/deal")) {
    const cookieValue = request.cookies.get(SHOP_SESSION_COOKIE_NAME)?.value;
    const shopId = await verifyShopSessionValue(cookieValue);
    if (!shopId) {
      return NextResponse.redirect(new URL("/", request.url));
    }
    return NextResponse.next();
  }

  if (pathname.startsWith("/admin") && pathname !== "/admin/login") {
    let response = NextResponse.next({ request });

    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() {
            return request.cookies.getAll();
          },
          setAll(cookiesToSet) {
            for (const { name, value } of cookiesToSet) {
              request.cookies.set(name, value);
            }
            response = NextResponse.next({ request });
            for (const { name, value, options } of cookiesToSet) {
              response.cookies.set(name, value, options);
            }
          },
        },
      }
    );

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.redirect(new URL("/admin/login", request.url));
    }

    return response;
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/deal/:path*", "/admin/:path*"],
};
