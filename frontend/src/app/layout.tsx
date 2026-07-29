import type { Metadata } from "next";
import { Archivo_Black, IBM_Plex_Sans, Space_Mono } from "next/font/google";
import "./globals.css";
import { Providers } from "./providers";

const archivoBlack = Archivo_Black({
  weight: "400",
  subsets: ["latin"],
  variable: "--font-display",
});
const plex = IBM_Plex_Sans({
  weight: ["400", "500", "600"],
  subsets: ["latin"],
  variable: "--font-body",
});
const spaceMono = Space_Mono({ 
  weight: ["400", "700"],
  subsets: ["latin"], 
  variable: "--font-space-mono" 
});

export const metadata: Metadata = {
  title: "ShadowSwap — Private AMM Routing on Nox",
  description:
    "Route demo AMM swaps through iExec Nox: encrypted resting parameters, same-pair aggregation, and auditor ACL.",
  icons: {
    icon: "/logo.jpg",
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${archivoBlack.variable} ${plex.variable} ${spaceMono.variable}`}>
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
