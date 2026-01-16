"use client";

import { useState, useEffect } from "react";
import {
  User,
  Bell,
  Link2,
  Moon,
  Sun,
  Clock,
  Shield,
  LogOut,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  Loader2,
  ExternalLink,
} from "lucide-react";
import { useTheme } from "next-themes";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useAuthStore } from "@/lib/stores/auth-store";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";

export default function SettingsPage() {
  const { profile, isPelotonConnected, pelotonTokenStatus, isLoading, setIsPelotonConnected, setProfile, setPelotonTokenStatus } = useAuthStore();
  const { theme, setTheme } = useTheme();
  const router = useRouter();
  const [isSaving, setIsSaving] = useState(false);
  const [displayName, setDisplayName] = useState(profile?.display_name || "");
  const [stackPushTime, setStackPushTime] = useState("00:00");
  const [isConnecting, setIsConnecting] = useState(false);
  const [connectionError, setConnectionError] = useState<string | null>(null);
  const [isSyncingFtp, setIsSyncingFtp] = useState(false);
  const [syncMessage, setSyncMessage] = useState<string | null>(null);
  const [showManualConnect, setShowManualConnect] = useState(false);
  const [manualToken, setManualToken] = useState("");
  const [mounted, setMounted] = useState(false);

  // Track client-side mount for theme icon (avoids hydration mismatch)
  useEffect(() => {
    setMounted(true);
  }, []);

  // Handle token from browser extension callback
  useEffect(() => {
    const handleExtensionToken = async () => {
      const hash = window.location.hash;
      if (!hash.includes("peloton_data=")) return;

      // Parse tokens from hash (base64 encoded JSON)
      const hashParams = new URLSearchParams(hash.slice(1));
      const encodedData = hashParams.get("peloton_data");
      window.history.replaceState(null, "", window.location.pathname);

      if (!encodedData) return;

      let token: string | null = null;
      let refreshToken: string | null = null;
      try {
        const tokenData = JSON.parse(atob(encodedData));
        token = tokenData.token;
        refreshToken = tokenData.refreshToken;
      } catch {
        console.error("Failed to parse token data");
        return;
      }

      if (!token) return;

      setIsConnecting(true);
      setConnectionError(null);

      try {
        const response = await fetch("/api/peloton/connect", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ accessToken: token, refreshToken }),
        });

        const data = await response.json();

        if (!response.ok) {
          throw new Error(data.error || "Failed to connect Peloton account");
        }

        setIsPelotonConnected(true);
        setProfile(data.profile);
        setPelotonTokenStatus("valid");
      } catch (err) {
        setConnectionError(err instanceof Error ? err.message : "Failed to connect");
      } finally {
        setIsConnecting(false);
      }
    };

    handleExtensionToken();
  }, [setIsPelotonConnected, setProfile, setPelotonTokenStatus]);

  const initials = profile?.display_name
    ?.split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase() || "U";

  const handleSaveProfile = async () => {
    setIsSaving(true);
    try {
      await fetch("/api/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ display_name: displayName }),
      });
    } catch (error) {
      console.error("Failed to save profile:", error);
    } finally {
      setIsSaving(false);
    }
  };

  const [isSigningOut, setIsSigningOut] = useState(false);

  const handleSignOut = async () => {
    setIsSigningOut(true);
    try {
      const supabase = createClient();
      const { error } = await supabase.auth.signOut();
      if (error) {
        console.error("Sign out error:", error);
        setIsSigningOut(false);
        return;
      }
      // Force full page navigation to login
      window.location.replace("/login");
    } catch (error) {
      console.error("Sign out error:", error);
      setIsSigningOut(false);
    }
  };

  const handleDisconnectPeloton = async () => {
    // TODO: Implement disconnect
  };

  const handleRefreshToken = () => {
    window.open("https://members.onepeloton.com", "_blank");
  };

  const handleSyncFtp = async () => {
    setIsSyncingFtp(true);
    setSyncMessage(null);

    try {
      const response = await fetch("/api/ftp/sync", { method: "POST" });
      const data = await response.json();

      if (!response.ok) {
        if (data.tokenExpired) {
          setPelotonTokenStatus("expired");
        }
        throw new Error(data.error || "Failed to sync FTP");
      }

      // Update profile with new FTP if returned
      if (data.currentFtp && profile) {
        setProfile({ ...profile, current_ftp: data.currentFtp });
      }

      setSyncMessage(`Synced ${data.syncedRecords} FTP record${data.syncedRecords !== 1 ? "s" : ""}`);
    } catch (err) {
      setSyncMessage(err instanceof Error ? err.message : "Sync failed");
    } finally {
      setIsSyncingFtp(false);
    }
  };

  const handleManualConnect = async () => {
    if (!manualToken.trim()) return;

    setIsConnecting(true);
    setConnectionError(null);

    try {
      const response = await fetch("/api/peloton/connect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accessToken: manualToken.trim() }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to connect Peloton account");
      }

      setIsPelotonConnected(true);
      setProfile(data.profile);
      setPelotonTokenStatus("valid");
      setManualToken("");
      setShowManualConnect(false);
    } catch (err) {
      setConnectionError(err instanceof Error ? err.message : "Failed to connect");
    } finally {
      setIsConnecting(false);
    }
  };

  const consoleSnippet = `copy(JSON.parse(Object.entries(localStorage).find(([k]) => k.includes('auth0spajs') && k.includes('api.onepeloton.com'))?.[1] || '{}')?.body?.access_token || 'Token not found')`;

  return (
    <div className="space-y-8 max-w-3xl">
      {/* Header */}
      <div>
        <h1 className="font-display text-4xl tracking-wide text-foreground">
          SETTINGS
        </h1>
        <p className="text-muted-foreground mt-1">
          Manage your account and preferences
        </p>
      </div>

      {/* Profile Section */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <User className="h-5 w-5" />
            Profile
          </CardTitle>
          <CardDescription>
            Your account information and display preferences
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="flex items-center gap-6">
            <Avatar className="h-20 w-20 border-4 border-primary/20">
              <AvatarImage src={profile?.avatar_url || undefined} />
              <AvatarFallback className="bg-primary/10 text-primary text-2xl font-display">
                {initials}
              </AvatarFallback>
            </Avatar>
            <div>
              <h3 className="text-xl font-semibold">{profile?.display_name || "User"}</h3>
              {profile?.peloton_username && (
                <p className="text-muted-foreground">@{profile.peloton_username}</p>
              )}
            </div>
          </div>

          <Separator />

          <div className="grid gap-4">
            <div className="grid gap-2">
              <Label htmlFor="displayName">Display Name</Label>
              <Input
                id="displayName"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="Your name"
              />
            </div>
          </div>

          <Button disabled={isSaving} onClick={handleSaveProfile}>
            {isSaving ? "Saving..." : "Save Changes"}
          </Button>
        </CardContent>
      </Card>

      {/* Peloton Connection */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Link2 className="h-5 w-5" />
            Peloton Connection
          </CardTitle>
          <CardDescription>
            Manage your Peloton account connection
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              {isLoading ? (
                <>
                  <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted">
                    <Loader2 className="h-6 w-6 text-muted-foreground animate-spin" />
                  </div>
                  <div>
                    <p className="font-medium">Loading...</p>
                    <p className="text-sm text-muted-foreground">
                      Checking connection status
                    </p>
                  </div>
                </>
              ) : isPelotonConnected ? (
                <>
                  <div className={cn(
                    "flex h-12 w-12 items-center justify-center rounded-full",
                    pelotonTokenStatus === "expired" ? "bg-amber-500/10" : "bg-green-500/10"
                  )}>
                    {pelotonTokenStatus === "expired" ? (
                      <AlertCircle className="h-6 w-6 text-amber-500" />
                    ) : (
                      <CheckCircle2 className="h-6 w-6 text-green-500" />
                    )}
                  </div>
                  <div>
                    <div className="font-medium flex items-center gap-2">
                      {pelotonTokenStatus === "expired" ? "Session Expired" : "Connected"}
                      {pelotonTokenStatus === "expired" && (
                        <Badge variant="outline" className="text-amber-500 border-amber-500/50">
                          Reconnect needed
                        </Badge>
                      )}
                    </div>
                    <p className="text-sm text-muted-foreground">
                      @{profile?.peloton_username}
                    </p>
                  </div>
                </>
              ) : (
                <>
                  <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted">
                    <AlertCircle className="h-6 w-6 text-muted-foreground" />
                  </div>
                  <div>
                    <p className="font-medium">Not Connected</p>
                    <p className="text-sm text-muted-foreground">
                      Connect your Peloton account to sync data
                    </p>
                  </div>
                </>
              )}
            </div>
            {!isLoading && (
              isPelotonConnected ? (
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    className="gap-2"
                    onClick={handleRefreshToken}
                  >
                    <RefreshCw className="h-4 w-4" />
                    {pelotonTokenStatus === "expired" ? "Reconnect" : "Refresh Token"}
                  </Button>
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={handleDisconnectPeloton}
                  >
                    Disconnect
                  </Button>
                </div>
              ) : (
                <Button
                  onClick={() => window.open("https://members.onepeloton.com", "_blank")}
                  disabled={isConnecting}
                  className="gap-2"
                >
                  {isConnecting ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Connecting...
                    </>
                  ) : (
                    <>
                      <ExternalLink className="h-4 w-4" />
                      Connect Peloton
                    </>
                  )}
                </Button>
              )
            )}
          </div>

          {connectionError && (
            <div className="mt-4 rounded-md bg-destructive/10 p-3 text-sm text-destructive flex items-start gap-2">
              <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
              {connectionError}
            </div>
          )}

          {!isPelotonConnected && !isConnecting && !isLoading && (
            <div className="mt-6 rounded-lg border border-dashed border-border/50 bg-secondary/20 p-4">
              <h4 className="font-medium mb-2">How to connect:</h4>
              <ol className="text-sm text-muted-foreground space-y-2 list-decimal list-inside">
                <li>Install the <strong>Clip In browser extension</strong></li>
                <li>Click &quot;Connect Peloton&quot; above to open Peloton</li>
                <li>Log in to your Peloton account</li>
                <li>Click the Clip In extension icon and select &quot;Connect to Clip In&quot;</li>
              </ol>
              <p className="text-xs text-muted-foreground mt-3">
                The extension securely reads your login token - your password is never shared.
              </p>

              <Separator className="my-4" />

              <button
                onClick={() => setShowManualConnect(!showManualConnect)}
                className="text-sm text-muted-foreground hover:text-foreground flex items-center gap-1"
              >
                {showManualConnect ? "Hide" : "Show"} manual connection (advanced)
              </button>

              {showManualConnect && (
                <div className="mt-4 space-y-3">
                  <p className="text-sm text-muted-foreground">
                    If you can&apos;t install the extension, you can manually copy your token:
                  </p>
                  <ol className="text-sm text-muted-foreground space-y-2 list-decimal list-inside">
                    <li>Go to <strong>members.onepeloton.com</strong> and log in</li>
                    <li>Open browser dev tools (F12 or Cmd+Option+I)</li>
                    <li>Go to the Console tab and paste this snippet:</li>
                  </ol>
                  <pre className="text-xs bg-background/50 p-2 rounded border overflow-x-auto">
                    {consoleSnippet}
                  </pre>
                  <p className="text-sm text-muted-foreground">
                    Press Enter - the token will be copied to your clipboard. Paste it below:
                  </p>
                  <div className="flex gap-2">
                    <Input
                      type="password"
                      value={manualToken}
                      onChange={(e) => setManualToken(e.target.value)}
                      placeholder="Paste your token here"
                      className="flex-1"
                    />
                    <Button
                      onClick={handleManualConnect}
                      disabled={!manualToken.trim() || isConnecting}
                    >
                      {isConnecting ? (
                        <>
                          <Loader2 className="h-4 w-4 animate-spin mr-2" />
                          Connecting...
                        </>
                      ) : (
                        "Connect"
                      )}
                    </Button>
                  </div>
                </div>
              )}
            </div>
          )}

          {isPelotonConnected && pelotonTokenStatus === "expired" && (
            <div className="mt-6 rounded-lg border border-amber-500/30 bg-amber-500/5 p-4">
              <h4 className="font-medium text-amber-500 mb-2">Connection Expired</h4>
              <p className="text-sm text-muted-foreground mb-4">
                Your Peloton session has expired. To reconnect:
              </p>
              <ol className="text-sm text-muted-foreground space-y-1 list-decimal list-inside mb-4">
                <li>Click &quot;Reconnect&quot; above to open Peloton</li>
                <li>Make sure you&apos;re logged in</li>
                <li>Click the Clip In extension and select &quot;Connect to Clip In&quot;</li>
              </ol>
              <p className="text-xs text-muted-foreground">
                Sessions typically expire after 24-48 hours of inactivity.
              </p>
            </div>
          )}

          {isPelotonConnected && pelotonTokenStatus !== "expired" && (
            <>
              <Separator className="my-6" />
              <div className="rounded-lg border border-border/50 bg-secondary/30 p-4">
                <div className="flex items-start justify-between">
                  <div>
                    <h4 className="font-medium mb-2">Current FTP</h4>
                    <div className="flex items-baseline gap-2">
                      <span className="text-3xl font-display">
                        {profile?.current_ftp || "—"}
                      </span>
                      <span className="text-muted-foreground">watts</span>
                    </div>
                    {profile?.estimated_ftp && (
                      <p className="text-sm text-muted-foreground mt-1">
                        Estimated: {profile.estimated_ftp}w
                      </p>
                    )}
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    className="gap-2"
                    onClick={handleSyncFtp}
                    disabled={isSyncingFtp}
                  >
                    {isSyncingFtp ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Syncing...
                      </>
                    ) : (
                      <>
                        <RefreshCw className="h-4 w-4" />
                        Sync FTP
                      </>
                    )}
                  </Button>
                </div>
                {syncMessage && (
                  <p className={cn(
                    "text-sm mt-3",
                    syncMessage.includes("failed") || syncMessage.includes("expired")
                      ? "text-destructive"
                      : "text-muted-foreground"
                  )}>
                    {syncMessage}
                  </p>
                )}
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* Stack Automation */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Clock className="h-5 w-5" />
            Stack Automation
          </CardTitle>
          <CardDescription>
            Configure automatic stack push settings
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-2">
            <Label>Daily Push Time</Label>
            <p className="text-sm text-muted-foreground mb-2">
              Planned workouts will be pushed to your Peloton stack at this time each day.
            </p>
            <Select value={stackPushTime} onValueChange={setStackPushTime}>
              <SelectTrigger className="w-[200px]">
                <SelectValue placeholder="Select time" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="00:00">12:00 AM (Midnight)</SelectItem>
                <SelectItem value="05:00">5:00 AM</SelectItem>
                <SelectItem value="06:00">6:00 AM</SelectItem>
                <SelectItem value="20:00">8:00 PM</SelectItem>
                <SelectItem value="21:00">9:00 PM</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Appearance */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            {mounted && (theme === "dark" ? <Moon className="h-5 w-5" /> : <Sun className="h-5 w-5" />)}
            Appearance
          </CardTitle>
          <CardDescription>
            Customize how Clip In looks
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex gap-4">
            {[
              { value: "light", label: "Light", icon: Sun },
              { value: "dark", label: "Dark", icon: Moon },
              { value: "system", label: "System", icon: Shield },
            ].map((option) => {
              const isSelected = mounted && theme === option.value;
              return (
                <button
                  key={option.value}
                  onClick={() => setTheme(option.value)}
                  className={cn(
                    "flex flex-col items-center gap-2 rounded-lg border p-4 transition-all",
                    isSelected
                      ? "border-primary bg-primary/5"
                      : "border-border hover:border-primary/50"
                  )}
                >
                  <option.icon className={cn(
                    "h-6 w-6",
                    isSelected ? "text-primary" : "text-muted-foreground"
                  )} />
                  <span className={cn(
                    "text-sm font-medium",
                    isSelected ? "text-primary" : "text-muted-foreground"
                  )}>
                    {option.label}
                  </span>
                </button>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Notifications */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Bell className="h-5 w-5" />
            Notifications
          </CardTitle>
          <CardDescription>
            Manage your notification preferences
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium">Stack Push Reminders</p>
                <p className="text-sm text-muted-foreground">
                  Get notified when your stack is updated
                </p>
              </div>
              <Badge variant="secondary">Coming Soon</Badge>
            </div>
            <Separator />
            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium">Workout Reminders</p>
                <p className="text-sm text-muted-foreground">
                  Remind me about planned workouts
                </p>
              </div>
              <Badge variant="secondary">Coming Soon</Badge>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Danger Zone */}
      <Card className="border-destructive/50">
        <CardHeader>
          <CardTitle className="text-destructive">Danger Zone</CardTitle>
          <CardDescription>
            Irreversible actions for your account
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium">Sign Out</p>
              <p className="text-sm text-muted-foreground">
                Sign out of your Clip In account
              </p>
            </div>
            <Button variant="outline" onClick={handleSignOut} disabled={isSigningOut} className="gap-2">
              {isSigningOut ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Signing out...
                </>
              ) : (
                <>
                  <LogOut className="h-4 w-4" />
                  Sign Out
                </>
              )}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
