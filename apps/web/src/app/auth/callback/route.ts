import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const INTERNAL_API_URL = process.env.INTERNAL_API_URL ?? "http://localhost:4000";
const PUBLIC_URL = process.env.PUBLIC_URL;
const SESSION_COOKIE_NAME = "optio_session";
const IS_PRODUCTION = process.env.NODE_ENV === "production";

/**
 * OAuth callback handler for the BFF (Backend for Frontend) pattern.
 *
 * After the API's OAuth callback generates a short-lived auth code,
 * it redirects the browser here. This server-side route handler:
 * 1. Exchanges the code for a session token (server-to-server)
 * 2. Sets the token as an HttpOnly cookie on the web app's origin
 * 3. Redirects the user to the app
 *
 * The session token never touches client-side JS.
 */
function appUrl(path: string, request: NextRequest): URL {
  const base = PUBLIC_URL ?? request.url;
  return new URL(path, base);
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get("code");

  if (!code) {
    return NextResponse.redirect(appUrl("/login?error=missing_code", request));
  }

  try {
    const res = await fetch(`${INTERNAL_API_URL}/api/auth/exchange-code`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code }),
    });

    if (!res.ok) {
      return NextResponse.redirect(appUrl("/login?error=exchange_failed", request));
    }

    const { token } = (await res.json()) as { token: string };

    const response = NextResponse.redirect(appUrl("/", request));
    response.cookies.set(SESSION_COOKIE_NAME, token, {
      path: "/",
      httpOnly: true,
      sameSite: "lax",
      secure: IS_PRODUCTION,
      maxAge: 30 * 24 * 60 * 60, // 30 days
    });

    return response;
  } catch {
    return NextResponse.redirect(appUrl("/login?error=exchange_failed", request));
  }
}
