import { NextResponse, type NextRequest } from "next/server";
import { updateSession } from "@/utils/supabase/middleware";

/**
 * Access control for the estimating tool (the API side is api/security.py):
 *  - ESTIMATOR_ACCESS_PASSWORD: people sign in once with the browser's password
 *    prompt (any user name, this password);
 *  - API_ACCESS_TOKEN: server-to-server callers (the Better View CRM) send it as
 *    a Bearer token instead. app/api/[...path]/route.ts forwards /api requests
 *    to the backend and adds the token there, so browsers never hold it.
 * Without ESTIMATOR_ACCESS_PASSWORD the website is not gated (currently the
 * case in production by choice); setting it turns the sign-in prompt on.
 */
function safeEqual(left: string, right: string) {
  if (left.length !== right.length) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) difference |= left.charCodeAt(index) ^ right.charCodeAt(index);
  return difference === 0;
}

function hasAccess(request: NextRequest) {
  const [scheme = "", value = ""] = (request.headers.get("authorization") ?? "").split(" ");
  const token = process.env.API_ACCESS_TOKEN?.trim();
  if (token && scheme.toLowerCase() === "bearer" && safeEqual(value.trim(), token)) return true;
  const password = process.env.ESTIMATOR_ACCESS_PASSWORD;
  if (!password) return true;
  if (scheme.toLowerCase() !== "basic") return false;
  try {
    const decoded = atob(value.trim());
    return safeEqual(decoded.slice(decoded.indexOf(":") + 1), password);
  } catch {
    return false;
  }
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (pathname === "/health") return NextResponse.next();
  if (!hasAccess(request)) {
    return new NextResponse("Sign in to the Better View estimating tool.", {
      status: 401,
      headers: { "WWW-Authenticate": 'Basic realm="Better View estimating", charset="UTF-8"', "Cache-Control": "no-store" },
    });
  }
  if (pathname.startsWith("/api/")) return NextResponse.next();
  return updateSession(request);
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|css|js|map)$).*)",
  ],
};
