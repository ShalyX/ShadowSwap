"use client";

import { Header } from "@/components/Header";
import { NetworkGuard } from "@/components/NetworkGuard";
import { PrivacyPanel } from "@/components/PrivacyPanel";
import deployments from "@/lib/deployments.json";
import Link from "next/link";

export default function HomePage() {
  const contracts = deployments.contracts as Record<string, string>;
  const explorer = (deployments as { explorer?: string }).explorer ?? "https://sepolia.etherscan.io";
  const deployed =
    contracts.intentBook &&
    contracts.intentBook !== "0x0000000000000000000000000000000000000000";

  return (
    <main className="container" style={{ paddingBottom: "6rem", position: "relative", zIndex: 1 }}>
      <Header />
      <NetworkGuard />

      <section style={{ margin: "5rem 0 7rem", display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center" }}>
        <div className="badge" style={{ marginBottom: "2rem", padding: "0.5rem 1.25rem", fontSize: "0.85rem", background: "rgba(0, 229, 255, 0.05)", borderColor: "rgba(0, 229, 255, 0.2)", color: "var(--aurora-start)" }}>
          WTF !! Hackathon · Write The Future
          {deployed ? " · Live on Sepolia" : ""}
        </div>
        <h1
          style={{
            margin: 0,
            fontSize: "clamp(3.5rem, 7vw, 6rem)",
            letterSpacing: "-0.04em",
            lineHeight: 1.05,
            maxWidth: 1000,
          }}
        >
          Trade size stays in the shadows.
          <span className="text-gradient" style={{ display: "block", paddingBottom: "0.5rem" }}>Settlement stays composable.</span>
        </h1>
        <p style={{ color: "var(--muted)", maxWidth: 680, lineHeight: 1.7, fontSize: "1.2rem", marginTop: "2rem" }}>
          ShadowSwap is an institutional-grade private routing layer for public AMMs. Encrypt your trades with Nox TEEs, pool them in a batchable intent book, and unshield only at execution.
        </p>
        
        <div style={{ marginTop: "3rem", display: "flex", gap: "1rem", flexWrap: "wrap", justifyContent: "center" }}>
          <Link href="/trade" className="btn btn-primary" style={{ padding: "1.1rem 2.5rem", fontSize: "1.15rem" }}>
            Launch App →
          </Link>
          <a href="https://docs.noxprotocol.io/getting-started/welcome" target="_blank" rel="noreferrer" className="btn btn-ghost" style={{ padding: "1.1rem 2.5rem", fontSize: "1.15rem" }}>
            Read Docs
          </a>
        </div>
        
        {deployed && (
          <div style={{ marginTop: "4rem", paddingTop: "2rem", borderTop: "1px solid var(--border)", display: "inline-block" }}>
            <p style={{ color: "var(--muted)", fontSize: "0.85rem", textTransform: "uppercase", letterSpacing: "0.1em", margin: "0 0 0.5rem 0" }}>
              Intent Book Contract
            </p>
            <a
              className="mono"
              href={`${explorer}/address/${contracts.intentBook}`}
              target="_blank"
              rel="noreferrer"
              style={{ color: "var(--text)", fontSize: "1rem" }}
            >
              {contracts.intentBook}
            </a>
          </div>
        )}
      </section>

      <div className="grid-2" style={{ alignItems: "start" }}>
        <PrivacyPanel />
        <div className="card" style={{ padding: "2rem" }}>
          <h3 style={{ margin: "0 0 1.5rem", fontSize: "1.1rem", textTransform: "uppercase", letterSpacing: "0.1em", color: "var(--aurora-start)" }}>External Resources</h3>
          <div style={{ display: "grid", gap: "1rem", fontSize: "1rem" }}>
            <a href="https://cdefi.iex.ec/" target="_blank" rel="noreferrer" style={{ display: "flex", justifyContent: "space-between", borderBottom: "1px solid var(--border)", paddingBottom: "0.75rem", color: "var(--text)" }}>
              <span>Confidential Token demo</span>
              <span style={{ color: "var(--muted)" }}>↗</span>
            </a>
            <a href="https://dorahacks.io/hackathon/wtf-hackathon/detail" target="_blank" rel="noreferrer" style={{ display: "flex", justifyContent: "space-between", borderBottom: "1px solid var(--border)", paddingBottom: "0.75rem", color: "var(--text)" }}>
              <span>DoraHacks challenge</span>
              <span style={{ color: "var(--muted)" }}>↗</span>
            </a>
            <a href="https://discord.gg/RXYHBJceMe" target="_blank" rel="noreferrer" style={{ display: "flex", justifyContent: "space-between", color: "var(--text)" }}>
              <span>iExec Discord</span>
              <span style={{ color: "var(--muted)" }}>↗</span>
            </a>
          </div>
        </div>
      </div>
    </main>
  );
}
