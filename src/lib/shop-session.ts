import "server-only";
import { cookies } from "next/headers";

// Shop reps authenticate with a shared shop code, not a personal Supabase Auth
// account, so we can't use Supabase's session cookies for them. Instead we mint
// a small HMAC-signed cookie: "<shopId>.<signature>". The signature proves the
// cookie was issued by us (rep can't forge a different shopId), but it does NOT
// prove the shop is still active — callers must re-check `shops.active` from the
// DB before trusting the session (see requireActiveShop below).
//
// Uses Web Crypto (SubtleCrypto) rather than Node's `crypto` module so this
// file works from Edge Middleware as well as normal server components/actions.

const COOKIE_NAME = "shop_session";
const MAX_AGE_SECONDS = 60 * 60 * 24 * 365; // effectively "until cleared or deactivated"

function getSecret(): string {
  const secret = process.env.SHOP_SESSION_SECRET;
  if (!secret) {
    throw new Error(
      "Missing SHOP_SESSION_SECRET. Copy .env.local.example to .env.local and set a random secret string."
    );
  }
  return secret;
}

function toHex(buffer: ArrayBuffer): string {
  return Array.from(new Uint8Array(buffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function fromHex(hex: string): Uint8Array<ArrayBuffer> {
  if (hex.length % 2 !== 0) return new Uint8Array(0);
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}

async function getHmacKey(): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(getSecret()),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"]
  );
}

async function sign(shopId: string): Promise<string> {
  const key = await getHmacKey();
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(shopId));
  return toHex(signature);
}

export async function setShopSessionCookie(shopId: string) {
  const cookieStore = await cookies();
  const signature = await sign(shopId);
  cookieStore.set(COOKIE_NAME, `${shopId}.${signature}`, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: MAX_AGE_SECONDS,
  });
}

export async function clearShopSessionCookie() {
  const cookieStore = await cookies();
  cookieStore.delete(COOKIE_NAME);
}

// Verifies the cookie's signature only (no DB call — safe for middleware).
export async function verifyShopSessionValue(value: string | undefined): Promise<string | null> {
  if (!value) return null;
  const dotIndex = value.lastIndexOf(".");
  if (dotIndex === -1) return null;

  const shopId = value.slice(0, dotIndex);
  const signatureHex = value.slice(dotIndex + 1);

  const key = await getHmacKey();
  const valid = await crypto.subtle.verify(
    "HMAC",
    key,
    fromHex(signatureHex),
    new TextEncoder().encode(shopId)
  );

  return valid ? shopId : null;
}

export async function getShopIdFromCookie(): Promise<string | null> {
  const cookieStore = await cookies();
  return verifyShopSessionValue(cookieStore.get(COOKIE_NAME)?.value);
}

export { COOKIE_NAME as SHOP_SESSION_COOKIE_NAME };
