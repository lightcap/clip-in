import { NextResponse } from "next/server";
import { createUntypedClient } from "@/lib/supabase/admin";
import { PelotonClient } from "@/lib/peloton/client";
import { encryptToken, decryptToken, DecryptionError, EncryptionError } from "@/lib/crypto";

// Auth0 token endpoint for Peloton
const AUTH0_TOKEN_URL = "https://auth.onepeloton.com/oauth/token";
// Client ID from Peloton's web app (public)
const PELOTON_CLIENT_ID = "WVoJxVDdPoFx4RNewvvg6ch2mZ7bwnsM";

export async function POST() {
  try {
    const supabase = await createUntypedClient();

    // Get current user
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Get stored tokens
    const { data: tokenData, error: tokenFetchError } = await supabase
      .from("peloton_tokens")
      .select("refresh_token_encrypted")
      .eq("user_id", user.id)
      .single();

    if (tokenFetchError || !tokenData?.refresh_token_encrypted) {
      return NextResponse.json(
        { error: "No refresh token available", needsReconnect: true },
        { status: 400 }
      );
    }

    // Decrypt the stored refresh token before sending to Auth0
    const plainRefreshToken = decryptToken(tokenData.refresh_token_encrypted);

    // Call Auth0 to refresh the token
    const refreshResponse = await fetch(AUTH0_TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        grant_type: "refresh_token",
        client_id: PELOTON_CLIENT_ID,
        refresh_token: plainRefreshToken,
      }),
    });

    if (!refreshResponse.ok) {
      const errorData = await refreshResponse.json().catch(() => ({}));
      console.error("Token refresh failed:", errorData);
      return NextResponse.json(
        { error: "Token refresh failed", needsReconnect: true },
        { status: 401 }
      );
    }

    const tokens = await refreshResponse.json();
    const newAccessToken = tokens.access_token;
    const newRefreshToken = tokens.refresh_token; // Auth0 may rotate refresh tokens

    if (!newAccessToken) {
      return NextResponse.json(
        { error: "No access token in refresh response", needsReconnect: true },
        { status: 500 }
      );
    }

    // Validate the new token works
    const pelotonClient = new PelotonClient(newAccessToken);
    try {
      await pelotonClient.getMe();
    } catch {
      return NextResponse.json(
        { error: "Refreshed token is invalid", needsReconnect: true },
        { status: 401 }
      );
    }

    // Calculate new expiry (tokens.expires_in is in seconds)
    const expiresAt = new Date(Date.now() + (tokens.expires_in || 48 * 60 * 60) * 1000);

    // Update stored tokens (encrypt before storing)
    const { error: updateError } = await supabase
      .from("peloton_tokens")
      .update({
        access_token_encrypted: encryptToken(newAccessToken),
        refresh_token_encrypted: encryptToken(newRefreshToken || plainRefreshToken),
        expires_at: expiresAt.toISOString(),
      })
      .eq("user_id", user.id);

    if (updateError) {
      console.error("Failed to update tokens:", updateError);
      return NextResponse.json(
        { error: "Failed to store refreshed tokens" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      expiresAt: expiresAt.toISOString(),
    });
  } catch (error) {
    if (error instanceof DecryptionError) {
      return NextResponse.json(
        { error: error.message, needsReconnect: true },
        { status: 401 }
      );
    }
    if (error instanceof EncryptionError) {
      console.error("CRITICAL: Token encryption failed - check PELOTON_TOKEN_ENCRYPTION_KEY:", error);
      return NextResponse.json(
        { error: "Server configuration error. Please contact support." },
        { status: 500 }
      );
    }
    console.error("Token refresh error:", error);
    return NextResponse.json(
      { error: "Failed to refresh token" },
      { status: 500 }
    );
  }
}
