import type { Metadata } from "next";
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
      </body>
    </html>
  );
}
