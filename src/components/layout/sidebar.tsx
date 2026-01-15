"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  TrendingUp,
  CalendarDays,
  Search,
  Settings,
  Zap,
} from "lucide-react";
import { cn } from "@/lib/utils";

const navItems = [
  {
    label: "Dashboard",
    href: "/home",
    icon: LayoutDashboard,
  },
  {
    label: "FTP Tracker",
    href: "/ftp",
    icon: TrendingUp,
  },
  {
    label: "Weekly Planner",
    href: "/planner",
    icon: CalendarDays,
  },
  {
    label: "Class Search",
    href: "/search",
    icon: Search,
  },
  {
    label: "Settings",
    href: "/settings",
    icon: Settings,
  },
];

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="fixed left-0 top-0 z-40 h-screen w-[var(--sidebar-width)] border-r border-border/50 bg-card/50 backdrop-blur-xl">
      {/* Logo */}
      <div className="flex h-[var(--header-height)] items-center gap-3 border-b border-border/50 px-6">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary glow-primary-sm">
          <Zap className="h-5 w-5 text-primary-foreground" />
        </div>
        <div>
          <h1 className="font-display text-2xl tracking-wide text-foreground">
            CLIP IN
          </h1>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex flex-col gap-1 p-4">
        <div className="mb-2 px-4 text-xs font-medium uppercase tracking-wider text-muted-foreground">
          Main Menu
        </div>
        {navItems.map((item) => {
          const isActive =
            pathname === item.href ||
            (item.href !== "/home" && pathname?.startsWith(item.href));
          const Icon = item.icon;

          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn("nav-item group", isActive && "active")}
            >
              <Icon
                className={cn(
                  "h-5 w-5 transition-transform duration-200 group-hover:scale-110",
                  isActive && "text-primary"
                )}
              />
              <span className="font-medium">{item.label}</span>
            </Link>
          );
        })}
      </nav>

      {/* Bottom section - Pro upgrade card */}
      <div className="absolute bottom-0 left-0 right-0 p-4">
        <div className="relative overflow-hidden rounded-xl border border-primary/20 bg-gradient-to-br from-primary/10 via-primary/5 to-transparent p-4">
          <div className="absolute -right-4 -top-4 h-20 w-20 rounded-full bg-primary/10 blur-2xl" />
          <div className="relative">
            <div className="mb-2 text-sm font-semibold text-foreground">
              Upgrade to Pro
            </div>
            <p className="mb-3 text-xs text-muted-foreground">
              Unlock advanced analytics and unlimited stack automation
            </p>
            <button className="w-full rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition-all duration-200 hover:bg-primary/90 glow-primary-sm">
              Get Started
            </button>
          </div>
        </div>
      </div>
    </aside>
  );
}
