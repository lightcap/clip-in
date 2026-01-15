import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET() {
  try {
    const supabase = await createClient();

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { data: records, error } = await supabase
      .from("ftp_records")
      .select("*")
      .eq("user_id", user.id)
      .order("workout_date", { ascending: false });

    if (error) {
      console.error("Failed to fetch FTP records:", error);
      return NextResponse.json(
        { error: "Failed to fetch FTP records" },
        { status: 500 }
      );
    }

    return NextResponse.json({ records });
  } catch (error) {
    console.error("FTP history error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
