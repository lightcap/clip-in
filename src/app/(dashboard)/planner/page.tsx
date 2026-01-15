"use client";

import { useEffect, useState, useCallback } from "react";
import {
  ChevronLeft,
  ChevronRight,
  Plus,
  Clock,
  User,
  Trash2,
  GripVertical,
  CalendarCheck,
  AlertCircle,
  Loader2,
  CheckCircle2,
} from "lucide-react";
import {
  format,
  startOfWeek,
  endOfWeek,
  eachDayOfInterval,
  addWeeks,
  subWeeks,
  isSameDay,
  isToday,
  isPast,
} from "date-fns";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { useAuthStore } from "@/lib/stores/auth-store";
import { cn } from "@/lib/utils";

interface PlannedWorkout {
  id: string;
  peloton_ride_id: string;
  ride_title: string;
  ride_image_url: string | null;
  instructor_name: string | null;
  duration_seconds: number;
  discipline: string;
  scheduled_date: string;
  scheduled_time: string | null;
  status: "planned" | "completed" | "skipped" | "postponed";
  pushed_to_stack: boolean;
}

const DISCIPLINES: Record<string, { label: string; color: string }> = {
  cycling: { label: "Cycling", color: "bg-blue-500" },
  strength: { label: "Strength", color: "bg-orange-500" },
  running: { label: "Running", color: "bg-green-500" },
  yoga: { label: "Yoga", color: "bg-purple-500" },
  meditation: { label: "Meditation", color: "bg-indigo-500" },
  stretching: { label: "Stretching", color: "bg-teal-500" },
  cardio: { label: "Cardio", color: "bg-red-500" },
};

export default function PlannerPage() {
  const { isPelotonConnected, pelotonTokenStatus } = useAuthStore();
  const [currentWeek, setCurrentWeek] = useState(new Date());
  const [workouts, setWorkouts] = useState<PlannedWorkout[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isPushing, setIsPushing] = useState(false);
  const [pushResult, setPushResult] = useState<{ success: boolean; message: string } | null>(null);

  const weekStart = startOfWeek(currentWeek, { weekStartsOn: 0 });
  const weekEnd = endOfWeek(currentWeek, { weekStartsOn: 0 });
  const weekDays = eachDayOfInterval({ start: weekStart, end: weekEnd });

  const fetchWorkouts = useCallback(async () => {
    if (!isPelotonConnected) {
      setIsLoading(false);
      return;
    }

    try {
      const response = await fetch(
        `/api/planner/workouts?start=${format(weekStart, "yyyy-MM-dd")}&end=${format(weekEnd, "yyyy-MM-dd")}`
      );
      if (response.ok) {
        const data = await response.json();
        setWorkouts(data.workouts || []);
      }
    } catch (error) {
      console.error("Failed to fetch workouts:", error);
    } finally {
      setIsLoading(false);
    }
  }, [isPelotonConnected, weekStart, weekEnd]);

  useEffect(() => {
    fetchWorkouts();
  }, [fetchWorkouts]);

  const getWorkoutsForDay = (date: Date) =>
    workouts.filter((w) => isSameDay(new Date(w.scheduled_date), date));

  const handleDeleteWorkout = async (workoutId: string) => {
    try {
      const response = await fetch(`/api/planner/workouts/${workoutId}`, {
        method: "DELETE",
      });
      if (response.ok) {
        setWorkouts((prev) => prev.filter((w) => w.id !== workoutId));
      }
    } catch (error) {
      console.error("Failed to delete workout:", error);
    }
  };

  const handleStatusChange = async (
    workoutId: string,
    status: PlannedWorkout["status"]
  ) => {
    try {
      const response = await fetch(`/api/planner/workouts/${workoutId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      if (response.ok) {
        setWorkouts((prev) =>
          prev.map((w) => (w.id === workoutId ? { ...w, status } : w))
        );
      }
    } catch (error) {
      console.error("Failed to update workout:", error);
    }
  };

  const handlePushToStack = async () => {
    setIsPushing(true);
    setPushResult(null);

    try {
      // Push tomorrow's workouts to stack
      const tomorrow = format(new Date(), "yyyy-MM-dd");
      const response = await fetch("/api/stack/push", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          date: tomorrow,
          clearExisting: false,
        }),
      });

      const data = await response.json();

      if (response.ok) {
        setPushResult({
          success: true,
          message: data.message || `Pushed ${data.pushed} workout(s) to stack`,
        });
        // Refresh workouts to update pushed_to_stack status
        fetchWorkouts();
      } else {
        setPushResult({
          success: false,
          message: data.error || "Failed to push workouts",
        });
      }
    } catch (error) {
      console.error("Failed to push to stack:", error);
      setPushResult({
        success: false,
        message: "An error occurred while pushing to stack",
      });
    } finally {
      setIsPushing(false);
      // Clear the result after 5 seconds
      setTimeout(() => setPushResult(null), 5000);
    }
  };

  // Calculate weekly stats
  const weeklyStats = {
    planned: workouts.filter((w) => w.status === "planned").length,
    completed: workouts.filter((w) => w.status === "completed").length,
    totalMinutes: workouts.reduce((acc, w) => acc + w.duration_seconds / 60, 0),
  };

  const isExpired = pelotonTokenStatus === "expired";

  // Never connected - show full-page connect prompt
  if (!isPelotonConnected) {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center">
        <div className="relative mb-8">
          <div className="absolute -inset-8 rounded-full bg-primary/20 blur-3xl" />
          <div className="relative flex h-24 w-24 items-center justify-center rounded-2xl bg-primary/10">
            <CalendarCheck className="h-12 w-12 text-primary" />
          </div>
        </div>
        <h2 className="font-display text-3xl tracking-wide text-foreground mb-3">
          CONNECT PELOTON TO PLAN WORKOUTS
        </h2>
        <p className="text-muted-foreground text-center max-w-md">
          Link your Peloton account to start planning your weekly workouts and automate your stack.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-4xl tracking-wide text-foreground">
            WEEKLY PLANNER
          </h1>
          <p className="text-muted-foreground mt-1">
            Plan your workouts and automate your Peloton stack
          </p>
        </div>
        <Dialog>
          <DialogTrigger asChild>
            <Button className="gap-2">
              <Plus className="h-4 w-4" />
              Add Workout
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Add Workout to Plan</DialogTitle>
              <DialogDescription>
                Search for a class or browse categories to add to your weekly plan.
              </DialogDescription>
            </DialogHeader>
            <div className="py-4">
              <p className="text-sm text-muted-foreground text-center">
                Use the Class Search to find and add workouts to your plan.
              </p>
              <Button variant="outline" className="w-full mt-4" asChild>
                <a href="/search">Go to Class Search</a>
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {/* Reconnect Banner */}
      {isExpired && (
        <Card className="border-amber-500/30 bg-amber-500/5">
          <CardContent className="flex items-center gap-4 py-4">
            <AlertCircle className="h-5 w-5 text-amber-500 shrink-0" />
            <div className="flex-1">
              <p className="font-medium text-amber-500">Session Expired</p>
              <p className="text-sm text-muted-foreground">
                Your Peloton session has expired. Reconnect to sync workouts and push to your stack.
              </p>
            </div>
            <Button
              variant="outline"
              className="border-amber-500/50 text-amber-500 hover:bg-amber-500/10"
              onClick={() => window.open("https://members.onepeloton.com", "_blank")}
            >
              Reconnect
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Week Navigation */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button
            variant="outline"
            size="icon"
            onClick={() => setCurrentWeek(subWeeks(currentWeek, 1))}
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <div className="text-center">
            <h2 className="font-display text-2xl tracking-wide">
              {format(weekStart, "MMM d")} - {format(weekEnd, "MMM d, yyyy")}
            </h2>
          </div>
          <Button
            variant="outline"
            size="icon"
            onClick={() => setCurrentWeek(addWeeks(currentWeek, 1))}
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
        <Button
          variant="ghost"
          onClick={() => setCurrentWeek(new Date())}
          className="text-sm"
        >
          Today
        </Button>
      </div>

      {/* Weekly Stats */}
      <div className="grid grid-cols-3 gap-4">
        <Card className="bg-secondary/30">
          <CardContent className="pt-6">
            <div className="text-center">
              <p className="text-3xl font-display">{weeklyStats.planned + weeklyStats.completed}</p>
              <p className="text-sm text-muted-foreground">Total Workouts</p>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-secondary/30">
          <CardContent className="pt-6">
            <div className="text-center">
              <p className="text-3xl font-display text-green-500">{weeklyStats.completed}</p>
              <p className="text-sm text-muted-foreground">Completed</p>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-secondary/30">
          <CardContent className="pt-6">
            <div className="text-center">
              <p className="text-3xl font-display">{Math.round(weeklyStats.totalMinutes)}</p>
              <p className="text-sm text-muted-foreground">Total Minutes</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Week Grid */}
      <div className="grid grid-cols-7 gap-4">
        {weekDays.map((day) => {
          const dayWorkouts = getWorkoutsForDay(day);
          const isCurrentDay = isToday(day);
          const isPastDay = isPast(day) && !isCurrentDay;

          return (
            <Card
              key={day.toISOString()}
              className={cn(
                "min-h-[300px] transition-colors",
                isCurrentDay && "ring-2 ring-primary",
                isPastDay && "opacity-60"
              )}
            >
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs uppercase text-muted-foreground">
                      {format(day, "EEE")}
                    </p>
                    <p
                      className={cn(
                        "font-display text-2xl",
                        isCurrentDay && "text-primary"
                      )}
                    >
                      {format(day, "d")}
                    </p>
                  </div>
                  {isCurrentDay && (
                    <Badge className="bg-primary/20 text-primary">Today</Badge>
                  )}
                </div>
              </CardHeader>
              <CardContent className="space-y-2">
                {isLoading ? (
                  <>
                    <Skeleton className="h-16 w-full" />
                    <Skeleton className="h-16 w-full" />
                  </>
                ) : dayWorkouts.length > 0 ? (
                  dayWorkouts.map((workout) => (
                    <WorkoutCard
                      key={workout.id}
                      workout={workout}
                      onDelete={() => handleDeleteWorkout(workout.id)}
                      onStatusChange={(status) =>
                        handleStatusChange(workout.id, status)
                      }
                    />
                  ))
                ) : (
                  <div className="flex h-20 items-center justify-center rounded-lg border border-dashed border-border/50 text-muted-foreground text-sm">
                    Rest Day
                  </div>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Stack Push Info */}
      <Card className="border-primary/20 bg-primary/5">
        <CardContent className="flex items-center gap-4 py-4">
          {pushResult ? (
            pushResult.success ? (
              <CheckCircle2 className="h-5 w-5 text-green-500" />
            ) : (
              <AlertCircle className="h-5 w-5 text-destructive" />
            )
          ) : (
            <AlertCircle className="h-5 w-5 text-primary" />
          )}
          <div className="flex-1">
            {pushResult ? (
              <>
                <p className={cn(
                  "font-medium",
                  pushResult.success ? "text-green-500" : "text-destructive"
                )}>
                  {pushResult.success ? "Success!" : "Push Failed"}
                </p>
                <p className="text-sm text-muted-foreground">
                  {pushResult.message}
                </p>
              </>
            ) : (
              <>
                <p className="font-medium text-foreground">
                  Automatic Stack Push
                </p>
                <p className="text-sm text-muted-foreground">
                  Your planned workouts will be automatically pushed to your Peloton stack each night at midnight.
                </p>
              </>
            )}
          </div>
          <Button
            variant="outline"
            className="ml-auto gap-2"
            onClick={handlePushToStack}
            disabled={isPushing}
          >
            {isPushing ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Pushing...
              </>
            ) : (
              "Push Now"
            )}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

function WorkoutCard({
  workout,
  onDelete,
  onStatusChange,
}: {
  workout: PlannedWorkout;
  onDelete: () => void;
  onStatusChange: (status: PlannedWorkout["status"]) => void;
}) {
  const discipline = DISCIPLINES[workout.discipline] || {
    label: workout.discipline,
    color: "bg-gray-500",
  };

  return (
    <div
      className={cn(
        "group relative rounded-lg border border-border/50 bg-secondary/30 p-3 transition-all hover:bg-secondary/50",
        workout.status === "completed" && "opacity-60"
      )}
    >
      <div className="flex items-start gap-2">
        <GripVertical className="h-4 w-4 text-muted-foreground/50 cursor-grab" />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <div className={cn("h-2 w-2 rounded-full", discipline.color)} />
            <span className="text-xs text-muted-foreground">
              {discipline.label}
            </span>
          </div>
          <p className="font-medium text-sm text-foreground truncate">
            {workout.ride_title}
          </p>
          <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
            {workout.instructor_name && (
              <span className="flex items-center gap-1">
                <User className="h-3 w-3" />
                {workout.instructor_name}
              </span>
            )}
            <span className="flex items-center gap-1">
              <Clock className="h-3 w-3" />
              {Math.round(workout.duration_seconds / 60)}m
            </span>
          </div>
        </div>
      </div>

      {/* Actions (visible on hover) */}
      <div className="absolute right-2 top-2 flex gap-1 opacity-0 transition-opacity group-hover:opacity-100">
        {workout.status === "planned" && (
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6"
            onClick={() => onStatusChange("completed")}
          >
            <CalendarCheck className="h-3 w-3 text-green-500" />
          </Button>
        )}
        <Button
          variant="ghost"
          size="icon"
          className="h-6 w-6"
          onClick={onDelete}
        >
          <Trash2 className="h-3 w-3 text-destructive" />
        </Button>
      </div>

      {/* Status badge */}
      {workout.status === "completed" && (
        <Badge className="absolute bottom-2 right-2 bg-green-500/20 text-green-500 text-xs">
          Done
        </Badge>
      )}
    </div>
  );
}
