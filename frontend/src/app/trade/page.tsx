"use client";

export const dynamic = "force-dynamic";

import { useState, useEffect } from "react";
import { Header } from "@/components/Header";
import { NetworkGuard } from "@/components/NetworkGuard";
import { SwapDesk } from "@/components/SwapDesk";
import { BatchDesk } from "@/components/BatchDesk";
import { UnwrapDesk } from "@/components/UnwrapDesk";
import { PrivacyPanel } from "@/components/PrivacyPanel";

export default function TradePage() {
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Secret hotkey: Alt + A or Ctrl + Shift + A
      if ((e.altKey && e.key.toLowerCase() === "a") || (e.ctrlKey && e.shiftKey && e.key.toLowerCase() === "a")) {
        e.preventDefault();
        setIsAdmin((prev) => !prev);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  return (
    <main className="container" style={{ paddingBottom: "4rem" }}>
      <Header />
      <NetworkGuard />
      
      <div style={{ marginBottom: "2rem", display: "flex", justifyContent: "space-between", alignItems: "flex-end" }}>
        <div>
          <h1 style={{ margin: 0, fontSize: "2rem", textTransform: "uppercase", letterSpacing: "0.05em", fontFamily: "var(--font-space-mono)" }}>
            Trade Console
          </h1>
          <p style={{ color: "var(--muted)", margin: "0.5rem 0 0" }}>
            Submit encrypted intents {isAdmin && "and execute batched settlements"}
          </p>
        </div>

        {/* Secret / Discreet Admin Mode Toggle Button */}
        <button
          onClick={() => setIsAdmin(!isAdmin)}
          style={{
            background: "none",
            border: "none",
            color: isAdmin ? "var(--aurora-start)" : "var(--border)",
            fontSize: "0.8rem",
            cursor: "pointer",
            fontFamily: "var(--font-space-mono)",
            opacity: isAdmin ? 1 : 0.4,
            transition: "opacity 0.2s ease, color 0.2s ease"
          }}
          title="Toggle Admin/Solver Mode (Alt + A)"
        >
          {isAdmin ? "⚡ Admin Solver Active" : "⚙ Alt+A"}
        </button>
      </div>

      {isAdmin ? (
        <div className="grid-2" style={{ alignItems: "start" }}>
          <div>
            <SwapDesk />
            <UnwrapDesk />
          </div>
          <div>
            <BatchDesk />
            <PrivacyPanel />
          </div>
        </div>
      ) : (
        <div className="grid-2" style={{ alignItems: "start" }}>
          <div>
            <SwapDesk />
            <UnwrapDesk />
          </div>
          <PrivacyPanel />
        </div>
      )}
    </main>
  );
}
