import type { Metadata } from "next";
import { Toaster } from "sonner";
import "./globals.css";

export const metadata: Metadata = {
  title: "Clip In - Peloton Companion App",
  description: "Track your FTP, plan workouts, and automate your Peloton stack",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="antialiased min-h-screen">
        {children}
        <Toaster richColors position="bottom-right" />
      </body>
    </html>
  );
}
