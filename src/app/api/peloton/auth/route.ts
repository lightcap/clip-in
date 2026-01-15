import { NextResponse } from "next/server";
import { createUntypedClient } from "@/lib/supabase/admin";
import { PelotonClient } from "@/lib/peloton/client";

const AUTH0_DOMAIN = process.env.NEXT_PUBLIC_PELOTON_AUTH0_DOMAIN || "auth.onepeloton.com";
const AUTH0_CLIENT_ID = process.env.NEXT_PUBLIC_PELOTON_AUTH0_CLIENT_ID || "WVoJxVDdPoFx4RNewvvg6ch2mZ7bwnsM";
const AUTH0_AUDIENCE = "https://api.onepeloton.com/";

export async function POST(request: Request) {
  try {
    const { email, password } = await request.json();

    if (!email || !password) {
      return NextResponse.json(
        { error: "Email and password are required" },
        { status: 400 }
      );
    }

    const supabase = await createUntypedClient();

    // Get current user
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Try Auth0 Resource Owner Password Grant
    const tokenResponse = await fetch(`https://${AUTH0_DOMAIN}/oauth/token`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        grant_type: "password",
        username: email,
        password: password,
        client_id: AUTH0_CLIENT_ID,
        audience: AUTH0_AUDIENCE,
        scope: "openid offline_access",
      }),
    });

    const tokenData = await tokenResponse.json();

    if (!tokenResponse.ok) {
      console.error("Auth0 error:", tokenData);

      // Handle specific Auth0 errors
      if (tokenData.error === "invalid_grant") {
        return NextResponse.json(
          { error: "Invalid email or password" },
          { status: 401 }
        );
      }
      if (tokenData.error === "unauthorized_client") {
        return NextResponse.json(
          { error: "Authentication method not supported" },
          { status: 400 }
        );
      }

      return NextResponse.json(
        { error: tokenData.error_description || "Authentication failed" },
        { status: tokenResponse.status }
      );
    }

    const accessToken = tokenData.access_token;
    const refreshToken = tokenData.refresh_token;
    const expiresIn = tokenData.expires_in || 172800; // Default 48 hours

    // Validate the token by fetching user info from Peloton
    const pelotonClient = new PelotonClient(accessToken);
    let pelotonUser;

    try {
      pelotonUser = await pelotonClient.getMe();
    } catch (error) {
      console.error("Failed to fetch Peloton user:", error);
      return NextResponse.json(
        { error: "Failed to verify Peloton account" },
        { status: 401 }
      );
    }

    // Update user profile with Peloton info
    const { data: profile, error: updateError } = await supabase
      .from("profiles")
      .update({
        peloton_user_id: pelotonUser.id,
        peloton_username: pelotonUser.username,
        display_name: pelotonUser.name || pelotonUser.username,
        avatar_url: pelotonUser.image_url,
        current_ftp: pelotonUser.cycling_ftp || null,
        estimated_ftp: pelotonUser.estimated_cycling_ftp || null,
      })
      .eq("id", user.id)
      .select()
      .single();

    if (updateError) {
      console.error("Failed to update profile:", updateError);
      return NextResponse.json(
        { error: "Failed to save Peloton connection" },
        { status: 500 }
      );
    }

    // Store tokens
    const expiresAt = new Date(Date.now() + expiresIn * 1000);

    const { error: tokenError } = await supabase.from("peloton_tokens").upsert({
      user_id: user.id,
      access_token_encrypted: accessToken,
      refresh_token_encrypted: refreshToken || "",
      expires_at: expiresAt.toISOString(),
    });

    if (tokenError) {
      console.error("Failed to store Peloton tokens:", tokenError);
      return NextResponse.json(
        { error: "Failed to save Peloton connection" },
        { status: 500 }
      );
    }

    // Sync FTP history if available
    if (pelotonUser.cycling_ftp_workout_id) {
      try {
        const ftpHistory = await pelotonClient.getFtpHistory(
          pelotonUser.cycling_ftp_workout_id
        );

        const ftpRecords = ftpHistory
          .filter((record) => record.calculatedFtp !== null)
          .map((record) => ({
            user_id: user.id,
            workout_id: record.workoutId,
            workout_date: record.date.toISOString(),
            ride_title: record.rideTitle,
            avg_output: record.avgOutput!,
            calculated_ftp: record.calculatedFtp!,
            baseline_ftp: record.baselineFtp,
          }));

        if (ftpRecords.length > 0) {
          const { error: ftpError } = await supabase.from("ftp_records").upsert(ftpRecords, {
            onConflict: "user_id,workout_id",
          });
          if (ftpError) {
            console.error("Failed to store FTP records:", ftpError);
          }
        }
      } catch (error) {
        console.error("Failed to sync FTP history:", error);
      }
    }

    return NextResponse.json({
      success: true,
      profile,
      pelotonUser: {
        id: pelotonUser.id,
        username: pelotonUser.username,
        name: pelotonUser.name,
      },
    });
  } catch (error) {
    console.error("Peloton auth error:", error);
    return NextResponse.json(
      { error: "Failed to connect Peloton account" },
      { status: 500 }
    );
  }
}
