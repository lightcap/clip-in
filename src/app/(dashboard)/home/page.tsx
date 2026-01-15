"use client";

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
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ConnectPeloton } from "@/components/peloton/connect-peloton";

export default function DashboardPage() {
  const { profile, isPelotonConnected, pelotonTokenStatus } = useAuthStore();

  // Mock data for display - in real app, this comes from API
  const currentFtp = profile?.current_ftp || 0;
  const estimatedFtp = profile?.estimated_ftp || 0;

  const isExpired = pelotonTokenStatus === "expired";

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
            {currentFtp > 0 && (
              <div className="mt-2 flex items-center gap-1 text-sm">
                <ArrowUpRight className="h-4 w-4 text-green-500" />
                <span className="text-green-500">+5 watts</span>
                <span className="text-muted-foreground">from last test</span>
              </div>
            )}
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
                12
              </span>
              <span className="text-sm text-muted-foreground">weeks</span>
            </div>
            <div className="mt-2 flex items-center gap-1 text-sm">
              <span className="text-orange-500">Personal best!</span>
            </div>
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
            <div className="flex items-baseline gap-2">
              <span className="font-display text-4xl tracking-tight text-foreground">
                3
              </span>
              <span className="text-sm text-muted-foreground">/ 5 workouts</span>
            </div>
            <Progress value={60} className="mt-3 h-2" />
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
            <div className="space-y-4">
              {[
                {
                  title: "45 min Power Zone Endurance",
                  instructor: "Matt Wilpers",
                  time: "Tomorrow, 6:00 AM",
                  type: "Cycling",
                },
                {
                  title: "30 min Upper Body Strength",
                  instructor: "Adrian Williams",
                  time: "Wed, 7:00 AM",
                  type: "Strength",
                },
                {
                  title: "20 min FTP Test",
                  instructor: "Denis Morton",
                  time: "Sat, 8:00 AM",
                  type: "Cycling",
                },
              ].map((workout, i) => (
                <div
                  key={i}
                  className="flex items-center justify-between rounded-lg border border-border/50 bg-secondary/30 p-4 transition-colors hover:bg-secondary/50"
                >
                  <div className="flex items-center gap-4">
                    <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-primary/10">
                      <Zap className="h-6 w-6 text-primary" />
                    </div>
                    <div>
                      <h4 className="font-medium text-foreground">
                        {workout.title}
                      </h4>
                      <p className="text-sm text-muted-foreground">
                        {workout.instructor} • {workout.time}
                      </p>
                    </div>
                  </div>
                  <Badge variant="secondary">{workout.type}</Badge>
                </div>
              ))}
            </div>
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
            <div className="space-y-4">
              {[
                { date: "Jan 2026", ftp: currentFtp || 185, change: 5 },
                { date: "Dec 2025", ftp: (currentFtp || 185) - 5, change: -2 },
                { date: "Nov 2025", ftp: (currentFtp || 185) - 3, change: 8 },
              ].map((record, i) => (
                <div
                  key={i}
                  className="flex items-center justify-between py-2 border-b border-border/50 last:border-0"
                >
                  <div>
                    <p className="font-medium text-foreground">{record.ftp}w</p>
                    <p className="text-sm text-muted-foreground">{record.date}</p>
                  </div>
                  <div
                    className={`flex items-center gap-1 text-sm ${
                      record.change >= 0 ? "text-green-500" : "text-red-500"
                    }`}
                  >
                    {record.change >= 0 ? (
                      <ArrowUpRight className="h-4 w-4" />
                    ) : (
                      <ArrowDownRight className="h-4 w-4" />
                    )}
                    {Math.abs(record.change)}w
                  </div>
                </div>
              ))}
            </div>
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
