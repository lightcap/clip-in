import { NextResponse } from "next/server";
import { createUntypedClient } from "@/lib/supabase/admin";
import { PelotonClient, PelotonAuthError } from "@/lib/peloton/client";
import { refreshPelotonToken } from "@/lib/peloton/refresh";

export async function GET() {
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

    // Check if user has Peloton connected
    const { data: profile } = await supabase
      .from("profiles")
      .select("peloton_user_id, peloton_username")
      .eq("id", user.id)
      .single();

    if (!profile?.peloton_user_id) {
      return NextResponse.json({
        connected: false,
        tokenValid: false,
        message: "Peloton not connected",
      });
    }

    // Get stored token
    const { data: tokenData } = await supabase
      .from("peloton_tokens")
      .select("access_token_encrypted, refresh_token_encrypted, expires_at")
      .eq("user_id", user.id)
      .single();

    if (!tokenData?.access_token_encrypted) {
      return NextResponse.json({
        connected: true,
        tokenValid: false,
        message: "No token stored",
      });
    }

    // Check if token is expired based on our stored expiry
    const expiresAt = new Date(tokenData.expires_at);
    const isStoredExpired = expiresAt < new Date();

    // Helper to attempt token refresh
    const tryRefresh = async () => {
      if (!tokenData.refresh_token_encrypted) {
        return null;
      }
      console.log("[Status] Attempting token refresh...");
      const refreshResult = await refreshPelotonToken(user.id, tokenData.refresh_token_encrypted);
      if (refreshResult.success) {
        console.log("[Status] Token refreshed successfully");
        return refreshResult;
      }
      console.log("[Status] Token refresh failed:", refreshResult.error);
      return null;
    };

    // If expired, try to refresh first
    if (isStoredExpired) {
      const refreshResult = await tryRefresh();
      if (refreshResult?.success) {
        return NextResponse.json({
          connected: true,
          tokenValid: true,
          pelotonUsername: profile.peloton_username,
          expiresAt: refreshResult.expiresAt,
          refreshed: true,
        });
      }
      return NextResponse.json({
        connected: true,
        tokenValid: false,
        message: "Token expired",
        expiresAt: tokenData.expires_at,
      });
    }

    // Validate token by making a lightweight API call
    const pelotonClient = new PelotonClient(tokenData.access_token_encrypted);

    try {
      const pelotonUser = await pelotonClient.getMe();
      return NextResponse.json({
        connected: true,
        tokenValid: true,
        pelotonUsername: pelotonUser.username,
        expiresAt: tokenData.expires_at,
      });
    } catch (error) {
      if (error instanceof PelotonAuthError) {
        // Token was rejected - try to refresh
        const refreshResult = await tryRefresh();
        if (refreshResult?.success) {
          return NextResponse.json({
            connected: true,
            tokenValid: true,
            pelotonUsername: profile.peloton_username,
            expiresAt: refreshResult.expiresAt,
            refreshed: true,
          });
        }
        return NextResponse.json({
          connected: true,
          tokenValid: false,
          message: "Token rejected by Peloton",
        });
      }
      throw error;
    }
  } catch (error) {
    console.error("Peloton status check error:", error);
    return NextResponse.json(
      { error: "Failed to check Peloton status" },
      { status: 500 }
    );
  }
}
