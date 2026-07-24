"use client";

import { useState } from "react";
import { useAccount, useWalletClient, usePublicClient, useWriteContract } from "wagmi";
import { parseUnits, isAddress, Address } from "viem";
import deployments from "@/lib/deployments.json";
import { erc7984Abi } from "@/lib/abis";
import { encryptAmount, publicDecryptHandle } from "@/lib/nox";

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

  const cTokenOut = contracts.cSETH as Address;

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
      // For ERC7984 unwrap, the encrypted amount must be tied to the cToken
      const encAmount = await encryptAmount(walletClient, amountBig, cTokenOut);

      setStatus("2/3 Requesting unwrap on-chain...");
      
      // We simulate first to get the returned unwrapRequestId
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
      
      // Extract unwrapRequestId from the UnwrapRequested event in the receipt
      let unwrapRequestId: `0x${string}` | null = null;
      for (const log of receipt.logs) {
        // We look for the UnwrapRequested event signature or just decode the logs
        try {
          // Decode log using publicClient or viem decodeEventLog if needed,
          // but we can just use publicClient if we want. Wait, we can import decodeEventLog.
          // Or just slice the data. The 'amount' is unindexed, so it's in log.data!
          if (log.address.toLowerCase() === cTokenOut.toLowerCase() && log.data !== "0x") {
             // Assuming UnwrapRequested is the only event with 1 unindexed bytes32,
             // or we just take log.data if it's 32 bytes (66 chars).
             // Actually, it's safer to just grab it. log.data is exactly 32 bytes for euint256 amount.
             if (log.data.length === 66) {
                unwrapRequestId = log.data as `0x${string}`;
             }
          }
        } catch (err) {}
      }
      
      if (!unwrapRequestId) throw new Error("Could not find unwrapRequestId in transaction logs");

      // Decrypt the unwrapRequestId to get the proof
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
    } catch (e) {
      console.error(e);
      setStatus(`Error: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="card" style={{ padding: "1.75rem", marginTop: "1rem" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1.5rem" }}>
        <h2 style={{ margin: 0, letterSpacing: "0.05em", textTransform: "uppercase", fontSize: "1.2rem", color: "var(--accent)" }}>Manage Balances</h2>
        <span className="badge">Unwrap cSETH</span>
      </div>

      <div style={{ display: "grid", gap: "1rem" }}>
        <div>
          <label className="label">Amount to Unwrap (cSETH)</label>
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
          <div className="mono" style={{ padding: "0.75rem", borderRadius: "8px", background: "var(--bg-elevated)", border: "1px solid var(--border)", fontSize: "0.85rem", color: status.startsWith("Error") ? "var(--danger)" : "var(--muted)" }}>
            {status}
          </div>
        )}
      </div>
    </div>
  );
}
