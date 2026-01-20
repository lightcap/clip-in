import { NextResponse } from "next/server";
import { createUntypedClient } from "@/lib/supabase/admin";
import { PelotonClient, PelotonAuthError } from "@/lib/peloton/client";
import { syncCompletedWorkouts } from "@/lib/peloton/completion-sync";
import { refreshPelotonToken } from "@/lib/peloton/refresh";
import { decryptToken, DecryptionError } from "@/lib/crypto";

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const { timezone: browserTimezone } = body;

    const supabase = await createUntypedClient();

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Get user's profile for Peloton user ID and timezone preference
    // Note: timezone column will be added by #96. Until then, it will be undefined.
    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("peloton_user_id, timezone")
      .eq("id", user.id)
      .single();

    if (profileError || !profile?.peloton_user_id) {
      return NextResponse.json(
        { error: "Peloton profile not found" },
        { status: 400 }
      );
    }

    // Timezone resolution priority:
    // 1. User's stored timezone preference (from profile, added by #96)
    // 2. Browser-detected timezone (sent in request)
    // 3. UTC fallback
    const timezone = profile.timezone || browserTimezone || "UTC";

    // Get user's Peloton tokens
    const { data: tokens, error: tokensError } = await supabase
      .from("peloton_tokens")
      .select("*")
      .eq("user_id", user.id)
      .single();

    if (tokensError || !tokens) {
      return NextResponse.json(
        { error: "Peloton not connected" },
        { status: 400 }
      );
    }

    // Helper to attempt token refresh
    const tryRefresh = async () => {
      if (!tokens.refresh_token_encrypted) {
        return null;
      }
      const refreshResult = await refreshPelotonToken(
        user.id,
        decryptToken(tokens.refresh_token_encrypted)
      );
      if (refreshResult.success) {
        return refreshResult;
      }
      return null;
    };

    // Check if token is expired and try to refresh
    const isExpired = new Date(tokens.expires_at) < new Date();
    let accessToken = tokens.access_token_encrypted;

    if (isExpired) {
      const refreshResult = await tryRefresh();
      if (!refreshResult?.success) {
        return NextResponse.json(
          { error: "Peloton token expired. Please reconnect." },
          { status: 401 }
        );
      }
      // Use the refreshed token - need to fetch updated token from DB
      const { data: refreshedTokens } = await supabase
        .from("peloton_tokens")
        .select("access_token_encrypted")
        .eq("user_id", user.id)
        .single();
      if (refreshedTokens) {
        accessToken = refreshedTokens.access_token_encrypted;
      }
    }

    const peloton = new PelotonClient(decryptToken(accessToken));

    // Sync completed workouts
    const result = await syncCompletedWorkouts(
      user.id,
      profile.peloton_user_id,
      peloton,
      supabase,
      { timezone }
    );

    if (!result.success) {
      return NextResponse.json(
        { error: result.error || "Sync failed", matched: result.matched },
        { status: 500 }
      );
    }

    return NextResponse.json({
      message: result.matched > 0
        ? `Detected ${result.matched} completed workout(s)`
        : "No new completions detected",
      matched: result.matched,
    });
  } catch (error) {
    console.error("Completion sync error:", error);

    if (error instanceof DecryptionError) {
      return NextResponse.json(
        { error: error.message },
        { status: 401 }
      );
    }

    if (error instanceof PelotonAuthError) {
      return NextResponse.json(
        { error: "Peloton authentication failed. Please reconnect." },
        { status: 401 }
      );
    }

    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
