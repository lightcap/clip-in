import { NextResponse } from "next/server";
import { createUntypedClient } from "@/lib/supabase/admin";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { date, workoutIds } = body;

    if (!date || !Array.isArray(workoutIds)) {
      return NextResponse.json(
        { error: "Missing required fields: date and workoutIds" },
        { status: 400 }
      );
    }

    const supabase = await createUntypedClient();

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Update sort_order for each workout
    const updates = workoutIds.map((id: string, index: number) =>
      supabase
        .from("planned_workouts")
        .update({ sort_order: index })
        .eq("id", id)
        .eq("user_id", user.id)
    );

    await Promise.all(updates);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Reorder workouts error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
