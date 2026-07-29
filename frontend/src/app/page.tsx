"use client";

export const dynamic = "force-dynamic";

import Link from "next/link";
import { Header } from "@/components/Header";
import { NetworkGuard } from "@/components/NetworkGuard";
import deployments from "@/lib/deployments.json";

function shortAddress(value: string) {
  return `${value.slice(0, 6)}…${value.slice(-4)}`;
}

function IntentVeil() {
  return (
    <div className="veil-instrument" aria-label="Encrypted intent settlement model">
      <div className="veil-header">
        <span className="veil-title">Open batch</span>
        <span className="veil-status"><span className="pulse-dot" /> accepting intents</span>
      </div>
      <div className="veil-body">
        {["41%", "73%", "56%"].map((width, index) => (
          <div className="intent-row" key={width}>
            <span className="intent-index">0{index + 1}</span>
            <span className="intent-line" style={{ "--intent-width": width } as React.CSSProperties} />
            <span className="intent-sealed">size sealed</span>
          </div>
        ))}
      </div>
      <div className="settlement-boundary">
        <span className="eyebrow">Settlement boundary</span>
        <strong>One public AMM interaction</strong>
        <div className="settlement-meta"><span>same-pair batch</span><span>outputs re-shielded</span></div>
      </div>
      <p className="boundary-note">Queued sizes stay encrypted. Individual values become public during settlement. Standard AMM execution risk remains.</p>
    </div>
  );
}

export default function HomePage() {
  const contracts = deployments.contracts as Record<string, string>;
  const config = deployments.config as { executorSecurityVersion?: number; batchWindowSeconds?: number };
  const explorer = (deployments as { explorer?: string }).explorer ?? "https://eth-sepolia.blockscout.com";

  return (
    <main className="container landing">
      <Header />
      <NetworkGuard />

      <section className="hero">
        <div className="hero-grid">
          <div className="hero-copy">
            <div className="eyebrow">Private intent routing · Ethereum Sepolia</div>
            <h1>Hide the size. Settle the trade.</h1>
            <p>ShadowSwap keeps amount and minimum output encrypted while an intent waits. Compatible flow settles through one public AMM interaction, then returns confidential outputs.</p>
            <div className="hero-actions">
              <Link href="/trade" className="btn btn-primary">Open trade</Link>
              <a className="btn btn-ghost" href={`${explorer}/address/${contracts.executor}`} target="_blank" rel="noreferrer">Inspect deployment</a>
            </div>
          </div>
          <IntentVeil />
        </div>

        <div className="proof-strip" aria-label="Live deployment facts">
          <div className="proof-item">
            <div className="eyebrow">Executor</div>
            <div className="proof-value mono">{shortAddress(contracts.executor)}</div>
            <div className="proof-note">Security version {config.executorSecurityVersion}</div>
          </div>
          <div className="proof-item">
            <div className="eyebrow">Intent window</div>
            <div className="proof-value mono">{config.batchWindowSeconds}s</div>
            <div className="proof-note">Same-pair batching on Sepolia</div>
          </div>
          <div className="proof-item">
            <div className="eyebrow">Disclosure</div>
            <div className="proof-value">User-directed auditor ACL</div>
            <div className="proof-note">Viewer rights without spend authority</div>
          </div>
        </div>
      </section>

      <section className="mechanism">
        <div className="mechanism-head">
          <div className="eyebrow">Privacy boundary</div>
          <h2>Private while queued. Public when execution requires it.</h2>
        </div>
        <div className="mechanism-list">
          <div className="mechanism-row"><span className="index">01</span><h3>Encrypt in the wallet</h3><p>Amount and minimum output are submitted as Nox handles. Plain values are not stored with the waiting intent.</p></div>
          <div className="mechanism-row"><span className="index">02</span><h3>Net compatible flow</h3><p>Same-pair intents can share one pool interaction. The batch reduces the number of directly sized swaps visible to the pool.</p></div>
          <div className="mechanism-row"><span className="index">03</span><h3>Reveal at settlement</h3><p>Each value is unwrapped before the public AMM call. This is pre-settlement size privacy, not private public-chain execution.</p></div>
        </div>
      </section>

      <footer className="landing-foot">
        <span>ShadowSwap · Nox confidential tokens · Sepolia</span>
        <span><a href="https://github.com/ShalyX/ShadowSwap/blob/master/docs/PRIVACY_MODEL.md" target="_blank" rel="noreferrer">Privacy model</a> · <a href="https://github.com/ShalyX/ShadowSwap" target="_blank" rel="noreferrer">Source</a></span>
      </footer>
    </main>
  );
}
