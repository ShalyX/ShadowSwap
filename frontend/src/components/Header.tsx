"use client";

import { useAccount, useConnect, useDisconnect, useSwitchChain, useWriteContract } from "wagmi";
import { isTargetChain, TARGET_CHAIN_ID, TARGET_CHAIN_LABEL } from "@/lib/chains";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { faucetAbi } from "@/lib/abis";
import deployments from "@/lib/deployments.json";

function ShadowMark() {
  return (
    <svg className="brand-mark" viewBox="0 0 32 32" fill="none" aria-hidden="true">
      <rect x="1" y="1" width="30" height="30" rx="8" fill="#0d0f12" stroke="rgba(255,255,255,.12)" />
      <path d="M7 11h8l4 5-4 5H7" stroke="#7170ff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M25 11h-5l-4 5 4 5h5" stroke="#d0d6e0" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" opacity=".9" />
      <rect x="14" y="14" width="4" height="4" rx="1" fill="#7170ff" />
    </svg>
  );
}

export function Header() {
  const { address, isConnected, chainId } = useAccount();
  const { connectAsync, connectors, isPending } = useConnect();
  const { disconnect } = useDisconnect();
  const { switchChain, isPending: isSwitching } = useSwitchChain();
  const { writeContract, isPending: isMinting } = useWriteContract();
  const pathname = usePathname();

  const short = address ? `${address.slice(0, 6)}…${address.slice(-4)}` : "";
  const onTarget = isConnected && isTargetChain(chainId);
  const wrongNetwork = isConnected && chainId != null && !isTargetChain(chainId);

  const handleConnect = async () => {
    const connector = connectors[0];
    if (!connector) return;
    try { await connectAsync({ connector }); }
    catch (error) { console.warn("Wallet connect notice:", error); }
  };

  const handleGetTokens = () => writeContract({
    address: deployments.contracts.faucet as `0x${string}`,
    abi: faucetAbi,
    functionName: "claim",
  });

  return (
    <header className="site-header">
      <div className="header-left">
        <Link href="/" className="brand" aria-label="ShadowSwap home">
          <ShadowMark />
          <span className="brand-name">ShadowSwap</span>
        </Link>
        <nav className="site-nav" aria-label="Primary navigation">
          <Link href="/" className={`nav-link ${pathname === "/" ? "is-active" : ""}`}>Overview</Link>
          <Link href="/trade" className={`nav-link ${pathname === "/trade" ? "is-active" : ""}`}>Trade</Link>
        </nav>
      </div>

      <div className="header-actions">
        {isConnected ? (
          <>
            {wrongNetwork ? (
              <button type="button" className="btn btn-danger" disabled={isSwitching} onClick={() => switchChain?.({ chainId: TARGET_CHAIN_ID })}>
                {isSwitching ? "Switching" : `Switch to ${TARGET_CHAIN_LABEL}`}
              </button>
            ) : (
              <span className="badge"><span className="pulse-dot" />{onTarget ? TARGET_CHAIN_LABEL : "Checking network"}</span>
            )}
            <button className="btn btn-secondary" disabled={isMinting} onClick={handleGetTokens}>{isMinting ? "Requesting" : "Test tokens"}</button>
            <span className="badge mono">{short}</span>
            <button className="btn btn-ghost" onClick={() => disconnect()}>Disconnect</button>
          </>
        ) : (
          <>
            <span className="badge"><span className="pulse-dot" />{TARGET_CHAIN_LABEL}</span>
            <button className="btn btn-primary" disabled={isPending} onClick={handleConnect}>{isPending ? "Connecting" : "Connect wallet"}</button>
          </>
        )}
      </div>
    </header>
  );
}
