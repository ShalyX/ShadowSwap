"use client";

export const dynamic = "force-dynamic";

import { useState, useEffect } from "react";
import { Header } from "@/components/Header";
import { NetworkGuard } from "@/components/NetworkGuard";
import { SwapDesk } from "@/components/SwapDesk";
import { BatchDesk } from "@/components/BatchDesk";
import { UnwrapDesk } from "@/components/UnwrapDesk";
import { PrivacyPanel } from "@/components/PrivacyPanel";
import { ZapIcon, LockIcon, BuildingIcon, SettingsIcon } from "@/components/Icons";

export default function TradePage() {
  const [isAdmin, setIsAdmin] = useState(false);
  const [activeTab, setActiveTab] = useState<"trade" | "vault" | "compliance">("trade");
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.altKey && e.key.toLowerCase() === "a") || (e.ctrlKey && e.shiftKey && e.key.toLowerCase() === "a")) {
        e.preventDefault();
        setIsAdmin((prev) => !prev);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  if (!mounted) {
    return (
      <main className="container" style={{ paddingBottom: "5rem" }}>
        <Header />
        <div style={{ height: "400px" }} />
      </main>
    );
  }

  return (
    <main className="container" style={{ paddingBottom: "5rem", position: "relative", zIndex: 1 }}>
      <Header />
      <NetworkGuard />
      
      {/* Tactical Status Control Bar */}
      <div style={{
        background: "rgba(8, 11, 20, 0.85)",
        border: "1px solid var(--border-strong)",
        borderRadius: "14px",
        padding: "0.85rem 1.25rem",
        marginBottom: "2rem",
        backdropFilter: "blur(16px)",
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        flexWrap: "wrap",
        gap: "1rem"
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: "2rem" }}>
          <div>
            <div style={{ fontSize: "0.75rem", color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.1em", fontWeight: 700 }}>
              Routing Engine
            </div>
            <div style={{ fontSize: "1.1rem", fontWeight: 800, color: "var(--text)", textTransform: "uppercase", letterSpacing: "0.05em" }}>
              Nox Intent Deck
            </div>
          </div>

          <div style={{ display: "flex", gap: "0.5rem" }}>
            <button
              onClick={() => setActiveTab("trade")}
              className={`btn ${activeTab === "trade" ? "btn-primary" : "btn-ghost"}`}
              style={{ padding: "0.5rem 1rem", fontSize: "0.85rem", borderRadius: "8px", gap: "0.4rem" }}
            >
              <ZapIcon size={14} /> Swap Console
            </button>
            <button
              onClick={() => setActiveTab("vault")}
              className={`btn ${activeTab === "vault" ? "btn-primary" : "btn-ghost"}`}
              style={{ padding: "0.5rem 1rem", fontSize: "0.85rem", borderRadius: "8px", gap: "0.4rem" }}
            >
              <LockIcon size={14} /> Balance Vault
            </button>
            <button
              onClick={() => setActiveTab("compliance")}
              className={`btn ${activeTab === "compliance" ? "btn-primary" : "btn-ghost"}`}
              style={{ padding: "0.5rem 1rem", fontSize: "0.85rem", borderRadius: "8px", gap: "0.4rem" }}
            >
              <BuildingIcon size={14} /> Auditor ACL
            </button>
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: "1rem" }}>
          <div style={{ textAlign: "right" }}>
            <div style={{ fontSize: "0.72rem", color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.05em" }}>
              Nox Network
            </div>
            <div className="mono" style={{ fontSize: "0.82rem", color: "var(--aurora-start)", fontWeight: 700, display: "flex", alignItems: "center", gap: "0.4rem" }}>
              <span className="pulse-dot" /> Sepolia KMS Configured
            </div>
          </div>

          {/* Discreet Admin Solver Switch */}
          <button
            onClick={() => setIsAdmin(!isAdmin)}
            className="badge"
            style={{
              cursor: "pointer",
              borderColor: isAdmin ? "var(--aurora-start)" : "var(--border)",
              color: isAdmin ? "var(--aurora-start)" : "var(--muted)",
              background: isAdmin ? "rgba(0, 229, 255, 0.1)" : "transparent",
              fontSize: "0.78rem",
              gap: "0.4rem"
            }}
            title="Toggle Admin/Solver Mode (Alt + A)"
          >
            <SettingsIcon size={13} /> {isAdmin ? "Solver Tools Visible" : "Alt+A Solver Tools"}
          </button>
        </div>
      </div>

      {/* Main Workstation Workspace */}
      {activeTab === "trade" && (
        <div className="grid-2" style={{ alignItems: "start" }}>
          <div>
            <SwapDesk />
          </div>
          <div>
            {isAdmin ? <BatchDesk /> : <UnwrapDesk />}
          </div>
        </div>
      )}

      {activeTab === "vault" && (
        <div style={{ maxWidth: "680px", margin: "0 auto" }}>
          <UnwrapDesk />
        </div>
      )}

      {activeTab === "compliance" && (
        <div style={{ maxWidth: "780px", margin: "0 auto" }}>
          <PrivacyPanel />
        </div>
      )}
    </main>
  );
}
