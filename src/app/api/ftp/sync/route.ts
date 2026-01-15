import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { PelotonClient } from "@/lib/peloton/client";

export async function POST() {
  try {
    const supabase = await createAdminClient();

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Get user's Peloton token
    const { data: tokenData } = await supabase
      .from("peloton_tokens")
      .select("access_token_encrypted")
      .eq("user_id", user.id)
      .single();

    if (!tokenData?.access_token_encrypted) {
      return NextResponse.json(
        { error: "Peloton not connected" },
        { status: 400 }
      );
    }

    // Get user's profile for FTP workout ID
    const { data: profile } = await supabase
      .from("profiles")
      .select("peloton_user_id")
      .eq("id", user.id)
      .single();

    if (!profile?.peloton_user_id) {
      return NextResponse.json(
        { error: "Peloton profile not found" },
        { status: 400 }
      );
    }

    // Fetch FTP history from Peloton
    const pelotonClient = new PelotonClient(tokenData.access_token_encrypted);

    try {
      const pelotonUser = await pelotonClient.getMe();

      // Update profile with latest FTP data
      await supabase
        .from("profiles")
        .update({
          current_ftp: pelotonUser.cycling_ftp || null,
          estimated_ftp: pelotonUser.estimated_cycling_ftp || null,
        })
        .eq("id", user.id);

      // Sync FTP history if workout ID exists
      if (pelotonUser.cycling_ftp_workout_id) {
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
          await supabase.from("ftp_records").upsert(ftpRecords, {
            onConflict: "user_id,workout_id",
          });
        }

        return NextResponse.json({
          success: true,
          syncedRecords: ftpRecords.length,
          currentFtp: pelotonUser.cycling_ftp,
        });
      }

      return NextResponse.json({
        success: true,
        syncedRecords: 0,
        message: "No FTP test history found",
      });
    } catch (error) {
      console.error("Peloton API error:", error);
      return NextResponse.json(
        { error: "Failed to fetch from Peloton. Token may be expired." },
        { status: 401 }
      );
    }
  } catch (error) {
    console.error("FTP sync error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
