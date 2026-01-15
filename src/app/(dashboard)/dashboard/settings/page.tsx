"use client";

import { useState } from "react";
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
  const { profile, isPelotonConnected } = useAuthStore();
  const { theme, setTheme } = useTheme();
  const router = useRouter();
  const [isSaving, setIsSaving] = useState(false);
  const [stackPushTime, setStackPushTime] = useState("00:00");

  const initials = profile?.display_name
    ?.split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase() || "U";

  const handleSignOut = async () => {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/login");
  };

  const handleDisconnectPeloton = async () => {
    // TODO: Implement disconnect
  };

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
                defaultValue={profile?.display_name || ""}
                placeholder="Your name"
              />
            </div>
          </div>

          <Button disabled={isSaving}>
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
              {isPelotonConnected ? (
                <>
                  <div className="flex h-12 w-12 items-center justify-center rounded-full bg-green-500/10">
                    <CheckCircle2 className="h-6 w-6 text-green-500" />
                  </div>
                  <div>
                    <p className="font-medium">Connected</p>
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
            {isPelotonConnected ? (
              <div className="flex gap-2">
                <Button variant="outline" size="sm" className="gap-2">
                  <RefreshCw className="h-4 w-4" />
                  Refresh Token
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
              <Button>Connect Peloton</Button>
            )}
          </div>

          {isPelotonConnected && (
            <>
              <Separator className="my-6" />
              <div className="rounded-lg border border-border/50 bg-secondary/30 p-4">
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
            {theme === "dark" ? <Moon className="h-5 w-5" /> : <Sun className="h-5 w-5" />}
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
            ].map((option) => (
              <button
                key={option.value}
                onClick={() => setTheme(option.value)}
                className={cn(
                  "flex flex-col items-center gap-2 rounded-lg border p-4 transition-all",
                  theme === option.value
                    ? "border-primary bg-primary/5"
                    : "border-border hover:border-primary/50"
                )}
              >
                <option.icon className={cn(
                  "h-6 w-6",
                  theme === option.value ? "text-primary" : "text-muted-foreground"
                )} />
                <span className={cn(
                  "text-sm font-medium",
                  theme === option.value ? "text-primary" : "text-muted-foreground"
                )}>
                  {option.label}
                </span>
              </button>
            ))}
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
            <Button variant="outline" onClick={handleSignOut} className="gap-2">
              <LogOut className="h-4 w-4" />
              Sign Out
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
