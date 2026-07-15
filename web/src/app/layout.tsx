import type { Metadata } from "next";
import { Inter, Outfit, Russo_One } from "next/font/google";
import "./globals.css";
import { ProgressionProvider } from "@/context/ProgressionContext";
import GlobalBackground from "@/components/shell/GlobalBackground.view";
import AppNav from "@/components/shell/AppNav.view";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });
const outfit = Outfit({ subsets: ["latin"], variable: "--font-outfit" });
const russo = Russo_One({ weight: "400", subsets: ["latin"], variable: "--font-russo" });

export const metadata: Metadata = {
  title: "Yu-Gi-Oh! Progression Series",
  description: "Track your progression series journey",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={`${inter.variable} ${outfit.variable} ${russo.variable} h-screen overflow-hidden grid grid-rows-[auto_1fr]`}
        suppressHydrationWarning
      >
        <ProgressionProvider>
          <GlobalBackground />
          {/* Row 1 (auto): the ONE persistent nav. AppNav shows it only on the
              app-zone pages that opted in; it never unmounts or animates across
              those navigations, so it stays identical. */}
          <AppNav />
          {/* Row 2 (1fr): the routed page. min-h-0/min-w-0 let a page's own
              inner scroll containers work; relative anchors deck-builder's
              absolutely-positioned ScaleWrapper to this row (below the nav). */}
          <main className="relative min-h-0 min-w-0">{children}</main>
        </ProgressionProvider>
      </body>
    </html>
  );
}
