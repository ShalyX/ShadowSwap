"use client";

import { useState } from "react";
import { useAccount, useWalletClient, usePublicClient, useWriteContract, useReadContract, useBalance } from "wagmi";
import { parseUnits, formatUnits, isAddress, Address, maxUint256 } from "viem";
import deployments from "@/lib/deployments.json";
import { intentBookAbi, erc20Abi, erc7984Abi } from "@/lib/abis";
import { encryptAmount } from "@/lib/nox";

export function SwapDesk() {
  const { address, isConnected } = useAccount();
  const { data: walletClient } = useWalletClient();
  const publicClient = usePublicClient();
  const { writeContractAsync } = useWriteContract();
  
  const contracts = deployments.contracts as Record<string, string>;
  const ready = contracts.intentBook && isAddress(contracts.intentBook);

  const [amount, setAmount] = useState("");
  const [minOut, setMinOut] = useState("0");
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);
  const [useFormAmount, setUseFormAmount] = useState(true);
  const [isRedacted, setIsRedacted] = useState(false);

  // Addresses
  const tokenIn = contracts.sUSD as Address;
  const tokenOut = contracts.sETH as Address;
  const cTokenIn = contracts.cSUSD as Address;
  const cTokenOut = contracts.cSETH as Address;
  const intentBook = contracts.intentBook as Address;
  const executor = contracts.executor as Address;

  // Read Balances
  const { data: sUSDBal } = useReadContract({
    address: tokenIn,
    abi: erc20Abi,
    functionName: "balanceOf",
    args: [address as Address],
    query: { enabled: !!address }
  });

  const { data: sETHBal } = useReadContract({
    address: tokenOut,
    abi: erc20Abi,
    functionName: "balanceOf",
    args: [address as Address],
    query: { enabled: !!address }
  });

  const handleWrap = async () => {
    if (!walletClient || !publicClient || !address) return;
    if (!amount || isNaN(Number(amount))) {
      setStatus("Enter a valid amount to wrap");
      return;
    }
    setBusy(true);
    try {
      const amountBig = parseUnits(amount, 6);
      setStatus("Approving sUSD for cSUSD wrapper...");
      const approveHash = await writeContractAsync({
        address: tokenIn,
        abi: erc20Abi,
        functionName: "approve",
        args: [cTokenIn, amountBig],
      });
      const receipt = await publicClient.waitForTransactionReceipt({ hash: approveHash });
      if (receipt.status !== "success") throw new Error("Transaction reverted");

      setStatus("Wrapping sUSD into cSUSD...");
      const wrapHash = await writeContractAsync({
        address: cTokenIn,
        abi: erc7984Abi,
        functionName: "wrap",
        args: [address, amountBig],
      });
      const wrapReceipt = await publicClient.waitForTransactionReceipt({ hash: wrapHash });
      if (wrapReceipt.status !== "success") throw new Error("Transaction reverted");
      setStatus("Wrap successful! You now have confidential cSUSD.");
    } catch (e) {
      console.error(e);
      setStatus(`Error: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setBusy(false);
    }
  };

  const handleApproveExecutor = async () => {
    if (!walletClient || !publicClient || !address) return;
    setBusy(true);
    try {
      setStatus("Approving executor to spend cSUSD...");
      const until = 4102444800n; // Year 2100
      const hash = await writeContractAsync({
        address: cTokenIn,
        abi: erc7984Abi,
        functionName: "setOperator",
        args: [executor, Number(until)],
      });
      const receipt = await publicClient.waitForTransactionReceipt({ hash });
      if (receipt.status !== "success") throw new Error("Transaction reverted");
      setStatus("Executor approved!");
    } catch (e) {
      console.error(e);
      setStatus(`Error: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setBusy(false);
    }
  };

  const handleSubmit = async () => {
    if (!walletClient || !publicClient || !address) {
      setStatus("Connect wallet");
      return;
    }
    if (!amount || isNaN(Number(amount))) {
      setStatus("Enter a valid amount");
      return;
    }

    setBusy(true);
    setStatus("Encrypting amounts via Nox...");

    try {
      const amountInBig = parseUnits(amount, 6);
      const minOutBig = parseUnits(minOut, 18);

      const encAmountIn = await encryptAmount(walletClient, amountInBig, intentBook);
      const encMinOut = await encryptAmount(walletClient, minOutBig, intentBook);
      
      setStatus("Submitting encrypted intent to chain...");

      const deadline = BigInt(Math.floor(Date.now() / 1000) + 86400); // 1 day

      const hash = await writeContractAsync({
        address: intentBook,
        abi: intentBookAbi,
        functionName: "submitIntent",
        args: [
          cTokenIn,
          cTokenOut,
          tokenIn,
          tokenOut,
          encAmountIn.handle,
          encAmountIn.handleProof,
          encMinOut.handle,
          encMinOut.handleProof,
          deadline,
        ],
      });

      setStatus(`Intent submitted! tx: ${hash.slice(0, 10)}...`);
      setIsRedacted(true);
      const receipt = await publicClient.waitForTransactionReceipt({ hash });
      if (receipt.status !== "success") throw new Error("Transaction reverted");
      setStatus("Intent confirmed. Ready for settlement!");
    } catch (e) {
      console.error(e);
      setStatus(`Error: ${e instanceof Error ? e.message : String(e)}`);
      setIsRedacted(false);
    } finally {
      setBusy(false);
    }
  };

  const resetForm = () => {
    setAmount("");
    setMinOut("0");
    setIsRedacted(false);
    setStatus("");
  };

  return (
    <div className="card" style={{ padding: "1.75rem" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1.5rem" }}>
        <h2 style={{ margin: 0, letterSpacing: "0.05em", textTransform: "uppercase", fontSize: "1.2rem", color: "var(--accent)" }}>Swap Intent</h2>
        <span className="badge badge-live">sUSD → sETH</span>
      </div>

      <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.85rem", color: "var(--muted)", marginBottom: "1.5rem", background: "var(--bg-elevated)", padding: "0.75rem", borderRadius: "12px", border: "1px solid var(--border)" }}>
        <div><strong>Public sUSD:</strong> {sUSDBal !== undefined ? Number(formatUnits(sUSDBal, 6)).toFixed(2) : "0.00"}</div>
        <div><strong>Public sETH:</strong> {sETHBal !== undefined ? Number(formatUnits(sETHBal, 18)).toFixed(4) : "0.0000"}</div>
      </div>

      <div style={{ display: "grid", gap: "1rem" }}>
        <div>
          <label className="label">Amount In (sUSD)</label>
          <div style={{ position: "relative" }}>
            {isRedacted ? (
              <div className="input redacted" style={{ paddingRight: "4rem", fontSize: "1.2rem", height: "3.2rem" }}>
                {amount}
              </div>
            ) : (
              <input
                type="number"
                className="input mono"
                placeholder="0.0"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                style={{ paddingRight: "4rem", fontSize: "1.2rem", height: "3.2rem" }}
              />
            )}
            <span style={{ position: "absolute", right: "1rem", top: "50%", transform: "translateY(-50%)", color: "var(--muted)", fontWeight: 600, zIndex: 10 }}>
              sUSD
            </span>
          </div>
        </div>

        <div>
          <label className="label">Min Amount Out (sETH)</label>
          <div style={{ position: "relative" }}>
            {isRedacted ? (
              <div className="input redacted" style={{ paddingRight: "4rem", height: "2.8rem" }}>
                {minOut}
              </div>
            ) : (
              <input
                type="number"
                className="input mono"
                placeholder="0.0"
                value={minOut}
                onChange={(e) => setMinOut(e.target.value)}
                style={{ paddingRight: "4rem", height: "2.8rem" }}
              />
            )}
            <span style={{ position: "absolute", right: "1rem", top: "50%", transform: "translateY(-50%)", color: "var(--muted)", fontWeight: 600, zIndex: 10 }}>
              sETH
            </span>
          </div>
        </div>

        {isRedacted ? (
          <button
            className="btn btn-ghost"
            onClick={resetForm}
            style={{ padding: "1rem", marginTop: "1rem", fontSize: "1.05rem" }}
          >
            Submit New Intent
          </button>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem", marginTop: "1rem" }}>
            <div style={{ display: "flex", gap: "0.75rem" }}>
              <button
                className="btn btn-ghost"
                disabled={!isConnected || !ready || busy || !amount}
                onClick={handleWrap}
                style={{ flex: 1, padding: "0.75rem", fontSize: "0.95rem" }}
              >
                1. Wrap
              </button>
              <button
                className="btn btn-ghost"
                disabled={!isConnected || !ready || busy}
                onClick={handleApproveExecutor}
                style={{ flex: 1, padding: "0.75rem", fontSize: "0.95rem" }}
              >
                2. Approve
              </button>
            </div>
            <button
              className="btn btn-primary"
              disabled={!isConnected || !ready || busy || !amount}
              onClick={handleSubmit}
              style={{ padding: "1rem", fontSize: "1.05rem", width: "100%" }}
            >
              {busy ? "Processing..." : "3. Encrypt & Submit Intent"}
            </button>
          </div>
        )}

        {status && (
          <div className="mono" style={{ padding: "0.75rem", borderRadius: "8px", background: "var(--bg-elevated)", border: "1px solid var(--border)", fontSize: "0.85rem", color: status.startsWith("Error") ? "var(--danger)" : "var(--muted)", marginTop: "1rem" }}>
            {status}
          </div>
        )}
      </div>
    </div>
  );
}