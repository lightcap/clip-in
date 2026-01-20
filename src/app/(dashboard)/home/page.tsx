"use client";

import { useEffect, useState, useCallback } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import {
  TrendingUp,
  Flame,
  Calendar,
  ArrowUpRight,
  ArrowDownRight,
  Zap,
  AlertCircle,
  Clock,
  User,
  MoreVertical,
  CalendarDays,
  Maximize2,
} from "lucide-react";
import { format, addDays, startOfWeek as getStartOfWeek, endOfWeek as getEndOfWeek } from "date-fns";
import { useAuthStore } from "@/lib/stores/auth-store";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { ConnectPeloton } from "@/components/peloton/connect-peloton";
import { getDisciplineLabel, getDisciplineColor } from "@/types/peloton";
import { cn } from "@/lib/utils";

interface PlannedWorkout {
  id: string;
  ride_title: string;
  ride_image_url: string | null;
  instructor_name: string | null;
  duration_seconds: number;
  discipline: string;
  scheduled_date: string;
  scheduled_time: string | null;
  status: "planned" | "completed" | "skipped" | "postponed";
}

interface FtpRecord {
  id: string;
  workout_date: string;
  calculated_ftp: number;
  baseline_ftp: number;
}

export default function DashboardPage() {
  const router = useRouter();
  const { profile, isPelotonConnected, pelotonTokenStatus } = useAuthStore();

  const isExpired = pelotonTokenStatus === "expired";

  const [upcomingWorkouts, setUpcomingWorkouts] = useState<PlannedWorkout[]>([]);
  const [ftpHistory, setFtpHistory] = useState<FtpRecord[]>([]);
  const [weeklyWorkoutCount, setWeeklyWorkoutCount] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [dashboardError, setDashboardError] = useState<string | null>(null);
  const [selectedWorkout, setSelectedWorkout] = useState<PlannedWorkout | null>(null);

  const fetchDashboardData = useCallback(async () => {
    if (!isPelotonConnected) return;

    setIsLoading(true);
    setDashboardError(null);
    let hasErrors = false;

    try {
      // Fetch upcoming planned workouts
      const today = new Date();
      const nextWeek = addDays(today, 7);

      const workoutsRes = await fetch(
        `/api/planner/workouts?start=${format(today, "yyyy-MM-dd")}&end=${format(nextWeek, "yyyy-MM-dd")}`
      );
      if (workoutsRes.ok) {
        const data = await workoutsRes.json();
        setUpcomingWorkouts(data.workouts?.slice(0, 3) || []);
      } else {
        console.error("Failed to fetch upcoming workouts:", workoutsRes.status);
        hasErrors = true;
      }

      // Fetch FTP history (latest record is the current FTP)
      const ftpRes = await fetch("/api/ftp/history");
      if (ftpRes.ok) {
        const data = await ftpRes.json();
        setFtpHistory(data.records?.slice(0, 3) || []);
      } else {
        console.error("Failed to fetch FTP history:", ftpRes.status);
        hasErrors = true;
      }

      // Calculate workouts completed this week (Sunday-based week)
      const startOfWeek = getStartOfWeek(today, { weekStartsOn: 0 });
      const endOfWeek = getEndOfWeek(today, { weekStartsOn: 0 });

      const weekWorkoutsRes = await fetch(
        `/api/planner/workouts?start=${format(startOfWeek, "yyyy-MM-dd")}&end=${format(endOfWeek, "yyyy-MM-dd")}`
      );
      if (weekWorkoutsRes.ok) {
        const data = await weekWorkoutsRes.json();
        const completedCount = (data.workouts || []).filter(
          (w: PlannedWorkout & { status?: string }) => w.status === "completed"
        ).length;
        setWeeklyWorkoutCount(completedCount);
      } else {
        console.error("Failed to fetch weekly workouts:", weekWorkoutsRes.status);
        hasErrors = true;
      }

      if (hasErrors) {
        setDashboardError("Some data failed to load. Click retry to refresh.");
      }
    } catch (error) {
      console.error("Failed to fetch dashboard data:", error);
      setDashboardError("Failed to load dashboard data. Please check your connection.");
    } finally {
      setIsLoading(false);
    }
  }, [isPelotonConnected]);

  useEffect(() => {
    fetchDashboardData();
  }, [fetchDashboardData]);

  // Never connected - show full-page connect prompt
  if (!isPelotonConnected) {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center">
        <div className="relative mb-8">
          <div className="absolute -inset-8 rounded-full bg-primary/20 blur-3xl" />
          <div className="relative flex h-24 w-24 items-center justify-center rounded-2xl bg-primary glow-primary">
            <Zap className="h-12 w-12 text-primary-foreground" />
          </div>
        </div>
        <h2 className="font-display text-4xl tracking-wide text-foreground mb-3">
          CONNECT YOUR PELOTON
        </h2>
        <p className="text-muted-foreground text-lg mb-8 max-w-md text-center">
          Link your Peloton account to start tracking your FTP, planning workouts, and automating your stack.
        </p>
        <ConnectPeloton />
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Welcome Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-4xl tracking-wide text-foreground">
            {getGreeting()}, {profile?.display_name?.split(" ")[0] || "Athlete"}
          </h1>
          <p className="text-muted-foreground mt-1">
            Here&apos;s your fitness overview for today
          </p>
        </div>
        <Button className="gap-2">
          <Calendar className="h-4 w-4" />
          Plan Workout
        </Button>
      </div>

      {/* Reconnect Banner */}
      {isExpired && (
        <Card className="border-amber-500/30 bg-amber-500/5">
          <CardContent className="flex items-center gap-4 py-4">
            <AlertCircle className="h-5 w-5 text-amber-500 shrink-0" />
            <div className="flex-1">
              <p className="font-medium text-amber-500">Session Expired</p>
              <p className="text-sm text-muted-foreground">
                Your Peloton session has expired. Reconnect to sync new data and use all features.
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

      {/* Error Banner */}
      {dashboardError && (
        <Card className="border-red-500/30 bg-red-500/5">
          <CardContent className="flex items-center gap-4 py-4">
            <AlertCircle className="h-5 w-5 text-red-500 shrink-0" />
            <div className="flex-1">
              <p className="font-medium text-red-500">Error Loading Data</p>
              <p className="text-sm text-muted-foreground">{dashboardError}</p>
            </div>
            <Button
              variant="outline"
              className="border-red-500/50 text-red-500 hover:bg-red-500/10"
              onClick={() => fetchDashboardData()}
            >
              Retry
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Stats Grid */}
      <div className="grid gap-6 md:grid-cols-3 stagger-fade-in">
        {/* Current FTP */}
        <Card className="metric-card">
          <TrendingUp className="absolute right-4 bottom-4 h-24 w-24 text-primary/10" />
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Current FTP
            </CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-12 w-24" />
            ) : (
              <>
                <div className="flex items-baseline gap-2">
                  <span className="font-display text-5xl tracking-tight text-foreground">
                    {ftpHistory[0]?.calculated_ftp || "—"}
                  </span>
                  <span className="text-lg text-muted-foreground">watts</span>
                </div>
                {ftpHistory.length >= 2 && (() => {
                  const change = ftpHistory[0].calculated_ftp - ftpHistory[1].calculated_ftp;
                  return (
                    <div className="mt-2 flex items-center gap-1 text-sm">
                      {change >= 0 ? (
                        <>
                          <ArrowUpRight className="h-4 w-4 text-green-500" />
                          <span className="text-green-500">+{change}w</span>
                        </>
                      ) : (
                        <>
                          <ArrowDownRight className="h-4 w-4 text-red-500" />
                          <span className="text-red-500">{change}w</span>
                        </>
                      )}
                    </div>
                  );
                })()}
              </>
            )}
          </CardContent>
        </Card>

        {/* Weekly Streak */}
        <Card className="metric-card">
          <Flame className="absolute right-4 bottom-4 h-24 w-24 text-orange-500/10" />
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Weekly Streak
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-baseline gap-2">
              <span className="font-display text-5xl tracking-tight text-foreground">
                —
              </span>
              <span className="text-lg text-muted-foreground">weeks</span>
            </div>
            <p className="mt-2 text-sm text-muted-foreground">
              Coming soon
            </p>
          </CardContent>
        </Card>

        {/* Workouts This Week */}
        <Card className="metric-card">
          <Calendar className="absolute right-4 bottom-4 h-24 w-24 text-purple-500/10" />
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              This Week
            </CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-12 w-24" />
            ) : (
              <>
                <div className="flex items-baseline gap-2">
                  <span className="font-display text-5xl tracking-tight text-foreground">
                    {weeklyWorkoutCount}
                  </span>
                  <span className="text-lg text-muted-foreground">workouts</span>
                </div>
                <p className="mt-2 text-sm text-muted-foreground">
                  Completed this week
                </p>
              </>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Activity Section */}
      <div className="grid gap-6 lg:grid-cols-3">
        {/* Upcoming Workouts */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="font-display text-xl tracking-wide">
              UPCOMING WORKOUTS
            </CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="space-y-4">
                {[...Array(3)].map((_, i) => (
                  <Skeleton key={i} className="h-20 w-full rounded-lg" />
                ))}
              </div>
            ) : upcomingWorkouts.length > 0 ? (
              <div className="space-y-4">
                {(() => {
                  // Group workouts by date
                  const groupedByDate = upcomingWorkouts.reduce((acc, workout) => {
                    const date = workout.scheduled_date;
                    if (!acc[date]) acc[date] = [];
                    acc[date].push(workout);
                    return acc;
                  }, {} as Record<string, PlannedWorkout[]>);

                  return Object.entries(groupedByDate).map(([date, workouts]) => (
                    <div key={date}>
                      {/* Date divider */}
                      <div className="flex items-center gap-3 mb-2">
                        <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                          {formatDateDivider(date)}
                        </span>
                        <div className="flex-1 h-px bg-border/50" />
                      </div>

                      {/* Workouts for this date */}
                      <div className="space-y-2">
                        {workouts.map((workout) => {
                          const disciplineLabel = getDisciplineLabel(workout.discipline);
                          const disciplineColor = getDisciplineColor(workout.discipline);

                          return (
                            <div
                              key={workout.id}
                              className="relative overflow-hidden rounded-xl border border-border/40 bg-secondary/40 transition-all duration-200 hover:border-border/60"
                            >
                              {/* Background cover image */}
                              {workout.ride_image_url && (
                                <div className="absolute inset-0">
                                  <Image
                                    src={workout.ride_image_url}
                                    alt=""
                                    fill
                                    className="object-cover object-[center_15%] opacity-40"
                                    sizes="(max-width: 768px) 100vw, 66vw"
                                  />
                                  <div className="absolute inset-0 bg-gradient-to-r from-background/90 via-background/75 to-background/60" />
                                </div>
                              )}

                              <div className="relative p-3">
                                {/* Top row: Discipline on left, Duration on right */}
                                <div className="flex items-center justify-between mb-1.5">
                                  <div className="flex items-center gap-2">
                                    <div className={cn("h-2 w-2 rounded-full shrink-0", disciplineColor)} />
                                    <span className="text-xs font-medium text-muted-foreground">
                                      {disciplineLabel}
                                    </span>
                                  </div>
                                  <span className="text-xs text-muted-foreground/70 flex items-center gap-1">
                                    <Clock className="h-3 w-3" />
                                    {Math.round(workout.duration_seconds / 60)} min
                                  </span>
                                </div>

                                {/* Title */}
                                <p className="font-medium text-sm leading-snug line-clamp-2 text-foreground">
                                  {workout.ride_title}
                                </p>

                                {/* Bottom row: Instructor + Time + Menu */}
                                <div className="flex items-center justify-between mt-2">
                                  <div className="flex items-center gap-3">
                                    <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                                      <User className="h-3 w-3" />
                                      <span className="truncate max-w-[150px]">
                                        {workout.instructor_name || "TBD"}
                                      </span>
                                    </p>
                                    {workout.scheduled_time && (
                                      <span className="text-xs text-muted-foreground/70">
                                        {formatTime(workout.scheduled_time)}
                                      </span>
                                    )}
                                  </div>
                                  <DropdownMenu>
                                    <DropdownMenuTrigger asChild>
                                      <button
                                        className="p-1 rounded-md hover:bg-white/10 transition-colors"
                                        onClick={(e) => e.stopPropagation()}
                                      >
                                        <MoreVertical className="h-4 w-4 text-muted-foreground" />
                                      </button>
                                    </DropdownMenuTrigger>
                                    <DropdownMenuContent align="end">
                                      <DropdownMenuItem
                                        onClick={() => setSelectedWorkout(workout)}
                                      >
                                        <Maximize2 className="mr-2 h-4 w-4" />
                                        View details
                                      </DropdownMenuItem>
                                      <DropdownMenuItem
                                        onClick={() => router.push(`/planner?date=${workout.scheduled_date}`)}
                                      >
                                        <CalendarDays className="mr-2 h-4 w-4" />
                                        See it in your plan
                                      </DropdownMenuItem>
                                    </DropdownMenuContent>
                                  </DropdownMenu>
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ));
                })()}
              </div>
            ) : (
              <p className="text-muted-foreground text-center py-8">
                No upcoming workouts planned. Visit the Planner to add some!
              </p>
            )}
          </CardContent>
        </Card>

        {/* Workout Details Dialog */}
        <Dialog open={!!selectedWorkout} onOpenChange={(open) => !open && setSelectedWorkout(null)}>
          <DialogContent className="sm:max-w-md overflow-hidden p-0">
            {selectedWorkout && (
              <>
                {/* Class Image */}
                {selectedWorkout.ride_image_url && (
                  <div className="relative h-48 w-full">
                    <Image
                      src={selectedWorkout.ride_image_url}
                      alt={selectedWorkout.ride_title}
                      fill
                      className="object-cover"
                      sizes="(max-width: 768px) 100vw, 448px"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-background via-background/20 to-transparent" />
                  </div>
                )}

                <div className={cn("p-6 relative", selectedWorkout.ride_image_url && "pt-0 -mt-8")}>
                  {/* Discipline Badge */}
                  <Badge className={cn("mb-3", getDisciplineColor(selectedWorkout.discipline), "text-white")}>
                    {getDisciplineLabel(selectedWorkout.discipline)}
                  </Badge>

                  <DialogHeader className="text-left">
                    <DialogTitle className="text-xl leading-tight">
                      {selectedWorkout.ride_title}
                    </DialogTitle>
                    <DialogDescription className="flex items-center gap-4 mt-2">
                      <span className="flex items-center gap-1.5">
                        <User className="h-4 w-4" />
                        {selectedWorkout.instructor_name || "TBD"}
                      </span>
                      <span className="flex items-center gap-1.5">
                        <Clock className="h-4 w-4" />
                        {Math.round(selectedWorkout.duration_seconds / 60)} minutes
                      </span>
                    </DialogDescription>
                  </DialogHeader>

                  <div className="flex items-center gap-2 mt-4 text-sm text-muted-foreground">
                    <CalendarDays className="h-4 w-4" />
                    Scheduled for {formatDateDivider(selectedWorkout.scheduled_date)}
                    {selectedWorkout.scheduled_time && ` at ${formatTime(selectedWorkout.scheduled_time)}`}
                  </div>

                  <Button
                    className="w-full mt-6"
                    onClick={() => {
                      router.push(`/planner?date=${selectedWorkout.scheduled_date}`);
                      setSelectedWorkout(null);
                    }}
                  >
                    <CalendarDays className="mr-2 h-4 w-4" />
                    See it in your plan
                  </Button>
                </div>
              </>
            )}
          </DialogContent>
        </Dialog>

        {/* FTP History Mini */}
        <Card>
          <CardHeader>
            <CardTitle className="font-display text-xl tracking-wide">
              FTP PROGRESS
            </CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="space-y-4">
                {[...Array(3)].map((_, i) => (
                  <Skeleton key={i} className="h-12 w-full" />
                ))}
              </div>
            ) : ftpHistory.length > 0 ? (
              <div className="space-y-4">
                {ftpHistory.map((record, i) => {
                  const prevRecord = ftpHistory[i + 1];
                  const change = prevRecord
                    ? record.calculated_ftp - prevRecord.calculated_ftp
                    : 0;
                  return (
                    <div
                      key={record.id}
                      className="flex items-center justify-between py-2 border-b border-border/50 last:border-0"
                    >
                      <div>
                        <p className="font-medium text-foreground">{record.calculated_ftp}w</p>
                        <p className="text-sm text-muted-foreground">
                          {formatFtpDate(record.workout_date)}
                        </p>
                      </div>
                      {prevRecord && (
                        <div
                          className={`flex items-center gap-1 text-sm ${
                            change >= 0 ? "text-green-500" : "text-red-500"
                          }`}
                        >
                          {change >= 0 ? (
                            <>
                              <ArrowUpRight className="h-4 w-4" />
                              +{change}w
                            </>
                          ) : (
                            <>
                              <ArrowDownRight className="h-4 w-4" />
                              {change}w
                            </>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className="text-muted-foreground text-center py-4">
                No FTP tests recorded yet
              </p>
            )}
            <Button variant="outline" className="w-full mt-4">
              View Full History
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function getGreeting() {
  const hour = new Date().getHours();
  if (hour < 12) return "GOOD MORNING";
  if (hour < 17) return "GOOD AFTERNOON";
  return "GOOD EVENING";
}

// Parse YYYY-MM-DD string as local date (not UTC).
// Using `new Date("2024-01-15")` interprets the string as UTC midnight,
// which can shift the date backward in negative UTC offset timezones.
function parseLocalDate(dateString: string): Date {
  if (!dateString || typeof dateString !== "string") {
    return new Date(NaN);
  }

  const parts = dateString.split("-");
  if (parts.length !== 3) {
    return new Date(NaN);
  }

  const [year, month, day] = parts.map(Number);
  if (isNaN(year) || isNaN(month) || isNaN(day)) {
    return new Date(NaN);
  }

  return new Date(year, month - 1, day);
}

function formatFtpDate(dateString: string): string {
  // FTP dates come from DB as ISO format with timezone (e.g., "2024-01-15T10:30:00Z"),
  // so standard Date parsing correctly handles timezone conversion.
  if (!dateString) {
    return "Unknown date";
  }

  const date = new Date(dateString);
  if (isNaN(date.getTime())) {
    return "Unknown date";
  }

  return date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function formatDateDivider(dateString: string): string {
  const date = parseLocalDate(dateString);

  if (isNaN(date.getTime())) {
    return "Unknown date";
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);

  const daysDiff = Math.floor((date.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));

  if (daysDiff === 0) {
    return "Today";
  } else if (daysDiff === 1) {
    return "Tomorrow";
  } else {
    return date.toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" });
  }
}

function formatTime(time: string): string {
  if (!time || typeof time !== "string") {
    return "";
  }

  const parts = time.split(":");
  if (parts.length < 2) {
    return "";
  }

  const hour = parseInt(parts[0], 10);
  const minutes = parseInt(parts[1], 10);

  if (isNaN(hour) || isNaN(minutes) || hour < 0 || hour > 23 || minutes < 0 || minutes > 59) {
    return "";
  }

  const ampm = hour >= 12 ? "PM" : "AM";
  const hour12 = hour % 12 || 12;
  return `${hour12}:${parts[1].padStart(2, "0")} ${ampm}`;
}
