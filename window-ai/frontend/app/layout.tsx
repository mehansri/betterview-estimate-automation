import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = {
  title: "Window AI Pricing Platform",
  description:
    "Historical pricing, similarity search, and quote estimates from manufacturer data",
};

const nav = [
  { href: "/", label: "Quote" },
  { href: "/doors", label: "Doors" },
  { href: "/admin/estimates", label: "Estimates" },
  { href: "/admin/windows", label: "Windows" },
  { href: "/admin/analytics", label: "Analytics" },
  { href: "/admin/similar", label: "Similar" },
];

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
            <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-4 py-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-brand-600">
                  Betterview · Window AI
                </p>
                <h1 className="text-lg font-semibold text-slate-900">
                  Pricing Platform
                </h1>
              </div>
              <nav className="flex flex-wrap gap-1 text-sm">
                {nav.map((item) => (
                  <Link
                    key={item.href}
                    href={item.href}
                    className="rounded-lg px-3 py-1.5 font-medium text-slate-600 hover:bg-slate-100 hover:text-slate-900"
                  >
                    {item.label}
                  </Link>
                ))}
              </nav>
            </div>
          </header>
          <main className="mx-auto max-w-6xl px-4 py-8">{children}</main>
        </div>
      </body>
    </html>
  );
}
