"use client";

import { useAccount, useConnect, useDisconnect, useSwitchChain } from "wagmi";
import {
  isTargetChain,
  TARGET_CHAIN_ID,
  TARGET_CHAIN_LABEL,
} from "@/lib/chains";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useWriteContract } from "wagmi";
import { faucetAbi } from "@/lib/abis";
import deployments from "@/lib/deployments.json";

export function Header() {
  const { address, isConnected, chainId } = useAccount();
  const { connect, connectors, isPending } = useConnect();
  const { disconnect } = useDisconnect();
  const { switchChain, isPending: isSwitching } = useSwitchChain();
  const pathname = usePathname();
  const { writeContract, isPending: isMinting } = useWriteContract();

  const handleGetTokens = () => {
    writeContract({
      address: deployments.contracts.faucet as `0x${string}`,
      abi: faucetAbi,
      functionName: "claim",
    });
  };

  const short =
    address != null ? `${address.slice(0, 6)}…${address.slice(-4)}` : "";
  const onTarget = isConnected && isTargetChain(chainId);
  const wrongNetwork = isConnected && chainId != null && !isTargetChain(chainId);

  const handleConnect = () => {
    const connector = connectors[0];
    if (!connector) return;
    connect({ connector, chainId: TARGET_CHAIN_ID });
  };

  const handleSwitch = () => {
    switchChain?.({ chainId: TARGET_CHAIN_ID });
  };

  return (
    <header
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "2rem 0",
        gap: "1rem",
        flexWrap: "wrap",
        borderBottom: "1px solid var(--border)",
        marginBottom: "3rem",
        position: "relative",
        zIndex: 10
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: "2.5rem" }}>
        <Link href="/" style={{ display: "flex", alignItems: "center", gap: "0.75rem", opacity: 1 }}>
          <div
            style={{
              width: 36,
              height: 36,
              background: "var(--text)",
              borderRadius: "8px",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "var(--bg)",
              fontWeight: 800,
              fontSize: "1.2rem",
              fontFamily: "var(--font-space-mono)"
            }}
          >
            S
          </div>
          <div>
            <div style={{ fontWeight: 800, fontSize: "1.2rem", letterSpacing: "0.1em", color: "var(--text)", textTransform: "uppercase" }}>
              ShadowSwap
            </div>
          </div>
        </Link>
        
        <nav style={{ display: "flex", gap: "2rem", borderLeft: "1px solid var(--border)", paddingLeft: "2.5rem", height: "32px", alignItems: "center" }}>
          <Link href="/" style={{ 
            color: pathname === "/" ? "var(--text)" : "var(--muted)",
            fontWeight: pathname === "/" ? 600 : 500,
            fontSize: "0.9rem",
            textTransform: "uppercase",
            letterSpacing: "0.1em",
            position: "relative"
          }}>
            Overview
            {pathname === "/" && (
              <span style={{ position: "absolute", bottom: "-6px", left: 0, width: "100%", height: "2px", background: "var(--gradient-aurora)", borderRadius: "2px" }} />
            )}
          </Link>
          <Link href="/trade" style={{ 
            color: pathname === "/trade" ? "var(--text)" : "var(--muted)",
            fontWeight: pathname === "/trade" ? 600 : 500,
            fontSize: "0.9rem",
            textTransform: "uppercase",
            letterSpacing: "0.1em",
            position: "relative"
          }}>
            Trade
            {pathname === "/trade" && (
              <span style={{ position: "absolute", bottom: "-6px", left: 0, width: "100%", height: "2px", background: "var(--gradient-aurora)", borderRadius: "2px" }} />
            )}
          </Link>
        </nav>
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", flexWrap: "wrap" }}>
        {isConnected ? (
          <>
            {onTarget ? (
              <span className="badge badge-live">● {TARGET_CHAIN_LABEL}</span>
            ) : wrongNetwork ? (
              <button
                type="button"
                className="btn btn-danger"
                disabled={isSwitching}
                onClick={handleSwitch}
                title={`Switch from chain ${chainId} to ${TARGET_CHAIN_ID}`}
              >
                {isSwitching ? "Switching…" : `⚠ Switch to ${TARGET_CHAIN_LABEL}`}
              </button>
            ) : (
              <span className="badge">● checking network…</span>
            )}
            <button
              className="btn btn-secondary"
              disabled={isMinting}
              onClick={handleGetTokens}
              style={{ marginRight: "0.5rem" }}
            >
              {isMinting ? "Minting…" : "Get Tokens"}
            </button>
            <span className="badge mono" style={{ padding: "0.5rem 1rem", fontSize: "0.85rem", background: "rgba(0,0,0,0.2)" }}>{short}</span>
            <button className="btn btn-ghost" onClick={() => disconnect()}>
              Disconnect
            </button>
          </>
        ) : (
          <>
            <span className="badge badge-live" style={{ marginRight: "0.5rem" }}>● {TARGET_CHAIN_LABEL}</span>
            <button
              className="btn btn-primary"
              disabled={isPending || !connectors[0]}
              onClick={handleConnect}
            >
              {isPending ? "Connecting…" : "Connect Wallet"}
            </button>
          </>
        )}
      </div>
    </header>
  );
}
