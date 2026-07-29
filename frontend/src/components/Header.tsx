"use client";

import { useAccount, useConnect, useDisconnect, useSwitchChain, useWriteContract } from "wagmi";
import { isTargetChain, TARGET_CHAIN_ID, TARGET_CHAIN_LABEL } from "@/lib/chains";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { faucetAbi } from "@/lib/abis";
import deployments from "@/lib/deployments.json";

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
    try {
      await connectAsync({ connector });
    } catch (error) {
      console.warn("Wallet connect notice:", error);
    }
  };

  return (
    <header className="veil-header">
      <Link href="/" className="veil-wordmark" aria-label="ShadowSwap home">
        <span>SHADOW</span><span>SWAP</span>
      </Link>

      <nav className="veil-nav" aria-label="Primary navigation">
        <Link href="/" data-active={pathname === "/"}>Thesis</Link>
        <Link href="/trade" data-active={pathname === "/trade"}>Trade</Link>
      </nav>

      <div className="wallet-actions">
        {isConnected ? (
          <>
            {wrongNetwork ? (
              <button className="veil-button veil-button-alert" disabled={isSwitching} onClick={() => switchChain?.({ chainId: TARGET_CHAIN_ID })}>
                {isSwitching ? "Switching" : `Switch to ${TARGET_CHAIN_LABEL}`}
              </button>
            ) : (
              <span className="network-line">{onTarget ? TARGET_CHAIN_LABEL : "Checking network"}</span>
            )}
            <button
              className="veil-link-button faucet-action"
              disabled={isMinting}
              onClick={() => writeContract({ address: deployments.contracts.faucet as `0x${string}`, abi: faucetAbi, functionName: "claim" })}
            >
              {isMinting ? "Minting" : "Get tokens"}
            </button>
            <button className="wallet-address" onClick={() => disconnect()} title="Disconnect wallet">{short}</button>
          </>
        ) : (
          <button className="veil-button" disabled={isPending} onClick={handleConnect}>
            {isPending ? "Opening wallet" : "Connect wallet"}
          </button>
        )}
      </div>
    </header>
  );
}
