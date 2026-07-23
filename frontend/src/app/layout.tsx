import type { Metadata } from "next";
import { Inter, Space_Mono } from "next/font/google";
import "./globals.css";
import { Providers } from "./providers";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });
const spaceMono = Space_Mono({ 
  weight: ["400", "700"],
  subsets: ["latin"], 
  variable: "--font-space-mono" 
});

export const metadata: Metadata = {
  title: "ShadowSwap — Private AMM Routing on Nox",
  description:
    "Route Uniswap-style swaps through iExec Nox: encrypted sizes, batch netting, auditor ACL. WTF Hackathon Summer Edition.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${inter.variable} ${spaceMono.variable}`}>
      <body style={{ fontFamily: "var(--font-inter), sans-serif" }}>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
