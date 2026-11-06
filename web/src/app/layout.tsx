import type { Metadata } from "next";
import { Cinzel, IM_Fell_English, Inter, Outfit, Russo_One } from "next/font/google";
import "./globals.css";
import { AuthProvider } from "@/context/AuthContext";
import { ProgressionProvider } from "@/context/ProgressionContext";
import { NotificationsProvider } from "@/context/NotificationsContext";
import GlobalBackground from "@/components/layout/GlobalBackground";
import AppNav, { PhoneTabBar } from "@/components/layout/AppNav";
import SeriesGate from "@/components/layout/SeriesGate";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });
const outfit = Outfit({ subsets: ["latin"], variable: "--font-outfit" });
const russo = Russo_One({ weight: "400", subsets: ["latin"], variable: "--font-russo" });
const cinzel = Cinzel({ weight: ["700", "800"], subsets: ["latin"], variable: "--font-cinzel" });
const fell = IM_Fell_English({ weight: "400", style: ["normal", "italic"], subsets: ["latin"], variable: "--font-fell-face" });

const VISIBLE_HEIGHT = `(function(){var d=document.documentElement,v=window.visualViewport;function f(){var h=innerHeight;if(v)h=Math.min(h,v.height*v.scale);d.style.setProperty("--app-h",h+"px")}f();addEventListener("resize",f);if(v)v.addEventListener("resize",f)})()`;

export const metadata: Metadata = {
  title: "Yu-Gi-Oh! Progression Series",
  description: "Track your progression series journey",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // The font variables live on <html> so the :root aliases in globals.css
  // (--font-heading → --font-outfit, …) can resolve them.
  return (
    <html lang="en" className={`${inter.variable} ${outfit.variable} ${russo.variable} ${cinzel.variable} ${fell.variable}`} suppressHydrationWarning>
      <body
        className={`h-screen h-dvh overflow-hidden grid grid-rows-[auto_1fr_auto]`}
        style={{ height: "var(--app-h, 100dvh)" }}
        suppressHydrationWarning
      >
        {/* Some phone browsers (Brave's bottom toolbar, for one) leave 100dvh taller
            than what is visible, which hides the tab bar and the pack opener's
            buttons behind the toolbar. Size the app from what is actually visible. */}
        <script dangerouslySetInnerHTML={{ __html: VISIBLE_HEIGHT }} />
        <AuthProvider>
        <ProgressionProvider>
        <NotificationsProvider>
          <GlobalBackground />
          {/* Row 1 (auto): the ONE persistent nav. AppNav shows it only on the
              app-zone pages that opted in; it never unmounts or animates across
              those navigations, so it stays identical. */}
          <AppNav />
          {/* Row 2 (1fr): the routed page. min-h-0/min-w-0 let a page's own
              inner scroll containers work; relative anchors deck-builder's
              absolutely-positioned ScaleWrapper to this row (below the nav). */}
          <main className="relative row-start-2 min-h-0 min-w-0"><SeriesGate>{children}</SeriesGate></main>
          {/* Row 3 (auto): the phone tab bar, on the same pages as the nav. */}
          <PhoneTabBar />
        </NotificationsProvider>
        </ProgressionProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
