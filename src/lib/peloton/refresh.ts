import { createUntypedClient } from "@/lib/supabase/admin";
import { PelotonClient } from "./client";
import { encryptToken, EncryptionError } from "@/lib/crypto";

// Auth0 token endpoint for Peloton
const AUTH0_TOKEN_URL = "https://auth.onepeloton.com/oauth/token";
// Client ID from Peloton's web app (public)
const PELOTON_CLIENT_ID = "WVoJxVDdPoFx4RNewvvg6ch2mZ7bwnsM";

export interface RefreshResult {
  success: boolean;
  error?: string;
  expiresAt?: string;
  needsReconnect?: boolean;
}

/**
 * Refreshes a Peloton access token using the refresh token.
 * Updates the stored tokens in the database if successful.
 *
 * @param userId - The user ID to update tokens for
 * @param refreshToken - The plaintext (decrypted) refresh token
 */
export async function refreshPelotonToken(
  userId: string,
  refreshToken: string
): Promise<RefreshResult> {
  try {
    // Call Auth0 to refresh the token
    const refreshResponse = await fetch(AUTH0_TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        grant_type: "refresh_token",
        client_id: PELOTON_CLIENT_ID,
        refresh_token: refreshToken,
      }),
    });

    if (!refreshResponse.ok) {
      const errorData = await refreshResponse.json().catch(() => ({}));
      console.error("[Refresh] Token refresh failed:", errorData);
      return {
        success: false,
        error: "Token refresh failed",
        needsReconnect: true,
      };
    }

    const tokens = await refreshResponse.json();
    const newAccessToken = tokens.access_token;
    const newRefreshToken = tokens.refresh_token; // Auth0 may rotate refresh tokens

    if (!newAccessToken) {
      return {
        success: false,
        error: "No access token in refresh response",
        needsReconnect: true,
      };
    }

    // Validate the new token works
    const pelotonClient = new PelotonClient(newAccessToken);
    try {
      await pelotonClient.getMe();
    } catch {
      return {
        success: false,
        error: "Refreshed token is invalid",
        needsReconnect: true,
      };
    }

    // Calculate new expiry (tokens.expires_in is in seconds)
    const expiresAt = new Date(
      Date.now() + (tokens.expires_in || 48 * 60 * 60) * 1000
    );

    // Update stored tokens (encrypt before storing)
    const supabase = await createUntypedClient();
    const { error: updateError } = await supabase
      .from("peloton_tokens")
      .update({
        access_token_encrypted: encryptToken(newAccessToken),
        refresh_token_encrypted: encryptToken(newRefreshToken || refreshToken),
        expires_at: expiresAt.toISOString(),
      })
      .eq("user_id", userId);

    if (updateError) {
      console.error("[Refresh] Failed to update tokens:", updateError);
      return {
        success: false,
        error: "Failed to store refreshed tokens",
      };
    }

    return {
      success: true,
      expiresAt: expiresAt.toISOString(),
    };
  } catch (error) {
    if (error instanceof EncryptionError) {
      console.error("[Refresh] CRITICAL: Token encryption failed - check PELOTON_TOKEN_ENCRYPTION_KEY:", error);
      return {
        success: false,
        error: "Server configuration error. Please contact support.",
      };
    }
    console.error("[Refresh] Token refresh error:", error);
    return {
      success: false,
      error: "Failed to refresh token",
    };
  }
}
