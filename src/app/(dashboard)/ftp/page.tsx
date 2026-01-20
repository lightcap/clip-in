"use client";

import { useEffect, useState } from "react";
import {
  TrendingUp,
  TrendingDown,
  RefreshCw,
  Info,
  Calendar,
  Zap,
  ArrowUpRight,
  ArrowDownRight,
} from "lucide-react";
import {
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Area,
  AreaChart,
} from "recharts";
import { format } from "date-fns";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Tooltip as UITooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useAuthStore } from "@/lib/stores/auth-store";
import { cn } from "@/lib/utils";

interface FtpRecord {
  id: string;
  workout_id: string;
  workout_date: string;
  ride_title: string | null;
  avg_output: number;
  calculated_ftp: number;
  baseline_ftp: number;
}

export default function FtpPage() {
  const { profile, isPelotonConnected } = useAuthStore();
  const [ftpRecords, setFtpRecords] = useState<FtpRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSyncing, setIsSyncing] = useState(false);

  useEffect(() => {
    if (isPelotonConnected) {
      fetchFtpRecords();
    } else {
      setIsLoading(false);
    }
  }, [isPelotonConnected]);

  const fetchFtpRecords = async () => {
    try {
      const response = await fetch("/api/ftp/history");
      if (response.ok) {
        const data = await response.json();
        setFtpRecords(data.records || []);
      }
    } catch (error) {
      console.error("Failed to fetch FTP records:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSync = async () => {
    setIsSyncing(true);
    try {
      const response = await fetch("/api/ftp/sync", { method: "POST" });
      if (response.ok) {
        await fetchFtpRecords();
      }
    } catch (error) {
      console.error("Failed to sync FTP:", error);
    } finally {
      setIsSyncing(false);
    }
  };

  // Calculate stats
  const currentFtp = profile?.current_ftp || ftpRecords[0]?.calculated_ftp || 0;
  const previousFtp = ftpRecords[1]?.calculated_ftp || ftpRecords[0]?.baseline_ftp || 0;
  const ftpChange = currentFtp - previousFtp;
  const ftpChangePercent = previousFtp > 0 ? ((ftpChange / previousFtp) * 100).toFixed(1) : 0;

  // All-time high
  const allTimeHigh = Math.max(...ftpRecords.map((r) => r.calculated_ftp), 0);
  const isAtPeak = currentFtp === allTimeHigh && allTimeHigh > 0;

  // Chart data (reverse for chronological order)
  const chartData = [...ftpRecords]
    .reverse()
    .map((record) => ({
      date: format(new Date(record.workout_date), "MMM yyyy"),
      ftp: record.calculated_ftp,
      fullDate: format(new Date(record.workout_date), "MMM d, yyyy"),
    }));

  if (!isPelotonConnected) {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center">
        <div className="relative mb-8">
          <div className="absolute -inset-8 rounded-full bg-primary/20 blur-3xl" />
          <div className="relative flex h-24 w-24 items-center justify-center rounded-2xl bg-primary/10">
            <TrendingUp className="h-12 w-12 text-primary" />
          </div>
        </div>
        <h2 className="font-display text-3xl tracking-wide text-foreground mb-3">
          CONNECT PELOTON TO TRACK FTP
        </h2>
        <p className="text-muted-foreground text-center max-w-md">
          Link your Peloton account to automatically sync your FTP test history and track your progress over time.
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
            FTP TRACKER
          </h1>
          <p className="text-muted-foreground mt-1">
            Monitor your Functional Threshold Power progress
          </p>
        </div>
        <Button
          variant="outline"
          className="gap-2"
          onClick={handleSync}
          disabled={isSyncing}
        >
          <RefreshCw className={cn("h-4 w-4", isSyncing && "animate-spin")} />
          {isSyncing ? "Syncing..." : "Sync from Peloton"}
        </Button>
      </div>

      {/* Stats Cards */}
      <div className="grid gap-6 md:grid-cols-3 stagger-fade-in">
        {/* Current FTP */}
        <Card className="metric-card">
          <TrendingUp className="absolute right-4 bottom-4 h-24 w-24 text-primary/10" />
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Current FTP
            </CardTitle>
            <TooltipProvider>
              <UITooltip>
                <TooltipTrigger>
                  <Info className="h-4 w-4 text-muted-foreground" />
                </TooltipTrigger>
                <TooltipContent>
                  <p>Your most recent FTP test result</p>
                </TooltipContent>
              </UITooltip>
            </TooltipProvider>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-12 w-24" />
            ) : (
              <>
                <div className="flex items-baseline gap-2">
                  <span className="font-display text-5xl tracking-tight text-foreground">
                    {currentFtp || "—"}
                  </span>
                  <span className="text-lg text-muted-foreground">watts</span>
                </div>
                {ftpChange !== 0 && (
                  <div className="mt-2 flex items-center gap-1 text-sm">
                    {ftpChange >= 0 ? (
                      <>
                        <ArrowUpRight className="h-4 w-4 text-green-500" />
                        <span className="text-green-500">+{ftpChange}w</span>
                      </>
                    ) : (
                      <>
                        <ArrowDownRight className="h-4 w-4 text-red-500" />
                        <span className="text-red-500">{ftpChange}w</span>
                      </>
                    )}
                  </div>
                )}
              </>
            )}
          </CardContent>
        </Card>

        {/* All-Time High */}
        <Card className="metric-card">
          <Zap className="absolute right-4 bottom-4 h-24 w-24 text-yellow-500/10" />
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              All-Time High
            </CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-12 w-24" />
            ) : (
              <>
                <div className="flex items-baseline gap-2">
                  <span className="font-display text-5xl tracking-tight text-foreground">
                    {allTimeHigh || "—"}
                  </span>
                  <span className="text-lg text-muted-foreground">watts</span>
                </div>
                {isAtPeak && (
                  <Badge className="mt-2 bg-yellow-500/20 text-yellow-500 hover:bg-yellow-500/30">
                    Personal Record!
                  </Badge>
                )}
              </>
            )}
          </CardContent>
        </Card>

        {/* Tests Completed */}
        <Card className="metric-card">
          <Calendar className="absolute right-4 bottom-4 h-24 w-24 text-blue-500/10" />
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Tests Completed
            </CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-12 w-16" />
            ) : (
              <>
                <div className="flex items-baseline gap-2">
                  <span className="font-display text-5xl tracking-tight text-foreground">
                    {ftpRecords.length}
                  </span>
                  <span className="text-lg text-muted-foreground">tests</span>
                </div>
                {ftpRecords[0] && (
                  <p className="mt-2 text-sm text-muted-foreground">
                    Last test:{" "}
                    {format(new Date(ftpRecords[0].workout_date), "MMM d, yyyy")}
                  </p>
                )}
              </>
            )}
          </CardContent>
        </Card>
      </div>

      {/* FTP Chart */}
      <Card>
        <CardHeader>
          <CardTitle className="font-display text-xl tracking-wide">
            FTP PROGRESS OVER TIME
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <Skeleton className="h-[400px] w-full" />
          ) : chartData.length > 0 ? (
            <div className="h-[400px]">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={chartData}>
                  <defs>
                    <linearGradient id="ftpGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop
                        offset="5%"
                        stopColor="hsl(var(--primary))"
                        stopOpacity={0.3}
                      />
                      <stop
                        offset="95%"
                        stopColor="hsl(var(--primary))"
                        stopOpacity={0}
                      />
                    </linearGradient>
                  </defs>
                  <CartesianGrid
                    strokeDasharray="3 3"
                    stroke="hsl(var(--border))"
                    vertical={false}
                  />
                  <XAxis
                    dataKey="date"
                    stroke="hsl(var(--muted-foreground))"
                    fontSize={12}
                    tickLine={false}
                    axisLine={false}
                  />
                  <YAxis
                    stroke="hsl(var(--muted-foreground))"
                    fontSize={12}
                    tickLine={false}
                    axisLine={false}
                    domain={["dataMin - 10", "dataMax + 10"]}
                    tickFormatter={(value) => `${value}w`}
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: "hsl(var(--card))",
                      border: "1px solid hsl(var(--border))",
                      borderRadius: "8px",
                    }}
                    labelStyle={{ color: "hsl(var(--foreground))" }}
                    formatter={(value: number) => [`${value} watts`, "FTP"]}
                    labelFormatter={(_, payload) =>
                      payload[0]?.payload?.fullDate || ""
                    }
                  />
                  <Area
                    type="monotone"
                    dataKey="ftp"
                    stroke="hsl(var(--primary))"
                    strokeWidth={3}
                    fill="url(#ftpGradient)"
                    dot={{
                      fill: "hsl(var(--primary))",
                      strokeWidth: 2,
                      r: 4,
                    }}
                    activeDot={{
                      fill: "hsl(var(--primary))",
                      strokeWidth: 2,
                      r: 6,
                    }}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <div className="flex h-[400px] items-center justify-center">
              <div className="text-center">
                <TrendingUp className="mx-auto h-12 w-12 text-muted-foreground/50" />
                <p className="mt-4 text-muted-foreground">
                  No FTP tests found. Complete an FTP test on Peloton to start tracking.
                </p>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* History Table */}
      <Card>
        <CardHeader>
          <CardTitle className="font-display text-xl tracking-wide">
            TEST HISTORY
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-4">
              {[...Array(3)].map((_, i) => (
                <Skeleton key={i} className="h-16 w-full" />
              ))}
            </div>
          ) : ftpRecords.length > 0 ? (
            <div className="space-y-3">
              {ftpRecords.map((record, index) => {
                const prevRecord = ftpRecords[index + 1];
                const change = prevRecord
                  ? record.calculated_ftp - prevRecord.calculated_ftp
                  : 0;

                return (
                  <div
                    key={record.id}
                    className="flex items-center justify-between rounded-lg border border-border/50 bg-secondary/30 p-4 transition-colors hover:bg-secondary/50"
                  >
                    <div className="flex items-center gap-4">
                      <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-primary/10">
                        <TrendingUp className="h-6 w-6 text-primary" />
                      </div>
                      <div>
                        <h4 className="font-medium text-foreground">
                          {record.ride_title || "FTP Test"}
                        </h4>
                        <p className="text-sm text-muted-foreground">
                          {format(new Date(record.workout_date), "MMMM d, yyyy")}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-6">
                      <div className="text-right">
                        <p className="text-sm text-muted-foreground">
                          Avg Output
                        </p>
                        <p className="font-medium">{record.avg_output}w</p>
                      </div>
                      <div className="text-right">
                        <p className="text-sm text-muted-foreground">FTP</p>
                        <p className="font-display text-2xl">
                          {record.calculated_ftp}w
                        </p>
                      </div>
                      {change !== 0 && (
                        <div
                          className={cn(
                            "flex items-center gap-1 rounded-full px-3 py-1 text-sm font-medium",
                            change >= 0
                              ? "bg-green-500/10 text-green-500"
                              : "bg-red-500/10 text-red-500"
                          )}
                        >
                          {change >= 0 ? (
                            <ArrowUpRight className="h-3 w-3" />
                          ) : (
                            <ArrowDownRight className="h-3 w-3" />
                          )}
                          {change >= 0 ? "+" : ""}
                          {change}w
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="py-8 text-center text-muted-foreground">
              No FTP test history available.
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
