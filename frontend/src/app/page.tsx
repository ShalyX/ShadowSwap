"use client";

export const dynamic = "force-dynamic";

import { Header } from "@/components/Header";
import { NetworkGuard } from "@/components/NetworkGuard";
import { PrivacyPanel } from "@/components/PrivacyPanel";
import { ShieldIcon, LockIcon, SparklesIcon, ExternalLinkIcon } from "@/components/Icons";
import deployments from "@/lib/deployments.json";
import Link from "next/link";

export default function HomePage() {
  const contracts = deployments.contracts as Record<string, string>;
  const explorer = (deployments as { explorer?: string }).explorer ?? "https://sepolia.etherscan.io";
  const deployed =
    (deployments.config as { executorSecurityVersion?: number }).executorSecurityVersion === 4 &&
    contracts.intentBook &&
    contracts.intentBook !== "0x0000000000000000000000000000000000000000";

  return (
    <main className="container" style={{ paddingBottom: "6rem", position: "relative", zIndex: 1 }}>
      <Header />
      <NetworkGuard />

      {/* Live Dark Forest Threat Monitor Ticker */}
      <div style={{
        background: "rgba(8, 11, 20, 0.8)",
        border: "1px solid rgba(0, 229, 255, 0.2)",
        borderRadius: "12px",
        padding: "0.65rem 1.25rem",
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        fontSize: "0.82rem",
        marginBottom: "3.5rem",
        backdropFilter: "blur(12px)",
        boxShadow: "0 4px 20px rgba(0, 0, 0, 0.4)"
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: "1.5rem", flexWrap: "wrap" }}>
          <span style={{ display: "flex", alignItems: "center", gap: "0.5rem", color: "var(--aurora-start)", fontWeight: 700 }}>
            <span className="pulse-dot" /> DARK FOREST THREAT MONITOR
          </span>
          <span style={{ color: "var(--muted)", display: "flex", alignItems: "center", gap: "0.4rem" }}>
            <ShieldIcon size={14} color="var(--success)" /> Pre-Settlement Size Privacy: <strong style={{ color: "var(--success)" }}>ACTIVE</strong>
          </span>
          <span style={{ color: "var(--muted)", display: "flex", alignItems: "center", gap: "0.4rem" }}>
            <LockIcon size={14} color="#7000FF" /> Nox TEE Enclave: <strong style={{ color: "#7000FF" }}>SEPOLIA KMS</strong>
          </span>
        </div>
        <span className="mono" style={{ color: "var(--muted)", fontSize: "0.78rem" }}>
          NETTING WINDOW: <strong style={{ color: "var(--aurora-start)" }}>{(deployments.config as { batchWindowSeconds?: number }).batchWindowSeconds ?? "?"}s BATCH</strong>
        </span>
      </div>

      <section style={{ margin: "2rem 0 6rem", display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center" }}>
        <div className="badge badge-live" style={{ marginBottom: "2rem", padding: "0.55rem 1.4rem", fontSize: "0.85rem", letterSpacing: "0.05em", gap: "0.5rem" }}>
          <SparklesIcon size={14} color="var(--aurora-start)" /> WTF Hackathon · iExec Nox Protocol
          {deployed ? " · Hardened v2 live on Sepolia" : " · Hardened redeploy pending"}
        </div>

        <h1
          style={{
            margin: 0,
            fontSize: "clamp(3.2rem, 6.5vw, 5.5rem)",
            letterSpacing: "-0.04em",
            lineHeight: 1.06,
            maxWidth: 1050,
            fontWeight: 800
          }}
        >
          Trade size stays in the shadows.
          <span className="text-gradient" style={{ display: "block", paddingTop: "0.4rem" }}>Settlement stays composable.</span>
        </h1>

        <p style={{ color: "var(--muted)", maxWidth: 720, lineHeight: 1.7, fontSize: "1.2rem", marginTop: "2rem" }}>
          ShadowSwap encrypts trade size and min-out while intents wait. Settlement publicly decrypts each input, then batches compatible flow into one demo-AMM trade. The hardened Sepolia deployment is live for end-to-end testing.
        </p>
        
        <div style={{ marginTop: "3rem", display: "flex", gap: "1.25rem", flexWrap: "wrap", justifyContent: "center" }}>
          <Link href="/trade" className="btn btn-primary" style={{ padding: "1.1rem 2.75rem", fontSize: "1.15rem" }}>
            Launch Trade Console →
          </Link>
          <a href="https://docs.noxprotocol.io/getting-started/welcome" target="_blank" rel="noreferrer" className="btn btn-ghost" style={{ padding: "1.1rem 2.5rem", fontSize: "1.15rem" }}>
            Nox Protocol Docs ↗
          </a>
        </div>

        {/* Live Defense Metric Highlights Strip */}
        <div style={{
          marginTop: "4.5rem",
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
          gap: "1.5rem",
          width: "100%",
          maxWidth: 900
        }}>
          <div className="card" style={{ padding: "1.25rem", textAlign: "left" }}>
            <div style={{ fontSize: "0.75rem", color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.1em", fontWeight: 600 }}>Queued Trade Size</div>
            <div className="mono" style={{ fontSize: "1.8rem", fontWeight: 800, color: "var(--success)", marginTop: "0.2rem" }}>Encrypted</div>
            <div style={{ fontSize: "0.78rem", color: "var(--muted)", marginTop: "0.3rem" }}>Nox handles until unwrap</div>
          </div>

          <div className="card" style={{ padding: "1.25rem", textAlign: "left" }}>
            <div style={{ fontSize: "0.75rem", color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.1em", fontWeight: 600 }}>Public Execution</div>
            <div className="mono" style={{ fontSize: "1.8rem", fontWeight: 800, color: "var(--aurora-start)", marginTop: "0.2rem" }}>Visible</div>
            <div style={{ fontSize: "0.78rem", color: "var(--muted)", marginTop: "0.3rem" }}>Standard AMM MEV risk remains</div>
          </div>

          <div className="card" style={{ padding: "1.25rem", textAlign: "left" }}>
            <div style={{ fontSize: "0.75rem", color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.1em", fontWeight: 600 }}>Selective Disclosure</div>
            <div className="mono" style={{ fontSize: "1.8rem", fontWeight: 800, color: "#7000FF", marginTop: "0.2rem" }}>Auditor ACL</div>
            <div style={{ fontSize: "0.78rem", color: "var(--muted)", marginTop: "0.3rem" }}>Read-only view keys</div>
          </div>
        </div>
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
