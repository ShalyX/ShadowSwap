"use client";

export const dynamic = "force-dynamic";

import { useEffect, useState } from "react";
import { Header } from "@/components/Header";
import { NetworkGuard } from "@/components/NetworkGuard";
import { SwapDesk } from "@/components/SwapDesk";
import { BatchDesk } from "@/components/BatchDesk";
import { UnwrapDesk } from "@/components/UnwrapDesk";
import { PrivacyPanel } from "@/components/PrivacyPanel";
import deployments from "@/lib/deployments.json";

type Surface = "trade" | "vault" | "compliance";

export default function TradePage() {
  const [isAdmin, setIsAdmin] = useState(false);
  const [activeTab, setActiveTab] = useState<Surface>("trade");
  const [mounted, setMounted] = useState(false);
  const config = deployments.config as { executorSecurityVersion?: number; batchWindowSeconds?: number };

  useEffect(() => {
    setMounted(true);
    const handleKeyDown = (event: KeyboardEvent) => {
      if ((event.altKey && event.key.toLowerCase() === "a") || (event.ctrlKey && event.shiftKey && event.key.toLowerCase() === "a")) {
        event.preventDefault();
        setIsAdmin((value) => !value);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  return (
    <main className="veil-site trade-page">
      <div className="veil-shell">
        <Header />
        <NetworkGuard />

        <section className="trade-heading">
          <div>
            <span className="section-label">THE VEIL · LIVE INSTRUMENT</span>
            <h1>Place the order<br />above the line.</h1>
          </div>
          <p>Amount and minimum output stay encrypted while queued. Settlement crosses into public execution.</p>
        </section>

        <div className="instrument-nav" role="tablist" aria-label="Trade tools">
          {(["trade", "vault", "compliance"] as Surface[]).map((tab) => (
            <button
              key={tab}
              role="tab"
              aria-selected={activeTab === tab}
              onClick={() => setActiveTab(tab)}
            >
              {tab === "trade" ? "Order" : tab === "vault" ? "Balance" : "Auditor"}
            </button>
          ))}
          <div className="instrument-facts">
            <span>Sepolia</span>
            <span>Executor v{config.executorSecurityVersion ?? "?"}</span>
            <span>{config.batchWindowSeconds ?? 300}s window</span>
          </div>
        </div>

        {!mounted ? (
          <div className="instrument-loading">Preparing the instrument</div>
        ) : activeTab === "trade" ? (
          isAdmin ? (
            <div className="solver-instrument"><BatchDesk /></div>
          ) : (
            <div className="trade-instrument-grid">
              <SwapDesk />
              <aside className="side-instrument"><UnwrapDesk /></aside>
            </div>
          )
        ) : activeTab === "vault" ? (
          <div className="single-instrument"><UnwrapDesk /></div>
        ) : (
          <div className="single-instrument"><PrivacyPanel /></div>
        )}

        <div className="operator-line">
          <span>Solver execution is operational infrastructure, not the trading interface.</span>
          <button onClick={() => setIsAdmin((value) => !value)}>{isAdmin ? "Hide solver" : "Solver tools · Alt+A"}</button>
        </div>
      </div>
    </main>
  );
}
