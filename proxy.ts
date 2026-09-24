import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { ADMIN_COOKIE } from "@/lib/auth";

/**
 * A friend link is read-only by default. Visiting `/?admin=SECRET` with the
 * correct passcode promotes this browser to the banker (admin) view via an
 * httpOnly cookie, then redirects to the clean `/` URL so the secret never
 * sits in browser history or gets shared when the link is forwarded.
 */
export function proxy(req: NextRequest) {
  const { searchParams, pathname } = req.nextUrl;
  if (pathname !== "/") return NextResponse.next();

  const secret = searchParams.get("admin");
  const expected = process.env.ADMIN_SECRET;
  if (!secret || !expected || secret !== expected) return NextResponse.next();

  const res = NextResponse.redirect(new URL("/", req.url));
  res.cookies.set(ADMIN_COOKIE, "1", {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 90,
  });
  return res;
}

export const config = { matcher: "/" };
