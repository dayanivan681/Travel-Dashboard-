import type { Metadata } from "next";
import { Inter } from "next/font/google";
import Link from "next/link";
import { StoreProvider } from "@/lib/store";
import "./globals.css";

const inter = Inter({ subsets: ["latin"], variable: "--font-sans" });

export const metadata: Metadata = {
  title: "Travel OS",
  description:
    "Plan smarter trips — ideas, decisions, bookings, budgets, and schedules in one place.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className={`${inter.variable} font-sans`}>
        <StoreProvider>
          <header className="sticky top-0 z-40 border-b border-ink-200/70 bg-white/80 backdrop-blur-md">
            <div className="mx-auto flex h-16 max-w-5xl items-center justify-between px-4">
              <Link href="/" className="flex items-center gap-2 text-[15px] font-semibold tracking-tight">
                <span className="text-xl">🧭</span>
                <span>Travel OS</span>
                <span className="hidden text-xs font-normal text-ink-400 sm:inline">
                  by Fable
                </span>
              </Link>
              <nav className="flex items-center gap-1 text-sm">
                <Link href="/" className="btn-ghost">
                  Trips
                </Link>
                <Link href="/settings" className="btn-ghost">
                  Settings
                </Link>
              </nav>
            </div>
          </header>
          <main className="mx-auto max-w-5xl px-4 py-8">{children}</main>
        </StoreProvider>
      </body>
    </html>
  );
}
