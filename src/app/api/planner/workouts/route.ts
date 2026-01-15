import { NextResponse } from "next/server";
import { createUntypedClient } from "@/lib/supabase/admin";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const start = searchParams.get("start");
    const end = searchParams.get("end");

    const supabase = await createUntypedClient();

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    let query = supabase
      .from("planned_workouts")
      .select("*")
      .eq("user_id", user.id)
      .order("scheduled_date", { ascending: true });

    if (start) {
      query = query.gte("scheduled_date", start);
    }
    if (end) {
      query = query.lte("scheduled_date", end);
    }

    const { data: workouts, error } = await query;

    if (error) {
      console.error("Failed to fetch workouts:", error);
      return NextResponse.json(
        { error: "Failed to fetch workouts" },
        { status: 500 }
      );
    }

    return NextResponse.json({ workouts });
  } catch (error) {
    console.error("Planner workouts error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const supabase = await createUntypedClient();

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { data: workout, error } = await supabase
      .from("planned_workouts")
      .insert({
        user_id: user.id,
        peloton_ride_id: body.peloton_ride_id,
        ride_title: body.ride_title,
        ride_image_url: body.ride_image_url,
        instructor_name: body.instructor_name,
        duration_seconds: body.duration_seconds,
        discipline: body.discipline,
        scheduled_date: body.scheduled_date,
        scheduled_time: body.scheduled_time,
        status: "planned",
      })
      .select()
      .single();

    if (error) {
      console.error("Failed to create workout:", error);
      return NextResponse.json(
        { error: "Failed to create workout" },
        { status: 500 }
      );
    }

    return NextResponse.json({ workout });
  } catch (error) {
    console.error("Create workout error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
