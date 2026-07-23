"use client";

import { Header } from "@/components/Header";
import { NetworkGuard } from "@/components/NetworkGuard";
import { SwapDesk } from "@/components/SwapDesk";
import { BatchDesk } from "@/components/BatchDesk";

export default function TradePage() {
  return (
    <main className="container" style={{ paddingBottom: "4rem" }}>
      <Header />
      <NetworkGuard />
      
      <div style={{ marginBottom: "2rem" }}>
        <h1 style={{ margin: 0, fontSize: "2rem", textTransform: "uppercase", letterSpacing: "0.05em", fontFamily: "var(--font-space-mono)" }}>
          Trade Console
        </h1>
        <p style={{ color: "var(--muted)", margin: "0.5rem 0 0" }}>Submit encrypted intents and execute batched settlements.</p>
      </div>

      <div className="grid-2" style={{ alignItems: "start" }}>
        <SwapDesk />
        <BatchDesk />
      </div>
    </main>
  );
}
