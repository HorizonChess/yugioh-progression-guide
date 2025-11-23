import type { Metadata } from "next";
import { Inter, Outfit } from "next/font/google";
import "./globals.css";
import { ProgressionProvider } from "@/context/ProgressionContext";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });
const outfit = Outfit({ subsets: ["latin"], variable: "--font-outfit" });

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
        className={`${inter.variable} ${outfit.variable}`}
        suppressHydrationWarning
      >
        <ProgressionProvider>
          {children}
        </ProgressionProvider>
      </body>
    </html>
  );
}
