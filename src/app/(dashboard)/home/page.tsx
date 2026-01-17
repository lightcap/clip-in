"use client";

import { useEffect, useState, useCallback } from "react";
import {
  TrendingUp,
  Flame,
  Target,
  Calendar,
  ArrowUpRight,
  ArrowDownRight,
  Zap,
  AlertCircle,
} from "lucide-react";
import { useAuthStore } from "@/lib/stores/auth-store";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ConnectPeloton } from "@/components/peloton/connect-peloton";

interface PlannedWorkout {
  id: string;
  ride_title: string;
  instructor_name: string;
  scheduled_date: string;
  scheduled_time?: string;
  discipline: string;
}

interface FtpRecord {
  id: string;
  workout_date: string;
  calculated_ftp: number;
  baseline_ftp: number;
}

export default function DashboardPage() {
  const { profile, isPelotonConnected, pelotonTokenStatus } = useAuthStore();

  const currentFtp = profile?.current_ftp || 0;
  const estimatedFtp = profile?.estimated_ftp || 0;

  const isExpired = pelotonTokenStatus === "expired";

  const [upcomingWorkouts, setUpcomingWorkouts] = useState<PlannedWorkout[]>([]);
  const [ftpHistory, setFtpHistory] = useState<FtpRecord[]>([]);
  const [weeklyWorkoutCount, setWeeklyWorkoutCount] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [dashboardError, setDashboardError] = useState<string | null>(null);

  const fetchDashboardData = useCallback(async () => {
    if (!isPelotonConnected) return;

    setIsLoading(true);
    setDashboardError(null);
    let hasErrors = false;

    try {
      // Fetch upcoming planned workouts
      const today = new Date();
      const nextWeek = new Date(today);
      nextWeek.setDate(nextWeek.getDate() + 7);

      const workoutsRes = await fetch(
        `/api/planner/workouts?start=${today.toISOString().split("T")[0]}&end=${nextWeek.toISOString().split("T")[0]}`
      );
      if (workoutsRes.ok) {
        const data = await workoutsRes.json();
        setUpcomingWorkouts(data.workouts?.slice(0, 3) || []);
      } else {
        console.error("Failed to fetch upcoming workouts:", workoutsRes.status);
        hasErrors = true;
      }

      // Fetch FTP history
      const ftpRes = await fetch("/api/ftp/history");
      if (ftpRes.ok) {
        const data = await ftpRes.json();
        setFtpHistory(data.records?.slice(0, 3) || []);
      } else {
        console.error("Failed to fetch FTP history:", ftpRes.status);
        hasErrors = true;
      }

      // Calculate workouts completed this week (Sunday-based week)
      const startOfWeek = new Date(today);
      startOfWeek.setDate(today.getDate() - today.getDay());
      const endOfWeek = new Date(startOfWeek);
      endOfWeek.setDate(startOfWeek.getDate() + 6);

      const weekWorkoutsRes = await fetch(
        `/api/planner/workouts?start=${startOfWeek.toISOString().split("T")[0]}&end=${endOfWeek.toISOString().split("T")[0]}`
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
      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4 stagger-fade-in">
        {/* Current FTP */}
        <Card className="metric-card">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Current FTP
            </CardTitle>
            <TrendingUp className="h-4 w-4 text-primary" />
          </CardHeader>
          <CardContent>
            <div className="flex items-baseline gap-2">
              <span className="font-display text-4xl tracking-tight text-foreground">
                {currentFtp || "—"}
              </span>
              <span className="text-sm text-muted-foreground">watts</span>
            </div>
            {currentFtp > 0 && ftpHistory.length >= 2 && (() => {
              const change = ftpHistory[0].calculated_ftp - ftpHistory[1].calculated_ftp;
              return (
                <div className="mt-2 flex items-center gap-1 text-sm">
                  {change >= 0 ? (
                    <>
                      <ArrowUpRight className="h-4 w-4 text-green-500" />
                      <span className="text-green-500">+{change} watts</span>
                    </>
                  ) : (
                    <>
                      <ArrowDownRight className="h-4 w-4 text-red-500" />
                      <span className="text-red-500">{change} watts</span>
                    </>
                  )}
                  <span className="text-muted-foreground">from last test</span>
                </div>
              );
            })()}
          </CardContent>
        </Card>

        {/* Estimated FTP */}
        <Card className="metric-card">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Estimated FTP
            </CardTitle>
            <Target className="h-4 w-4 text-blue-500" />
          </CardHeader>
          <CardContent>
            <div className="flex items-baseline gap-2">
              <span className="font-display text-4xl tracking-tight text-foreground">
                {estimatedFtp || "—"}
              </span>
              <span className="text-sm text-muted-foreground">watts</span>
            </div>
            <p className="mt-2 text-sm text-muted-foreground">
              Based on recent rides
            </p>
          </CardContent>
        </Card>

        {/* Weekly Streak */}
        <Card className="metric-card">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Weekly Streak
            </CardTitle>
            <Flame className="h-4 w-4 text-orange-500" />
          </CardHeader>
          <CardContent>
            <div className="flex items-baseline gap-2">
              <span className="font-display text-4xl tracking-tight text-foreground">
                —
              </span>
              <span className="text-sm text-muted-foreground">weeks</span>
            </div>
            <p className="mt-2 text-sm text-muted-foreground">
              Coming soon
            </p>
          </CardContent>
        </Card>

        {/* Workouts This Week */}
        <Card className="metric-card">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              This Week
            </CardTitle>
            <Calendar className="h-4 w-4 text-purple-500" />
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-10 w-20" />
            ) : (
              <>
                <div className="flex items-baseline gap-2">
                  <span className="font-display text-4xl tracking-tight text-foreground">
                    {weeklyWorkoutCount}
                  </span>
                  <span className="text-sm text-muted-foreground">workouts</span>
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
                {upcomingWorkouts.map((workout) => (
                  <div
                    key={workout.id}
                    className="flex items-center justify-between rounded-lg border border-border/50 bg-secondary/30 p-4 transition-colors hover:bg-secondary/50"
                  >
                    <div className="flex items-center gap-4">
                      <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-primary/10">
                        <Zap className="h-6 w-6 text-primary" />
                      </div>
                      <div>
                        <h4 className="font-medium text-foreground">
                          {workout.ride_title}
                        </h4>
                        <p className="text-sm text-muted-foreground">
                          {workout.instructor_name} • {formatWorkoutDate(workout.scheduled_date, workout.scheduled_time)}
                        </p>
                      </div>
                    </div>
                    <Badge variant="secondary" className="capitalize">{workout.discipline}</Badge>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-muted-foreground text-center py-8">
                No upcoming workouts planned. Visit the Planner to add some!
              </p>
            )}
          </CardContent>
        </Card>

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
                            <ArrowUpRight className="h-4 w-4" />
                          ) : (
                            <ArrowDownRight className="h-4 w-4" />
                          )}
                          {Math.abs(change)}w
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

function formatWorkoutDate(date: string, time?: string): string {
  const workoutDate = new Date(date);
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);

  const daysDiff = Math.floor((workoutDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));

  let dateStr: string;
  if (daysDiff === 0) {
    dateStr = "Today";
  } else if (daysDiff === 1) {
    dateStr = "Tomorrow";
  } else {
    dateStr = workoutDate.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
  }

  if (time) {
    const [hours, minutes] = time.split(":");
    const hour = parseInt(hours);
    const ampm = hour >= 12 ? "PM" : "AM";
    const hour12 = hour % 12 || 12;
    dateStr += `, ${hour12}:${minutes} ${ampm}`;
  }

  return dateStr;
}

function formatFtpDate(dateString: string): string {
  const date = new Date(dateString);
  return date.toLocaleDateString("en-US", { month: "short", year: "numeric" });
}
