"use client";

import { useState } from "react";
import { useAccount, useWalletClient, usePublicClient, useWriteContract, useReadContract } from "wagmi";
import { parseUnits, formatUnits, isAddress, Address } from "viem";
import deployments from "@/lib/deployments.json";
import { erc7984Abi } from "@/lib/abis";
import { encryptAmount, decryptHandle, publicDecryptHandle } from "@/lib/nox";
import { formatError } from "@/lib/errors";
import { LockIcon } from "@/components/Icons";

export function UnwrapDesk() {
  const { address, isConnected } = useAccount();
  const { data: walletClient } = useWalletClient();
  const publicClient = usePublicClient();
  const { writeContractAsync } = useWriteContract();
  
  const contracts = deployments.contracts as Record<string, string>;
  const ready = contracts.cSETH && isAddress(contracts.cSETH);

  const [amount, setAmount] = useState("");
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);

  // Decrypted Balance State
  const [decryptedCSETH, setDecryptedCSETH] = useState<string | null>(null);
  const [decryptingBal, setDecryptingBal] = useState(false);

  const cTokenOut = contracts.cSETH as Address;

  // Read Confidential Balance Handle for cSETH
  const { data: cSETHHandle, refetch: refetchHandle } = useReadContract({
    address: cTokenOut,
    abi: erc7984Abi,
    functionName: "confidentialBalanceOf",
    args: [address as Address],
    query: { enabled: !!address && !!ready }
  });

  const hasConfidentialBalance =
    !!cSETHHandle &&
    cSETHHandle !== "0x0000000000000000000000000000000000000000000000000000000000000000";

  const handleDecryptBalance = async () => {
    if (!walletClient || !cSETHHandle || cSETHHandle === "0x0000000000000000000000000000000000000000000000000000000000000000") {
      setDecryptedCSETH("0.0000");
      return;
    }
    setDecryptingBal(true);
    try {
      // Decrypt using Nox SDK
      const res = await decryptHandle(walletClient, cSETHHandle as `0x${string}`);
      const formatted = formatUnits(BigInt(res.value), 18);
      setDecryptedCSETH(formatted);
    } catch (e: any) {
      console.warn("Standard decrypt failed, trying publicDecrypt fallback...", e);
      try {
        const pubRes = await publicDecryptHandle(walletClient, cSETHHandle as `0x${string}`);
        const formatted = formatUnits(BigInt(pubRes.value), 18);
        setDecryptedCSETH(formatted);
      } catch (err) {
        console.error(err);
        setStatus("Could not decrypt cSETH balance: " + formatError(err));
      }
    } finally {
      setDecryptingBal(false);
    }
  };

  const handleUnwrap = async () => {
    if (!walletClient || !publicClient || !address) return;
    if (!amount || isNaN(Number(amount))) {
      setStatus("Enter a valid amount to unwrap");
      return;
    }
    setBusy(true);
    try {
      const amountBig = parseUnits(amount, 18);
      
      setStatus("1/3 Encrypting amount to unwrap...");
      const encAmount = await encryptAmount(walletClient, amountBig, cTokenOut);

      setStatus("2/3 Requesting unwrap on-chain...");
      const { request } = await publicClient.simulateContract({
        address: cTokenOut,
        abi: erc7984Abi,
        functionName: "unwrap",
        args: [address, address, encAmount.handle, encAmount.handleProof],
        account: address,
      });

      const unwrapHash = await writeContractAsync(request);
      const receipt = await publicClient.waitForTransactionReceipt({ hash: unwrapHash });
      if (receipt.status !== "success") throw new Error("Transaction reverted");

      setStatus("3/3 Decrypting unwrap request via Nox Gateway...");
      let unwrapRequestId: `0x${string}` | null = null;
      for (const log of receipt.logs) {
        try {
          if (log.address.toLowerCase() === cTokenOut.toLowerCase() && log.data !== "0x") {
             if (log.data.length === 66) {
                unwrapRequestId = log.data as `0x${string}`;
             }
          }
        } catch {}
      }
      
      if (!unwrapRequestId) throw new Error("Could not find unwrapRequestId in transaction logs");

      let decryptionProof: `0x${string}` | null = null;
      for (let attempt = 1; attempt <= 15; attempt++) {
        try {
          const res = await publicDecryptHandle(walletClient, unwrapRequestId);
          decryptionProof = res.decryptionProof;
          break;
        } catch (err: any) {
          if (attempt === 10) throw err;
          setStatus(`3/3 Decrypting... (Attempt ${attempt}/10)`);
          await new Promise(r => setTimeout(r, 3000));
        }
      }

      if (!decryptionProof) throw new Error("Failed to get decryption proof");

      setStatus("Finalizing unwrap on-chain...");
      const finalizeHash = await writeContractAsync({
        address: cTokenOut,
        abi: erc7984Abi,
        functionName: "finalizeUnwrap",
        args: [unwrapRequestId, decryptionProof],
      });
      const finReceipt = await publicClient.waitForTransactionReceipt({ hash: finalizeHash });
      if (finReceipt.status !== "success") throw new Error("Finalize reverted");

      setStatus("Unwrap successful! You received public sETH.");
      setAmount("");
      setDecryptedCSETH(null);
      refetchHandle();
    } catch (e) {
      console.error(e);
      setStatus(formatError(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="card balance-card" style={{ padding: "1.75rem" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1.25rem" }}>
        <h2 style={{ margin: 0, letterSpacing: "0.05em", textTransform: "uppercase", fontSize: "1.2rem", color: "var(--aurora-start)", display: "flex", alignItems: "center", gap: "0.4rem" }}>
          <LockIcon size={18} /> Confidential balance
        </h2>
        <span className="badge">Unwrap cSETH</span>
      </div>

      {/* Confidential Balance Box */}
      <div style={{ padding: "0.85rem 1rem", background: "var(--bg-elevated)", borderRadius: "12px", border: "1px solid var(--border)", marginBottom: "1.25rem" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <div style={{ fontSize: "0.8rem", color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.05em", fontWeight: 600 }}>
              Confidential cSETH Balance
            </div>
            <div className="mono" style={{ fontSize: "1.2rem", fontWeight: "bold", marginTop: "0.2rem", color: decryptedCSETH !== null ? "var(--aurora-start)" : "var(--text)", display: "flex", alignItems: "center", gap: "0.4rem" }}>
              {decryptedCSETH !== null ? (
                `${Number(decryptedCSETH).toFixed(4)} cSETH`
              ) : hasConfidentialBalance ? (
                <>
                  <LockIcon size={16} color="var(--aurora-start)" /> Encrypted balance handle
                </>
              ) : isConnected ? (
                "No confidential balance"
              ) : (
                "Connect wallet to view"
              )}
            </div>
          </div>

          <button
            type="button"
            className="btn btn-ghost"
            onClick={handleDecryptBalance}
            disabled={!isConnected || decryptingBal}
            style={{ fontSize: "0.8rem", padding: "0.4rem 0.8rem", border: "1px solid var(--border)", gap: "0.4rem" }}
          >
            <LockIcon size={12} /> {decryptingBal ? "Decrypting..." : decryptedCSETH !== null ? "↻ Refresh" : "Reveal Balance"}
          </button>
        </div>
      </div>

      <div style={{ display: "grid", gap: "1rem" }}>
        <div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.4rem" }}>
            <label className="label" style={{ margin: 0 }}>Amount to Unwrap (cSETH)</label>
            {decryptedCSETH !== null && Number(decryptedCSETH) > 0 && (
              <button
                type="button"
                onClick={() => setAmount(decryptedCSETH)}
                style={{ background: "none", border: "none", color: "var(--aurora-start)", fontSize: "0.78rem", cursor: "pointer", fontWeight: 600 }}
              >
                Use Max ({Number(decryptedCSETH).toFixed(4)})
              </button>
            )}
          </div>
          <div style={{ position: "relative" }}>
            <input
              type="number"
              className="input mono"
              placeholder="0.0"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              style={{ paddingRight: "4rem", fontSize: "1.2rem", height: "3.2rem" }}
            />
            <span style={{ position: "absolute", right: "1rem", top: "50%", transform: "translateY(-50%)", color: "var(--muted)", fontWeight: 600, zIndex: 10 }}>
              cSETH
            </span>
          </div>
          <p style={{ fontSize: "0.8rem", color: "var(--muted)", marginTop: "0.5rem" }}>
            Unwrapping converts confidential cSETH back into public sETH in your wallet.
          </p>
        </div>

        <button
          className="btn btn-ghost"
          disabled={!isConnected || !ready || busy || !amount}
          onClick={handleUnwrap}
          style={{ padding: "1rem", fontSize: "1.05rem", width: "100%", border: "1px solid var(--border)" }}
        >
          {busy ? "Processing..." : "Unwrap to Public sETH"}
        </button>

        {status && (
          <div className="mono" style={{ padding: "0.75rem", borderRadius: "8px", background: "var(--bg-elevated)", border: "1px solid var(--border)", fontSize: "0.85rem", color: status.startsWith("Error") ? "var(--danger)" : "var(--muted)", wordBreak: "break-word" }}>
            {status}
          </div>
        )}
      </div>
    </div>
  );
}
