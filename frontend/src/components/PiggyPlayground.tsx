"use client";

import { useState } from "react";
import { useAccount, useWalletClient, usePublicClient, useWriteContract, useReadContract } from "wagmi";
import { isAddress, Address } from "viem";
import deployments from "@/lib/deployments.json";
import { piggyBankAbi } from "@/lib/abis";
import { encryptAmount, decryptHandle } from "@/lib/nox";

export function PiggyPlayground() {
  const { address, isConnected } = useAccount();
  const { data: walletClient } = useWalletClient();
  const publicClient = usePublicClient();
  const { writeContractAsync } = useWriteContract();
  
  const contracts = deployments.contracts as Record<string, string>;
  const piggyAddr = contracts.ConfidentialPiggyBank as Address;
  const ready = piggyAddr && isAddress(piggyAddr);

  const [depositAmount, setDepositAmount] = useState("");
  const [withdrawAmount, setWithdrawAmount] = useState("");
  
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);
  const [decryptedBalance, setDecryptedBalance] = useState<string | null>(null);

  const { data: encryptedBalanceHandle, refetch: refetchBalance } = useReadContract({
    address: piggyAddr,
    abi: piggyBankAbi,
    functionName: "balance",
    query: { enabled: ready },
  });

  const { data: owner } = useReadContract({
    address: piggyAddr,
    abi: piggyBankAbi,
    functionName: "owner",
    query: { enabled: ready },
  });

  const handleDeposit = async () => {
    if (!walletClient || !publicClient || !address || !depositAmount) return;
    setBusy(true);
    setStatus("Encrypting deposit amount...");
    try {
      const amountBig = BigInt(depositAmount);
      // Encrypt amount for the Piggy Bank contract
      const enc = await encryptAmount(walletClient, amountBig, piggyAddr);
      
      setStatus("Sending deposit transaction...");
      const hash = await writeContractAsync({
        address: piggyAddr,
        abi: piggyBankAbi,
        functionName: "deposit",
        args: [enc.handle, enc.handleProof],
      });

      setStatus(`Tx submitted: ${hash.slice(0, 10)}... Waiting for confirmation`);
      await publicClient.waitForTransactionReceipt({ hash });
      
      setStatus("Deposit successful!");
      setDepositAmount("");
      refetchBalance();
      setDecryptedBalance(null); // invalidate local cleartext
    } catch (e: any) {
      console.error(e);
      setStatus(`Error: ${e.message || String(e)}`);
    } finally {
      setBusy(false);
    }
  };

  const handleWithdraw = async () => {
    if (!walletClient || !publicClient || !address || !withdrawAmount) return;
    setBusy(true);
    setStatus("Encrypting withdraw amount...");
    try {
      const amountBig = BigInt(withdrawAmount);
      const enc = await encryptAmount(walletClient, amountBig, piggyAddr);
      
      setStatus("Sending withdraw transaction...");
      const hash = await writeContractAsync({
        address: piggyAddr,
        abi: piggyBankAbi,
        functionName: "withdraw",
        args: [enc.handle, enc.handleProof],
      });

      setStatus(`Tx submitted: ${hash.slice(0, 10)}... Waiting for confirmation`);
      await publicClient.waitForTransactionReceipt({ hash });
      
      setStatus("Withdraw successful!");
      setWithdrawAmount("");
      refetchBalance();
      setDecryptedBalance(null);
    } catch (e: any) {
      console.error(e);
      setStatus(`Error: ${e.message || String(e)}`);
    } finally {
      setBusy(false);
    }
  };

  const handleDecryptBalance = async () => {
    if (!walletClient || !encryptedBalanceHandle) return;
    setBusy(true);
    setStatus("Requesting decryption from Nox Gateway (requires signature)...");
    try {
      // The owner decrypts the balance handle
      const res = await decryptHandle(walletClient, encryptedBalanceHandle);
      setDecryptedBalance(res.value.toString());
      setStatus("Decryption successful!");
    } catch (e: any) {
      console.error(e);
      setStatus(`Error: ${e.message || String(e)}`);
    } finally {
      setBusy(false);
    }
  };

  if (!ready) {
    return <div className="card" style={{ padding: "2rem" }}>Piggy Bank contract not deployed.</div>;
  }

  return (
    <div className="card" style={{ padding: "2rem" }}>
      <div style={{ display: "grid", gap: "2rem" }}>
        
        {/* Status Box */}
        <div style={{ padding: "1rem", background: "var(--bg-elevated)", border: "1px solid var(--border)", borderRadius: "8px" }}>
          <div style={{ marginBottom: "0.5rem" }} className="mono">
            <strong>Piggy Bank:</strong> {piggyAddr}
          </div>
          <div style={{ marginBottom: "0.5rem" }} className="mono">
            <strong>Owner:</strong> {owner}
          </div>
          <div style={{ marginBottom: "1rem", wordBreak: "break-all" }} className="mono">
            <strong>Encrypted Balance Handle:</strong><br />
            <span style={{ color: "var(--muted)" }}>{encryptedBalanceHandle || "Loading..."}</span>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: "1rem" }}>
            <button 
              className="btn btn-primary" 
              onClick={handleDecryptBalance} 
              disabled={busy || !encryptedBalanceHandle || !isConnected}
            >
              Decrypt Balance
            </button>
            <div style={{ fontSize: "1.2rem", fontWeight: "bold", color: "var(--accent)" }} className="mono">
              {decryptedBalance !== null ? decryptedBalance : "?????"}
            </div>
          </div>
        </div>

        {/* Deposit/Withdraw Grid */}
        <div className="grid-2">
          {/* Deposit */}
          <div style={{ border: "1px solid var(--border)", padding: "1.5rem", borderRadius: "8px" }}>
            <h3 style={{ margin: "0 0 1rem 0" }}>Deposit</h3>
            <div style={{ marginBottom: "1rem" }}>
              <input
                type="number"
                className="input mono"
                placeholder="Amount (e.g. 100)"
                value={depositAmount}
                onChange={(e) => setDepositAmount(e.target.value)}
              />
            </div>
            <button 
              className="btn btn-primary" 
              style={{ width: "100%" }} 
              onClick={handleDeposit}
              disabled={busy || !depositAmount || !isConnected}
            >
              Encrypt & Deposit
            </button>
          </div>

          {/* Withdraw */}
          <div style={{ border: "1px solid var(--border)", padding: "1.5rem", borderRadius: "8px" }}>
            <h3 style={{ margin: "0 0 1rem 0" }}>Withdraw</h3>
            <div style={{ marginBottom: "1rem" }}>
              <input
                type="number"
                className="input mono"
                placeholder="Amount (e.g. 50)"
                value={withdrawAmount}
                onChange={(e) => setWithdrawAmount(e.target.value)}
              />
            </div>
            <button 
              className="btn btn-primary" 
              style={{ width: "100%" }} 
              onClick={handleWithdraw}
              disabled={busy || !withdrawAmount || !isConnected || address !== owner}
            >
              Encrypt & Withdraw
            </button>
          </div>
        </div>

        {/* Message Log */}
        {status && (
          <div className="mono" style={{ padding: "1rem", borderRadius: "8px", background: "var(--bg)", border: "1px solid var(--border)" }}>
            {status}
          </div>
        )}
      </div>
    </div>
  );
}
