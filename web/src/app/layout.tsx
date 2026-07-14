import type { Metadata } from "next";
import { Inter, Outfit, Russo_One } from "next/font/google";
import "./globals.css";
import { ProgressionProvider } from "@/context/ProgressionContext";
import GlobalBackground from "@/components/shell/GlobalBackground.view";

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
        className={`${inter.variable} ${outfit.variable} ${russo.variable}`}
        suppressHydrationWarning
      >
        <ProgressionProvider>
          <GlobalBackground />
          {children}
        </ProgressionProvider>
      </body>
    </html>
  );
}
