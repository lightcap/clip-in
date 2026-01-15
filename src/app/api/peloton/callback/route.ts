import { NextResponse } from "next/server";

// This endpoint receives the token from the bookmarklet
// and redirects to the settings page with the token
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const token = searchParams.get("token");

  if (!token) {
    return NextResponse.redirect(new URL("/settings?error=no_token", request.url));
  }

  // Redirect to settings with token in hash (not visible to server logs)
  return NextResponse.redirect(new URL(`/settings#peloton_token=${encodeURIComponent(token)}`, request.url));
}
