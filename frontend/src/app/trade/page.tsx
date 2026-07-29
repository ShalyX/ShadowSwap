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

type Tab = "trade" | "vault" | "compliance";

export default function TradePage() {
  const [isAdmin, setIsAdmin] = useState(false);
  const [activeTab, setActiveTab] = useState<Tab>("trade");
  const [mounted, setMounted] = useState(false);
  const config = deployments.config as { executorSecurityVersion?: number; batchWindowSeconds?: number };

  useEffect(() => {
    setMounted(true);
    const handleKeyDown = (event: KeyboardEvent) => {
      if ((event.altKey && event.key.toLowerCase() === "a") || (event.ctrlKey && event.shiftKey && event.key.toLowerCase() === "a")) {
        event.preventDefault();
        setIsAdmin((current) => !current);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  return (
    <main className="container trade-shell">
      <Header />
      <NetworkGuard />

      <div className="product-head">
        <div>
          <div className="eyebrow">Confidential intent desk</div>
          <h1>Trade privately before settlement.</h1>
        </div>
        <div className="product-health" aria-label="Deployment status">
          <span className="badge"><span className="pulse-dot" />Sepolia live</span>
          <span className="badge">Executor v{config.executorSecurityVersion}</span>
          <span className="badge mono">{config.batchWindowSeconds}s window</span>
        </div>
      </div>

      <div className="product-tabs">
        <div className="tab-list" role="tablist" aria-label="Trade tools">
          {([['trade', 'Swap'], ['vault', 'Balances'], ['compliance', 'Auditor']] as [Tab, string][]).map(([id, label]) => (
            <button key={id} role="tab" aria-selected={activeTab === id} className={`product-tab ${activeTab === id ? "is-active" : ""}`} onClick={() => setActiveTab(id)}>{label}</button>
          ))}
        </div>
        <button className={`operator-toggle ${isAdmin ? "is-active" : ""}`} onClick={() => setIsAdmin((value) => !value)} title="Toggle authorized solver tools">{isAdmin ? "Hide solver tools" : "Solver tools"}</button>
      </div>

      <div className="trade-workspace">
        {!mounted ? (
          <div className="product-empty">Loading wallet state…</div>
        ) : activeTab === "trade" ? (
          <div className="grid-2">
            <SwapDesk />
            {isAdmin ? <BatchDesk /> : <UnwrapDesk />}
          </div>
        ) : activeTab === "vault" ? (
          <div style={{ maxWidth: 680 }}><UnwrapDesk /></div>
        ) : (
          <div style={{ maxWidth: 780 }}><PrivacyPanel /></div>
        )}
      </div>
    </main>
  );
}
