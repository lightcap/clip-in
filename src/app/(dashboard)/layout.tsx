import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Sidebar } from "@/components/layout/sidebar";
import { Header } from "@/components/layout/header";
import { AuthProvider } from "@/components/providers/auth-provider";
import { ThemeProvider } from "@/components/providers/theme-provider";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  return (
    <ThemeProvider
      attribute="class"
      defaultTheme="dark"
      enableSystem
      disableTransitionOnChange
    >
      <AuthProvider>
        <div className="relative min-h-screen bg-background noise-overlay">
          {/* Gradient mesh background */}
          <div className="fixed inset-0 gradient-mesh pointer-events-none" />

          {/* Sidebar */}
          <Sidebar />

          {/* Main content area */}
          <div
            className="relative"
            style={{ marginLeft: "var(--sidebar-width)" }}
          >
            {/* Header */}
            <Header />

            {/* Page content */}
            <main
              className="relative px-6 py-6"
              style={{ paddingTop: "calc(var(--header-height) + 24px)" }}
            >
              {children}
            </main>
          </div>
        </div>
      </AuthProvider>
    </ThemeProvider>
  );
}
