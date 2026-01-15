import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import Link from "next/link";
import { Zap, TrendingUp, Calendar, Search, ArrowRight } from "lucide-react";

export default async function HomePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user) {
    redirect("/home");
  }

  return (
    <div className="min-h-screen bg-[#0a0a0c] text-white noise-overlay">
      {/* Gradient background */}
      <div className="fixed inset-0 gradient-mesh opacity-50 pointer-events-none" />

      {/* Navigation */}
      <nav className="relative z-10 flex items-center justify-between px-8 py-6">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary">
            <Zap className="h-5 w-5 text-white" />
          </div>
          <span className="font-display text-2xl tracking-wide">CLIP IN</span>
        </div>
        <div className="flex items-center gap-4">
          <Link
            href="/login"
            className="px-4 py-2 text-sm font-medium text-white/80 hover:text-white transition-colors"
          >
            Sign In
          </Link>
          <Link
            href="/signup"
            className="px-5 py-2.5 text-sm font-semibold bg-primary rounded-lg hover:bg-primary/90 transition-colors glow-primary-sm"
          >
            Get Started
          </Link>
        </div>
      </nav>

      {/* Hero Section */}
      <main className="relative z-10 flex flex-col items-center justify-center px-8 pt-24 pb-32">
        <div className="relative mb-12">
          <div className="absolute -inset-16 rounded-full bg-primary/30 blur-[100px]" />
          <div className="relative flex h-28 w-28 items-center justify-center rounded-3xl bg-primary glow-primary">
            <Zap className="h-14 w-14 text-white" />
          </div>
        </div>

        <h1 className="font-display text-6xl md:text-8xl tracking-wide text-center mb-6">
          YOUR PELOTON
          <br />
          <span className="text-primary">SUPERCHARGED</span>
        </h1>

        <p className="text-xl text-white/60 max-w-2xl text-center mb-12">
          Track your FTP progress, plan workouts with precision, and automate your stack.
          The companion app serious Peloton athletes deserve.
        </p>

        <div className="flex gap-4">
          <Link
            href="/signup"
            className="group flex items-center gap-2 px-8 py-4 text-lg font-semibold bg-primary rounded-xl hover:bg-primary/90 transition-all glow-primary"
          >
            Start Free Trial
            <ArrowRight className="h-5 w-5 transition-transform group-hover:translate-x-1" />
          </Link>
          <Link
            href="/login"
            className="px-8 py-4 text-lg font-semibold border border-white/20 rounded-xl hover:bg-white/5 transition-colors"
          >
            Sign In
          </Link>
        </div>
      </main>

      {/* Features Grid */}
      <section className="relative z-10 px-8 pb-32">
        <div className="max-w-6xl mx-auto">
          <h2 className="font-display text-4xl tracking-wide text-center mb-16">
            EVERYTHING YOU NEED
          </h2>

          <div className="grid md:grid-cols-3 gap-6">
            {[
              {
                icon: TrendingUp,
                title: "FTP Tracking",
                description:
                  "Visualize your power progress over time with detailed FTP history and trend analysis.",
              },
              {
                icon: Calendar,
                title: "Smart Planning",
                description:
                  "Plan your workouts for the week ahead and never miss a session with flexible scheduling.",
              },
              {
                icon: Search,
                title: "Advanced Search",
                description:
                  "Find the perfect class by targeting specific muscles, duration, or difficulty level.",
              },
            ].map((feature, i) => (
              <div
                key={i}
                className="group relative overflow-hidden rounded-2xl border border-white/10 bg-white/5 p-8 backdrop-blur-sm transition-all hover:border-primary/30 hover:bg-white/10"
              >
                <div className="absolute -right-8 -top-8 h-32 w-32 rounded-full bg-primary/10 blur-3xl transition-all group-hover:bg-primary/20" />
                <feature.icon className="h-10 w-10 text-primary mb-6" />
                <h3 className="font-display text-2xl tracking-wide mb-3">
                  {feature.title}
                </h3>
                <p className="text-white/60">{feature.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="relative z-10 border-t border-white/10 px-8 py-8">
        <div className="flex items-center justify-between max-w-6xl mx-auto">
          <div className="flex items-center gap-2 text-white/40 text-sm">
            <Zap className="h-4 w-4" />
            <span>Clip In</span>
          </div>
          <p className="text-white/40 text-sm">
            Not affiliated with Peloton Interactive, Inc.
          </p>
        </div>
      </footer>
    </div>
  );
}
