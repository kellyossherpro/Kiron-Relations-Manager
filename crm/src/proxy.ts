import { NextResponse, type NextRequest } from "next/server";
import { GATE_COOKIE, gateToken } from "@/lib/site-gate";

// When SITE_PASSWORD is set (the online test version), every page asks for it first.
// The daily rules endpoint has its own secret, so the scheduler can still reach it.
export function proxy(request: NextRequest) {
  const password = process.env.SITE_PASSWORD;
  if (!password) return NextResponse.next();
  const { pathname, search } = request.nextUrl;
  if (pathname === "/gate" || pathname.startsWith("/api/cron/")) return NextResponse.next();
  if (request.cookies.get(GATE_COOKIE)?.value === gateToken(password)) return NextResponse.next();
  const url = new URL("/gate", request.url);
  url.searchParams.set("next", pathname + search);
  return NextResponse.redirect(url);
}

export const config = {
  // Everything except Next's own files and the images in public/.
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:png|webp|svg|ico)$).*)"],
};
