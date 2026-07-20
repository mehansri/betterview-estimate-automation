import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Window AI Quote Builder",
  description: "Instant window quote estimates from historical manufacturer data",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        <div className="min-h-screen">
          <header className="border-b border-slate-200 bg-white">
            <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-brand-600">
                  Betterview · Window AI
                </p>
                <h1 className="text-lg font-semibold text-slate-900">
                  Instant Quote Builder
                </h1>
              </div>
              <p className="hidden text-sm text-slate-500 sm:block">
                Target accuracy ±3–4%
              </p>
            </div>
          </header>
          <main className="mx-auto max-w-6xl px-4 py-8">{children}</main>
        </div>
      </body>
    </html>
  );
}
