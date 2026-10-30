import { NextResponse, type NextRequest } from "next/server";
export function proxy(request: NextRequest) {
  const path = request.nextUrl.pathname,
    hasSession = !!request.cookies.get("workly_session")?.value;
  if (path.startsWith("/api/auth/")) return NextResponse.next();
  if (path.startsWith("/api/")) {
    if (!hasSession)
      return NextResponse.json({ error: "กรุณาเข้าสู่ระบบ" }, { status: 401 });
    const response = NextResponse.next();
    response.headers.set("Cache-Control", "private, no-store");
    return response;
  }
  if (!hasSession) {
    const url = new URL("/login", request.url);
    url.searchParams.set("next", path);
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}
export const config = {
  matcher: [
    "/",
    "/tasks/:path*",
    "/my-work/:path*",
    "/reports/:path*",
    "/archive/:path*",
    "/admin/:path*",
    "/settings/:path*",
    "/api/:path*",
  ],
};
