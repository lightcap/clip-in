"use client";

import { Bell, ChevronDown, LogOut, Moon, Sun, Settings } from "lucide-react";
import { useTheme } from "next-themes";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { ConnectPeloton } from "@/components/peloton/connect-peloton";
import { useAuthStore } from "@/lib/stores/auth-store";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";

export function Header() {
  const { theme, setTheme } = useTheme();
  const { profile, isPelotonConnected, pelotonTokenStatus, isLoading } = useAuthStore();
  const router = useRouter();
  const isExpired = pelotonTokenStatus === "expired";

  const handleSignOut = async () => {
    const supabase = createClient();
    await supabase.auth.signOut();
    window.location.replace("/login");
  };

  const initials = profile?.display_name
    ?.split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase() || "U";

  return (
    <header className="fixed right-0 top-0 z-30 flex h-[var(--header-height)] items-center justify-between border-b border-border/50 bg-background/80 backdrop-blur-xl px-6" style={{ left: 'var(--sidebar-width)' }}>
      {/* Left side - Page context */}
      <div className="flex items-center gap-4">
        {/* This can be populated by each page */}
      </div>

      {/* Right side - Actions */}
      <div className="flex items-center gap-3">
        {/* Peloton Connection Status */}
        <div className="flex items-center gap-2 rounded-full border border-border/50 bg-secondary/50 px-4 py-2">
          {isLoading ? (
            <>
              <div className="h-2 w-2 rounded-full bg-muted-foreground/50 animate-pulse" />
              <span className="text-sm font-medium text-muted-foreground">
                Checking...
              </span>
            </>
          ) : isPelotonConnected && !isExpired ? (
            <>
              <div className="pulse-dot h-2 w-2 rounded-full bg-green-500" />
              <span className="text-sm font-medium text-foreground">
                Peloton Connected
              </span>
            </>
          ) : isPelotonConnected && isExpired ? (
            <>
              <div className="h-2 w-2 rounded-full bg-amber-500" />
              <span className="text-sm font-medium text-foreground">
                Peloton Disconnected
              </span>
            </>
          ) : (
            <ConnectPeloton />
          )}
        </div>

        {/* Theme Toggle */}
        <Button
          variant="ghost"
          size="icon"
          className="h-10 w-10 rounded-full"
          onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
        >
          <Sun className="h-5 w-5 rotate-0 scale-100 transition-transform dark:-rotate-90 dark:scale-0" />
          <Moon className="absolute h-5 w-5 rotate-90 scale-0 transition-transform dark:rotate-0 dark:scale-100" />
          <span className="sr-only">Toggle theme</span>
        </Button>

        {/* Notifications */}
        <Button
          variant="ghost"
          size="icon"
          className="relative h-10 w-10 rounded-full"
        >
          <Bell className="h-5 w-5" />
          <span className="absolute right-2 top-2 h-2 w-2 rounded-full bg-primary" />
          <span className="sr-only">Notifications</span>
        </Button>

        {/* User Menu */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="flex items-center gap-2 rounded-full border border-border/50 bg-secondary/50 p-1 pr-3 transition-colors hover:bg-secondary">
              <Avatar className="h-8 w-8 border-2 border-primary/20">
                <AvatarImage src={profile?.avatar_url || undefined} />
                <AvatarFallback className="bg-primary/10 text-primary text-sm font-semibold">
                  {initials}
                </AvatarFallback>
              </Avatar>
              <span className="text-sm font-medium">
                {profile?.display_name || "User"}
              </span>
              <ChevronDown className="h-4 w-4 text-muted-foreground" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuLabel className="font-normal">
              <div className="flex flex-col space-y-1">
                <p className="text-sm font-medium">
                  {profile?.display_name || "User"}
                </p>
                {profile?.peloton_username && (
                  <p className="text-xs text-muted-foreground">
                    @{profile.peloton_username}
                  </p>
                )}
              </div>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => router.push("/settings")}>
              <Settings className="mr-2 h-4 w-4" />
              Settings
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={handleSignOut}
              className="text-destructive focus:text-destructive"
            >
              <LogOut className="mr-2 h-4 w-4" />
              Sign out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
