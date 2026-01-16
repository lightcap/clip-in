import { NextResponse } from "next/server";
import { createUntypedClient } from "@/lib/supabase/admin";
import { PelotonClient, PelotonAuthError } from "@/lib/peloton/client";

export async function POST(request: Request) {
  try {
    const { accessToken, refreshToken } = await request.json();

    if (!accessToken) {
      return NextResponse.json(
        { error: "Access token is required" },
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

    // Validate the token by fetching user info from Peloton
    const pelotonClient = new PelotonClient(accessToken);
    let pelotonUser;

    try {
      pelotonUser = await pelotonClient.getMe();
    } catch (error) {
      if (error instanceof PelotonAuthError) {
        return NextResponse.json(
          { error: "Invalid or expired Peloton token" },
          { status: 401 }
        );
      }
      throw error;
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
        { error: `Failed to update profile: ${updateError.message}` },
        { status: 500 }
      );
    }

    // Store encrypted tokens
    // For MVP, we store the token directly (in production, use proper encryption)
    const expiresAt = new Date(Date.now() + 48 * 60 * 60 * 1000); // 48 hours

    const { error: tokenError } = await supabase.from("peloton_tokens").upsert({
      user_id: user.id,
      access_token_encrypted: accessToken, // TODO: Encrypt in production
      refresh_token_encrypted: refreshToken || "", // Store refresh token for auto-refresh
      expires_at: expiresAt.toISOString(),
    }, {
      onConflict: "user_id",
    });

    if (tokenError) {
      console.error("Failed to store Peloton tokens:", tokenError);
      return NextResponse.json(
        { error: `Failed to store tokens: ${tokenError.message}` },
        { status: 500 }
      );
    }

    // Sync FTP history if available
    if (pelotonUser.cycling_ftp_workout_id) {
      try {
        const ftpHistory = await pelotonClient.getFtpHistory(
          pelotonUser.cycling_ftp_workout_id
        );

        // Store FTP records
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
        // Log but don't fail the connection if FTP sync fails
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
    console.error("Peloton connect error:", error);
    return NextResponse.json(
      { error: "Failed to connect Peloton account" },
      { status: 500 }
    );
  }
}
