import { NextResponse } from "next/server";

// This endpoint receives the token from the browser extension
// and redirects to the settings page with the tokens
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const token = searchParams.get("token");
  const refreshToken = searchParams.get("refresh_token");

  if (!token) {
    return NextResponse.redirect(new URL("/settings?error=no_token", request.url));
  }

  // Redirect to settings with tokens in hash (not visible to server logs)
  // Use base64 to safely encode tokens and avoid URL parsing issues
  const tokenData = JSON.stringify({ token, refreshToken: refreshToken || null });
  const hash = `peloton_data=${encodeURIComponent(btoa(tokenData))}`;
  return NextResponse.redirect(new URL(`/settings#${hash}`, request.url));
}
