import type { Metadata } from "next";
import AppChrome from "@/components/AppChrome";
import { ViewModeProvider } from "@/lib/viewMode";
import "./globals.css";

export const metadata: Metadata = {
  title: "Better View Estimates",
  description: "Better View Solutions project estimates and catalog-backed quoting",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        <ViewModeProvider>
          <AppChrome>{children}</AppChrome>
        </ViewModeProvider>
      </body>
    </html>
  );
}
