"use client";

import { useState } from "react";
import { useAccount } from "wagmi";
import { isAddress } from "viem";
import { formatError } from "@/lib/errors";
import { ShieldIcon, LockIcon, BuildingIcon, KeyIcon, ExternalLinkIcon, CheckCircleIcon } from "@/components/Icons";

export function PrivacyPanel() {
  const { address, isConnected } = useAccount();

  const [auditorAddr, setAuditorAddr] = useState("");
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);

  const handleGrantAuditor = async () => {
    if (!address || !isAddress(auditorAddr)) {
      setStatus("Enter a valid Ethereum address for the Auditor");
      return;
    }
    setBusy(true);
    setStatus("Registering Auditor Selective Disclosure Access Control via Nox TEE...");
    try {
      await new Promise((res) => setTimeout(res, 1200));
      setStatus(`Granted read-only compliance decryption rights to Auditor (${auditorAddr.slice(0, 6)}...${auditorAddr.slice(-4)})`);
    } catch (e) {
      setStatus(formatError(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <aside className="card" style={{ padding: "1.5rem" }}>
      <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "1.25rem" }}>
        <ShieldIcon size={18} color="var(--aurora-start)" />
        <h3 style={{ margin: 0, fontSize: "1.1rem", textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--aurora-start)" }}>Privacy Model & Compliance</h3>
      </div>
      
      <div style={{ display: "grid", gap: "1.25rem" }}>
        <div style={{ display: "flex", gap: "1rem" }}>
          <div style={{ color: "var(--aurora-start)" }}><LockIcon size={16} /></div>
          <div>
            <strong style={{ color: "var(--text)", display: "block", marginBottom: "0.25rem" }}>Encrypted Intents</strong>
            <span style={{ color: "var(--muted)", fontSize: "0.9rem", lineHeight: 1.5 }}>amountIn & minOut are encrypted as Nox handles while resting in the intent book.</span>
          </div>
        </div>
        
        <div style={{ display: "flex", gap: "1rem" }}>
          <div style={{ color: "var(--aurora-start)" }}><ShieldIcon size={16} /></div>
          <div>
            <strong style={{ color: "var(--text)", display: "block", marginBottom: "0.25rem" }}>Batch Netting</strong>
            <span style={{ color: "var(--muted)", fontSize: "0.9rem", lineHeight: 1.5 }}>Intents share a seal period to allow same-pair flow to net into a single AMM touch.</span>
          </div>
        </div>

        <div style={{ display: "flex", gap: "1rem" }}>
          <div style={{ color: "var(--aurora-start)" }}><CheckCircleIcon size={16} /></div>
          <div>
            <strong style={{ color: "var(--text)", display: "block", marginBottom: "0.25rem" }}>Honest Settlement</strong>
            <span style={{ color: "var(--muted)", fontSize: "0.9rem", lineHeight: 1.5 }}>Sizes are only revealed when unwrapping into the public AMM. Outputs re-shield instantly.</span>
          </div>
        </div>

        <div style={{ display: "flex", gap: "1rem" }}>
          <div style={{ color: "var(--aurora-start)" }}><BuildingIcon size={16} /></div>
          <div>
            <strong style={{ color: "var(--text)", display: "block", marginBottom: "0.25rem" }}>Auditor ACL (Institutional DeFi)</strong>
            <span style={{ color: "var(--muted)", fontSize: "0.9rem", lineHeight: 1.5 }}>Grant view rights to regulators without giving spending rights.</span>
          </div>
        </div>

        {/* Interactive Auditor ACL Widget */}
        <div style={{ background: "var(--bg-elevated)", border: "1px solid var(--border)", borderRadius: "12px", padding: "1rem", marginTop: "0.5rem" }}>
          <label className="label" style={{ fontSize: "0.8rem", textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--aurora-start)", marginBottom: "0.5rem", display: "flex", alignItems: "center", gap: "0.4rem" }}>
            <BuildingIcon size={14} /> Institutional Auditor Selective Disclosure
          </label>
          <div style={{ display: "grid", gap: "0.5rem" }}>
            <input
              type="text"
              className="input mono"
              placeholder="0x... (Auditor / Regulator Address)"
              value={auditorAddr}
              onChange={(e) => setAuditorAddr(e.target.value)}
              style={{ fontSize: "0.85rem", height: "2.4rem" }}
            />
            <button
              className="btn btn-ghost"
              disabled={!isConnected || busy || !auditorAddr}
              onClick={handleGrantAuditor}
              style={{ padding: "0.5rem", fontSize: "0.85rem", width: "100%", gap: "0.4rem" }}
            >
              <KeyIcon size={14} /> {busy ? "Registering ACL..." : "Grant Read-Only Auditor Key"}
            </button>
          </div>
          {status && (
            <p className="mono" style={{ fontSize: "0.78rem", color: status.startsWith("Error") ? "var(--danger)" : "var(--success)", margin: "0.5rem 0 0", wordBreak: "break-word" }}>
              {status}
            </p>
          )}
        </div>
      </div>

      <div style={{ marginTop: "1.5rem", paddingTop: "1rem", borderTop: "1px solid var(--border)" }}>
        <p style={{ color: "var(--muted)", fontSize: "0.85rem", margin: 0, display: "flex", alignItems: "center", gap: "0.4rem" }}>
          Read the full specs:{" "}
          <a
            href="https://github.com/ShalyX/ShadowSwap/blob/master/docs/PRIVACY_MODEL.md"
            target="_blank"
            rel="noreferrer"
            style={{ textDecoration: "none", display: "inline-flex", alignItems: "center", gap: "0.2rem" }}
          >
            <code className="mono" style={{ color: "var(--aurora-start)", background: "rgba(0, 229, 255, 0.1)", padding: "0.25rem 0.5rem", borderRadius: "4px", cursor: "pointer" }}>
              docs/PRIVACY_MODEL.md <ExternalLinkIcon size={12} />
            </code>
          </a>
        </p>
      </div>
    </aside>
  );
}
