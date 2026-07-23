"use client";

import { useAutoSwitchNetwork } from "@/hooks/useAutoSwitchNetwork";

/**
 * Sticky banner when wallet is connected but not on Ethereum Sepolia.
 * Auto-switch runs in the hook; banner offers manual retry if user rejects.
 */
export function NetworkGuard() {
  const {
    isConnected,
    onTarget,
    wrongNetwork,
    status,
    isSwitching,
    errorMessage,
    targetLabel,
    chainId,
    switchToTarget,
  } = useAutoSwitchNetwork({ auto: true });

  if (!isConnected || onTarget || !wrongNetwork) {
    // Still show a brief "switching…" strip while auto-switch is in flight
    if (isConnected && isSwitching) {
      return (
        <div
          role="status"
          style={{
            marginBottom: "1rem",
            padding: "0.75rem 1rem",
            borderRadius: 12,
            border: "1px solid rgba(110,168,255,0.35)",
            background: "rgba(110,168,255,0.1)",
            color: "#dbeafe",
            fontSize: "0.9rem",
            display: "flex",
            alignItems: "center",
            gap: "0.75rem",
            flexWrap: "wrap",
          }}
        >
          <span className="badge">switching…</span>
          Requesting switch to <strong>{targetLabel}</strong> in your wallet.
        </div>
      );
    }
    return null;
  }

  return (
    <div
      role="alert"
      style={{
        marginBottom: "1rem",
        padding: "0.85rem 1rem",
        borderRadius: 12,
        border: "1px solid rgba(251,191,36,0.4)",
        background: "rgba(251,191,36,0.1)",
        color: "#fde68a",
        fontSize: "0.9rem",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: "0.85rem",
        flexWrap: "wrap",
      }}
    >
      <div style={{ display: "grid", gap: 4 }}>
        <div>
          <strong style={{ color: "#fef3c7" }}>Wrong network</strong>
          {chainId != null && (
            <span className="mono" style={{ marginLeft: 8, opacity: 0.85 }}>
              chainId {chainId}
            </span>
          )}
          {" — "}
          ShadowSwap + Nox require <strong>{targetLabel}</strong> (11155111).
        </div>
        {errorMessage && (
          <div style={{ fontSize: "0.8rem", opacity: 0.9 }}>{errorMessage}</div>
        )}
        {status === "rejected" && (
          <div style={{ fontSize: "0.8rem", opacity: 0.9 }}>
            You rejected the switch. Click the button to try again.
          </div>
        )}
      </div>
      <button
        type="button"
        className="btn btn-primary"
        disabled={isSwitching}
        onClick={() => void switchToTarget()}
        style={{ whiteSpace: "nowrap" }}
      >
        {isSwitching ? "Switching…" : `Switch to ${targetLabel}`}
      </button>
    </div>
  );
}
