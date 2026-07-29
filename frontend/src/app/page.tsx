"use client";

export const dynamic = "force-dynamic";

import { useRef, useState } from "react";
import Link from "next/link";
import { Header } from "@/components/Header";
import { NetworkGuard } from "@/components/NetworkGuard";
import deployments from "@/lib/deployments.json";

export default function HomePage() {
  const [crossed, setCrossed] = useState(false);
  const holdTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const contracts = deployments.contracts as Record<string, string>;
  const config = deployments.config as { executorSecurityVersion?: number; batchWindowSeconds?: number };
  const live = config.executorSecurityVersion === 4 && !!contracts.intentBook;

  const beginHold = () => {
    if (crossed) return;
    holdTimer.current = setTimeout(() => setCrossed(true), 850);
  };
  const cancelHold = () => {
    if (holdTimer.current) clearTimeout(holdTimer.current);
  };

  return (
    <main className={`veil-site ${crossed ? "is-crossed" : ""}`}>
      <div className="veil-shell">
        <Header />
        <NetworkGuard />

        <section className="veil-hero" aria-labelledby="veil-title">
          <div className="hero-kicker">
            <span>Encrypted while queued</span>
            <span>{live ? "Sepolia · executor v4" : "Deployment pending"}</span>
          </div>

          <h1 id="veil-title" className="veil-title" aria-label="Hide the size until it has to move">
            <span>HIDE THE</span>
            <span className="title-obscured">SIZE</span>
            <span>UNTIL IT</span>
            <span className="title-execute">MOVES.</span>
          </h1>

          <p className="veil-lede">
            ShadowSwap keeps amount and minimum output encrypted while an intent waits. The values become public when settlement executes through the AMM.
          </p>

          <div className="boundary-demo" aria-live="polite">
            <div className="boundary-private">
              <span className="boundary-caption">PRIVATE FIELD</span>
              <span className="boundary-value">AMOUNT · ███████</span>
            </div>
            <div className="settlement-horizon">
              <span className="intent-bead" aria-hidden="true" />
              <span className="horizon-label">SETTLEMENT BOUNDARY</span>
            </div>
            <div className="boundary-public">
              <span className="boundary-caption">PUBLIC EXECUTION</span>
              <span className="boundary-value">{crossed ? "ONE AMM INTERACTION" : "WAITING BELOW THE VEIL"}</span>
            </div>
            <button
              className="hold-control"
              onPointerDown={beginHold}
              onPointerUp={cancelHold}
              onPointerLeave={cancelHold}
              onClick={(event) => {
                if (crossed) setCrossed(false);
                else if (event.detail === 0) setCrossed(true);
              }}
            >
              <span>{crossed ? "Reset boundary" : "Hold to cross the veil"}</span>
              <i aria-hidden="true" />
            </button>
            <span className="sample-note">Privacy-boundary demonstration · no transaction broadcast</span>
          </div>

          <Link href="/trade" className="enter-trade">Enter the instrument <span>↘</span></Link>
        </section>
      </div>

      <section className="boundary-statement">
        <p>Before the line</p>
        <h2>The order can wait without advertising its size.</h2>
        <div className="statement-rule" />
        <p>After the line</p>
        <h2>The AMM leg is public. We say that plainly.</h2>
      </section>

      <section className="flow-register veil-shell" aria-label="Settlement sequence">
        <div className="flow-intro">
          <span className="section-label">A real sequence, not a privacy claim</span>
          <h2>One intent.<br />Three states.</h2>
        </div>
        <ol className="flow-lines">
          <li><span>01</span><strong>Seal</strong><p>The wallet encrypts amount and minimum output into Nox handles.</p></li>
          <li><span>02</span><strong>Wait</strong><p>The intent rests in the book during the {config.batchWindowSeconds ?? 300}-second compatibility window.</p></li>
          <li><span>03</span><strong>Cross</strong><p>Settlement reveals inputs for the public AMM call, then returns confidential outputs.</p></li>
        </ol>
      </section>

      <footer className="veil-footer veil-shell">
        <span>ShadowSwap · Ethereum Sepolia</span>
        <div>
          <a href="https://github.com/ShalyX/ShadowSwap/blob/master/docs/PRIVACY_MODEL.md" target="_blank" rel="noreferrer">Privacy model ↗</a>
          <a href="https://github.com/ShalyX/ShadowSwap" target="_blank" rel="noreferrer">Source ↗</a>
        </div>
      </footer>
    </main>
  );
}
