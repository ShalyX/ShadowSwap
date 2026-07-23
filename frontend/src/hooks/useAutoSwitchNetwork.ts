"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useAccount, useSwitchChain } from "wagmi";
import {
  isTargetChain,
  SEPOLIA_ADD_CHAIN_PARAMS,
  TARGET_CHAIN_ID,
  TARGET_CHAIN_LABEL,
} from "@/lib/chains";

export type NetworkSwitchStatus =
  | "idle"
  | "correct"
  | "wrong"
  | "switching"
  | "error"
  | "rejected";

/**
 * Auto-switch the connected wallet to Ethereum Sepolia.
 *
 * - On connect / chain change: if not Sepolia, call switchChain once
 * - If the chain is unknown to the wallet, falls back to wallet_addEthereumChain
 * - User can dismiss auto-retry; manual `switchToTarget` still works
 */
export function useAutoSwitchNetwork(opts?: {
  /** Auto attempt switch when wrong network (default true) */
  auto?: boolean;
  /** Max automatic attempts per connection session (default 2) */
  maxAutoAttempts?: number;
}) {
  const auto = opts?.auto ?? true;
  const maxAutoAttempts = opts?.maxAutoAttempts ?? 2;

  const { address, isConnected, chainId, connector } = useAccount();
  const { switchChainAsync, isPending: isSwitchPending, error: switchError } =
    useSwitchChain();

  const [status, setStatus] = useState<NetworkSwitchStatus>("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const attemptsRef = useRef(0);
  const lastAddressRef = useRef<string | undefined>(undefined);

  // Reset attempt budget when wallet account changes
  useEffect(() => {
    if (address !== lastAddressRef.current) {
      lastAddressRef.current = address;
      attemptsRef.current = 0;
      setErrorMessage(null);
    }
  }, [address]);

  const onTarget = isConnected && isTargetChain(chainId);
  const wrongNetwork = isConnected && chainId != null && !isTargetChain(chainId);

  const addAndSwitch = useCallback(async () => {
    // Prefer wagmi switchChain; if chain missing, inject EIP-3085 then retry
    try {
      if (switchChainAsync) {
        await switchChainAsync({ chainId: TARGET_CHAIN_ID });
        return;
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      const code =
        e && typeof e === "object" && "code" in e
          ? Number((e as { code: unknown }).code)
          : undefined;
      // 4902 = unrecognized chain — try addEthereumChain
      const needsAdd =
        code === 4902 ||
        /unrecognized chain|chain.*not (found|configured|added)|does not exist/i.test(msg);

      if (!needsAdd) throw e;
    }

    const provider = (await connector?.getProvider?.()) as
      | { request: (args: { method: string; params?: unknown[] }) => Promise<unknown> }
      | undefined;

    if (!provider?.request) {
      throw new Error("Wallet provider unavailable for addEthereumChain");
    }

    await provider.request({
      method: "wallet_addEthereumChain",
      params: [SEPOLIA_ADD_CHAIN_PARAMS],
    });

    // Some wallets switch automatically after add; ensure switch either way
    if (switchChainAsync) {
      try {
        await switchChainAsync({ chainId: TARGET_CHAIN_ID });
      } catch {
        // already on chain after add
      }
    }
  }, [connector, switchChainAsync]);

  const switchToTarget = useCallback(async () => {
    if (!isConnected) return;
    if (isTargetChain(chainId)) {
      setStatus("correct");
      setErrorMessage(null);
      return;
    }

    setStatus("switching");
    setErrorMessage(null);
    try {
      await addAndSwitch();
      setStatus("correct");
      setErrorMessage(null);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      const rejected =
        /user rejected|denied|rejected the request|ACTION_REJECTED|4001/i.test(msg) ||
        (e &&
          typeof e === "object" &&
          "code" in e &&
          Number((e as { code: unknown }).code) === 4001);

      setStatus(rejected ? "rejected" : "error");
      setErrorMessage(
        rejected
          ? `Please approve the switch to ${TARGET_CHAIN_LABEL} in your wallet.`
          : msg.slice(0, 200)
      );
    }
  }, [addAndSwitch, chainId, isConnected]);

  // Derive status from chain
  useEffect(() => {
    if (!isConnected) {
      setStatus("idle");
      return;
    }
    if (isTargetChain(chainId)) {
      setStatus("correct");
      setErrorMessage(null);
      return;
    }
    if (chainId != null && status !== "switching" && status !== "rejected" && status !== "error") {
      setStatus("wrong");
    }
  }, [isConnected, chainId, status]);

  // Auto-switch on wrong network
  useEffect(() => {
    if (!auto || !isConnected || !wrongNetwork) return;
    if (isSwitchPending || status === "switching") return;
    if (status === "rejected" || status === "error") return;
    if (attemptsRef.current >= maxAutoAttempts) return;

    attemptsRef.current += 1;
    void switchToTarget();
  }, [
    auto,
    isConnected,
    wrongNetwork,
    isSwitchPending,
    status,
    maxAutoAttempts,
    switchToTarget,
  ]);

  return {
    chainId,
    targetChainId: TARGET_CHAIN_ID,
    targetLabel: TARGET_CHAIN_LABEL,
    isConnected,
    onTarget,
    wrongNetwork,
    status: isSwitchPending ? "switching" : status,
    isSwitching: isSwitchPending || status === "switching",
    errorMessage: errorMessage ?? (switchError ? switchError.message : null),
    switchToTarget,
    attempts: attemptsRef.current,
  };
}
