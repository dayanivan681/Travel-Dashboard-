import type { Metadata } from "next";
import Link from "next/link";
import { StoreProvider } from "@/lib/store";
import "./globals.css";

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
      <body>
        <StoreProvider>
          <header className="sticky top-0 z-40 border-b border-ink-200 bg-white/90 backdrop-blur">
            <div className="mx-auto flex h-14 max-w-5xl items-center justify-between px-4">
              <Link href="/" className="flex items-center gap-2 font-semibold">
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
          <main className="mx-auto max-w-5xl px-4 py-6">{children}</main>
        </StoreProvider>
      </body>
    </html>
  );
}
