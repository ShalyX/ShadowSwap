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
    <section className="balance-instrument">
      <header>
        <span className="section-label">CONFIDENTIAL BALANCE</span>
        <h2>Bring value<br />back through.</h2>
      </header>

      <div className="concealed-balance">
        <span>cSETH balance</span>
        <strong>{!isConnected ? "Connect wallet" : decryptedCSETH !== null ? `${Number(decryptedCSETH).toFixed(4)} cSETH` : "████████"}</strong>
        <button type="button" onClick={handleDecryptBalance} disabled={!isConnected || decryptingBal}>
          {decryptingBal ? "Decrypting" : decryptedCSETH !== null ? "Refresh balance" : "Reveal balance"}
        </button>
      </div>

      <label className="unwrap-amount">
        <span>Amount to make public</span>
        <div><input type="number" inputMode="decimal" placeholder="0" value={amount} onChange={(event) => setAmount(event.target.value)} /><b>cSETH</b></div>
      </label>

      {decryptedCSETH !== null && Number(decryptedCSETH) > 0 && <button className="use-balance" onClick={() => setAmount(decryptedCSETH)}>Use full balance · {Number(decryptedCSETH).toFixed(4)}</button>}

      <div className="unwrap-boundary"><span>CONFIDENTIAL</span><i /><span>PUBLIC sETH</span></div>
      <button className="unwrap-action" disabled={!isConnected || !ready || busy || !amount} onClick={handleUnwrap}>
        {busy ? "Crossing the boundary" : "Unwrap to public sETH"}
      </button>
      <p className="instrument-footnote">Unwrapping produces a public wallet balance. This boundary cannot be hidden.</p>
      {status && <p className="instrument-status">{status}</p>}
    </section>
  );
}
