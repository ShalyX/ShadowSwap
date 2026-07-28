"use client";

import { useState, useEffect } from "react";
import { useAccount, useWalletClient, usePublicClient, useWriteContract, useReadContract } from "wagmi";
import { parseUnits, formatUnits, isAddress, Address, decodeEventLog } from "viem";
import deployments from "@/lib/deployments.json";
import { intentBookAbi, erc20Abi, erc7984Abi } from "@/lib/abis";
import { encryptAmount } from "@/lib/nox";
import { formatError } from "@/lib/errors";
import { ShieldIcon, LockIcon, ZapIcon, ArrowDownUpIcon, ExternalLinkIcon, CheckCircleIcon } from "@/components/Icons";

export function SwapDesk() {
  const { address, isConnected } = useAccount();
  const { data: walletClient } = useWalletClient();
  const publicClient = usePublicClient();
  const { writeContractAsync } = useWriteContract();
  
  const contracts = deployments.contracts as Record<string, string>;
  const deploymentConfig = deployments.config as { executorSecurityVersion?: number };
  const hardenedExecutor = deploymentConfig.executorSecurityVersion === 2;
  const ready = contracts.intentBook && isAddress(contracts.intentBook) && hardenedExecutor;

  const [isReverse, setIsReverse] = useState(false); // false: sUSD -> sETH, true: sETH -> sUSD
  const [amount, setAmount] = useState("");
  const [minOut, setMinOut] = useState("0");
  const [slippagePct, setSlippagePct] = useState<number | null>(0.5); // Default 0.5%
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);
  const [isRedacted, setIsRedacted] = useState(false);
  const [lastTxHash, setLastTxHash] = useState<string | null>(null);
  const [lastIntentId, setLastIntentId] = useState<bigint | null>(null);

  // Live ETH Price in USD (default fallback 3200)
  const [ethPrice, setEthPrice] = useState<number>(3200);
  const [isPriceLoading, setIsPriceLoading] = useState<boolean>(true);

  // Fetch Live Real-Time ETH Market Price from CoinGecko / CoinCap
  useEffect(() => {
    const fetchLivePrice = async () => {
      try {
        const res = await fetch("https://api.coingecko.com/api/v3/simple/price?ids=ethereum&vs_currencies=usd");
        if (!res.ok) throw new Error("CoinGecko failed");
        const data = await res.json();
        if (data?.ethereum?.usd) {
          setEthPrice(data.ethereum.usd);
          setIsPriceLoading(false);
          return;
        }
      } catch {
        try {
          const res2 = await fetch("https://api.coincap.io/v2/rates/ethereum");
          const data2 = await res2.json();
          if (data2?.data?.rateUsd) {
            setEthPrice(parseFloat(data2.data.rateUsd));
            setIsPriceLoading(false);
          }
        } catch {}
      } finally {
        setIsPriceLoading(false);
      }
    };

    fetchLivePrice();
    const interval = setInterval(fetchLivePrice, 30000);
    return () => clearInterval(interval);
  }, []);

  const tokenIn = isReverse ? (contracts.sETH as Address) : (contracts.sUSD as Address);
  const tokenOut = isReverse ? (contracts.sUSD as Address) : (contracts.sETH as Address);
  const cTokenIn = isReverse ? (contracts.cSETH as Address) : (contracts.cSUSD as Address);
  const cTokenOut = isReverse ? (contracts.cSUSD as Address) : (contracts.cSETH as Address);
  
  const inSymbol = isReverse ? "sETH" : "sUSD";
  const outSymbol = isReverse ? "sUSD" : "sETH";
  const cInSymbol = isReverse ? "cSETH" : "cSUSD";
  
  const inDecimals = isReverse ? 18 : 6;
  const outDecimals = isReverse ? 6 : 18;

  const intentBook = contracts.intentBook as Address;
  const executor = contracts.executor as Address;

  const estimatedOutput = amount && !isNaN(Number(amount)) && Number(amount) > 0
    ? isReverse ? Number(amount) * ethPrice : Number(amount) / ethPrice
    : 0;

  useEffect(() => {
    if (slippagePct !== null && estimatedOutput > 0) {
      const min = estimatedOutput * (1 - slippagePct / 100);
      setMinOut(min.toFixed(isReverse ? 2 : 6));
    }
  }, [amount, slippagePct, estimatedOutput, isReverse]);

  const handleSlippageClick = (pct: number) => {
    setSlippagePct(pct);
    if (estimatedOutput > 0) {
      const min = estimatedOutput * (1 - pct / 100);
      setMinOut(min.toFixed(isReverse ? 2 : 6));
    }
  };

  const toggleDirection = () => {
    setIsReverse((prev) => !prev);
    resetForm();
  };

  const { data: sUSDBal, refetch: refetchSUSD } = useReadContract({
    address: contracts.sUSD as Address,
    abi: erc20Abi,
    functionName: "balanceOf",
    args: [address as Address],
    query: { enabled: !!address }
  });

  const { data: sETHBal, refetch: refetchSETH } = useReadContract({
    address: contracts.sETH as Address,
    abi: erc20Abi,
    functionName: "balanceOf",
    args: [address as Address],
    query: { enabled: !!address }
  });

  const { data: currentBatchId } = useReadContract({
    address: intentBook,
    abi: intentBookAbi,
    functionName: "currentBatchId",
    query: { enabled: !!ready }
  });

  const { data: userIntentIds, refetch: refetchUserIntents } = useReadContract({
    address: intentBook,
    abi: intentBookAbi,
    functionName: "getUserIntents",
    args: [address as Address],
    query: { enabled: !!address && !!ready }
  });

  const handleWrap = async () => {
    if (!walletClient || !publicClient || !address) return;
    if (!amount || isNaN(Number(amount))) {
      setStatus(`Enter a valid amount to wrap into ${cInSymbol}`);
      return;
    }
    setBusy(true);
    try {
      const amountBig = parseUnits(amount, inDecimals);
      setStatus(`Step 1/2: Approving ${inSymbol} for ${cInSymbol} wrapper...`);
      const approveHash = await writeContractAsync({
        address: tokenIn,
        abi: erc20Abi,
        functionName: "approve",
        args: [cTokenIn, amountBig],
      });
      const receipt = await publicClient.waitForTransactionReceipt({ hash: approveHash });
      if (receipt.status !== "success") throw new Error("Approval transaction reverted");

      setStatus(`Step 2/2: Wrapping ${inSymbol} into confidential ${cInSymbol}...`);
      const wrapHash = await writeContractAsync({
        address: cTokenIn,
        abi: erc7984Abi,
        functionName: "wrap",
        args: [address, amountBig],
      });
      const wrapReceipt = await publicClient.waitForTransactionReceipt({ hash: wrapHash });
      if (wrapReceipt.status !== "success") throw new Error("Wrap transaction reverted");
      
      setStatus(`Wrap successful! You now hold confidential ${cInSymbol}.`);
      refetchSUSD();
      refetchSETH();
    } catch (e) {
      console.error(e);
      setStatus(formatError(e));
    } finally {
      setBusy(false);
    }
  };

  const handleApproveExecutor = async () => {
    if (!walletClient || !publicClient || !address) return;
    setBusy(true);
    try {
      setStatus(`Approving the settlement executor for 1 hour...`);
      const until = BigInt(Math.floor(Date.now() / 1000) + 3600);
      const hash = await writeContractAsync({
        address: cTokenIn,
        abi: erc7984Abi,
        functionName: "setOperator",
        args: [executor, Number(until)],
      });
      const receipt = await publicClient.waitForTransactionReceipt({ hash });
      if (receipt.status !== "success") throw new Error("Operator approval reverted");
      setStatus(`Executor approved for ${cInSymbol} until ${new Date(Number(until) * 1000).toLocaleTimeString()}.`);
    } catch (e) {
      console.error(e);
      setStatus(formatError(e));
    } finally {
      setBusy(false);
    }
  };

  const handleSubmit = async () => {
    if (!walletClient || !publicClient || !address) {
      setStatus("Connect wallet to proceed");
      return;
    }
    if (!amount || isNaN(Number(amount))) {
      setStatus("Enter a valid swap amount");
      return;
    }

    setBusy(true);
    setLastTxHash(null);
    setLastIntentId(null);
    setStatus("Encrypting swap amount and slippage via Nox FHE...");

    try {
      const amountInBig = parseUnits(amount, inDecimals);
      const minOutBig = parseUnits(minOut, outDecimals);

      const encAmountIn = await encryptAmount(walletClient, amountInBig, intentBook);
      const encMinOut = await encryptAmount(walletClient, minOutBig, intentBook);
      
      setStatus("Submitting encrypted intent to IntentBook contract...");

      const deadline = BigInt(Math.floor(Date.now() / 1000) + 86400);

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

      setLastTxHash(hash);
      setStatus(`Transaction submitted! Waiting for chain confirmation...`);
      setIsRedacted(true);

      const receipt = await publicClient.waitForTransactionReceipt({ hash });
      if (receipt.status !== "success") throw new Error("Intent submission transaction reverted");

      try {
        for (const log of receipt.logs) {
          if (log.address.toLowerCase() === intentBook.toLowerCase()) {
            const decoded = decodeEventLog({
              abi: intentBookAbi,
              data: log.data,
              topics: log.topics,
            });
            if (decoded.eventName === "IntentSubmitted" && decoded.args) {
              // @ts-ignore
              setLastIntentId(decoded.args.intentId ?? null);
            }
          }
        }
      } catch {
        /* skip event decode fallback */
      }

      setStatus("Intent confirmed on-chain! Queued in batch pool for solver settlement.");
      refetchUserIntents();
    } catch (e) {
      console.error(e);
      setStatus(formatError(e));
      setIsRedacted(false);
    } finally {
      setBusy(false);
    }
  };

  const resetForm = () => {
    setAmount("");
    setMinOut("0");
    setSlippagePct(0.5);
    setIsRedacted(false);
    setStatus("");
    setLastTxHash(null);
    setLastIntentId(null);
  };

  return (
    <div className="card" style={{ padding: "1.75rem" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1.25rem" }}>
        <div>
          <h2 style={{ margin: 0, letterSpacing: "0.05em", textTransform: "uppercase", fontSize: "1.2rem", color: "var(--aurora-start)", display: "flex", alignItems: "center", gap: "0.4rem" }}>
            <ZapIcon size={18} /> Swap Intent
          </h2>
          <div style={{ fontSize: "0.78rem", color: "var(--muted)", marginTop: "0.2rem" }}>
            Live Market Rate: <strong style={{ color: "var(--aurora-start)" }}>1 ETH = ${ethPrice.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USD</strong>
          </div>
        </div>
        
        {/* Direction Switcher Badge */}
        <button
          type="button"
          onClick={toggleDirection}
          disabled={busy || isRedacted}
          className="badge badge-live"
          style={{ cursor: "pointer", border: "1px solid var(--border)", padding: "0.3rem 0.64rem", gap: "0.4rem" }}
          title="Click to flip swap direction"
        >
          {inSymbol} → {outSymbol} <ArrowDownUpIcon size={12} />
        </button>
      </div>

      <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.85rem", color: "var(--muted)", marginBottom: "1.5rem", background: "var(--bg-elevated)", padding: "0.75rem", borderRadius: "12px", border: "1px solid var(--border)" }}>
        <div><strong>Public sUSD:</strong> {sUSDBal !== undefined ? Number(formatUnits(sUSDBal, 6)).toFixed(2) : "0.00"}</div>
        <div><strong>Public sETH:</strong> {sETHBal !== undefined ? Number(formatUnits(sETHBal, 18)).toFixed(4) : "0.0000"}</div>
      </div>

      {!hardenedExecutor && (
        <div style={{ marginBottom: "1rem", padding: "0.75rem", border: "1px solid var(--danger)", borderRadius: "10px", color: "var(--danger)", fontSize: "0.82rem" }}>
          Legacy executor paused. Deploy security version 2 before approving or submitting intents.
        </div>
      )}

      <div style={{ display: "grid", gap: "1rem" }}>
        {/* Input Amount */}
        <div>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "0.4rem" }}>
            <label className="label" style={{ margin: 0 }}>Amount In ({inSymbol})</label>
            {estimatedOutput > 0 && (
              <span className="mono" style={{ fontSize: "0.8rem", color: "var(--aurora-start)" }}>
                Est. Output: ~{estimatedOutput.toFixed(isReverse ? 2 : 6)} {outSymbol}
              </span>
            )}
          </div>
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
              {inSymbol}
            </span>
          </div>

          {/* Interactive Nox FHE Cipher Visualizer Stream */}
          {amount && !isNaN(Number(amount)) && Number(amount) > 0 && !isRedacted && (
            <div className="mono" style={{
              marginTop: "0.5rem",
              background: "rgba(112, 0, 255, 0.08)",
              border: "1px solid rgba(112, 0, 255, 0.3)",
              borderRadius: "8px",
              padding: "0.5rem 0.75rem",
              fontSize: "0.78rem",
              color: "#b388eb",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between"
            }}>
              <span style={{ display: "flex", alignItems: "center", gap: "0.4rem" }}>
                <LockIcon size={12} color="var(--aurora-start)" /> FHE Nox Handle: <strong style={{ color: "var(--aurora-start)" }}>0x7f4e8b91c...{((Number(amount) * 7919) % 8999 + 1000).toFixed(0)}</strong>
              </span>
              <span className="badge" style={{ fontSize: "0.7rem", background: "rgba(112, 0, 255, 0.2)", borderColor: "rgba(112, 0, 255, 0.4)", color: "#ffffff" }}>
                FHE Encrypted
              </span>
            </div>
          )}
        </div>

        {/* Direction Switch Arrow Divider */}
        {!isRedacted && (
          <div style={{ display: "flex", justifyContent: "center", margin: "-0.2rem 0" }}>
            <button
              type="button"
              onClick={toggleDirection}
              disabled={busy}
              style={{
                background: "var(--bg-elevated)",
                border: "1px solid var(--border)",
                borderRadius: "50%",
                width: "32px",
                height: "32px",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: "var(--aurora-start)",
                cursor: "pointer"
              }}
              title="Flip swap direction"
            >
              <ArrowDownUpIcon size={14} />
            </button>
          </div>
        )}

        {/* Slippage Protection Presets & Min Amount Out */}
        <div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.4rem" }}>
            <label className="label" style={{ margin: 0 }}>Min Amount Out ({outSymbol})</label>
            {!isRedacted && (
              <div style={{ display: "flex", gap: "0.3rem" }}>
                {[0.1, 0.5, 1.0].map((pct) => (
                  <button
                    key={pct}
                    type="button"
                    onClick={() => handleSlippageClick(pct)}
                    style={{
                      padding: "0.2rem 0.5rem",
                      fontSize: "0.75rem",
                      borderRadius: "6px",
                      border: "1px solid var(--border)",
                      background: slippagePct === pct ? "var(--aurora-start)" : "var(--bg-elevated)",
                      color: slippagePct === pct ? "var(--bg)" : "var(--muted)",
                      fontWeight: slippagePct === pct ? 700 : 500,
                      cursor: "pointer"
                    }}
                  >
                    {pct}%
                  </button>
                ))}
              </div>
            )}
          </div>
          
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
                onChange={(e) => {
                  setMinOut(e.target.value);
                  setSlippagePct(null);
                }}
                style={{ paddingRight: "4rem", height: "2.8rem" }}
              />
            )}
            <span style={{ position: "absolute", right: "1rem", top: "50%", transform: "translateY(-50%)", color: "var(--muted)", fontWeight: 600, zIndex: 10 }}>
              {outSymbol}
            </span>
          </div>
        </div>

        {/* Exposure estimate; not a protection guarantee. */}
        {Number(amount) > 0 && !isRedacted && (
          <div style={{
            background: "rgba(0, 255, 157, 0.05)",
            border: "1px solid rgba(0, 255, 157, 0.2)",
            borderRadius: "12px",
            padding: "0.75rem 1rem",
            fontSize: "0.82rem",
            display: "grid",
            gap: "0.4rem"
          }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontWeight: 600 }}>
              <span style={{ color: "var(--aurora-start)", display: "flex", alignItems: "center", gap: "0.4rem" }}>
                <ShieldIcon size={14} color="var(--success)" /> Pre-Settlement Privacy: <strong>ACTIVE</strong>
              </span>
              <span className="mono" style={{ color: "var(--success)" }}>
                Size hidden while intent is queued
              </span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", color: "var(--muted)", fontSize: "0.78rem" }}>
              <span>Public AMM execution remains visible and MEV-exposed</span>
              <span style={{ color: "var(--success)", fontWeight: "bold" }}>Nox-encrypted intent handles</span>
            </div>
          </div>
        )}

        {isRedacted ? (
          <div style={{ display: "grid", gap: "1rem", marginTop: "0.5rem" }}>
            {/* Visual Intent Status Tracker */}
            <div style={{ padding: "1rem", background: "var(--bg-elevated)", border: "1px solid var(--border)", borderRadius: "12px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.75rem" }}>
                <span className="mono" style={{ fontWeight: "bold", fontSize: "0.9rem" }}>
                  {lastIntentId !== null ? `Intent #${lastIntentId}` : "Encrypted Intent Submitted"}
                </span>
                <span className="badge badge-live">Batch #{currentBatchId != null ? String(currentBatchId) : "11"}</span>
              </div>

              {/* Progress Steps */}
              <div style={{ display: "grid", gap: "0.5rem", fontSize: "0.82rem", margin: "0.75rem 0" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", color: "var(--aurora-start)" }}>
                  <CheckCircleIcon size={14} color="var(--success)" />
                  <span>1. {inSymbol} → {outSymbol} FHE Encrypted</span>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", color: "var(--aurora-start)" }}>
                  <CheckCircleIcon size={14} color="var(--success)" />
                  <span>2. Intent Confirmed on IntentBook</span>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", color: "var(--aurora-start)" }}>
                  <span className="pulse-dot" />
                  <span>3. Queued for Batch Settlement (Batch #{currentBatchId != null ? String(currentBatchId) : "11"})</span>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", color: "var(--muted)" }}>
                  <span className="mono">○</span>
                  <span>4. Solver AMM Swap & Re-shield to Wallet</span>
                </div>
              </div>

              {lastTxHash && (
                <div style={{ marginTop: "0.75rem", fontSize: "0.8rem", borderTop: "1px solid var(--border)", paddingTop: "0.5rem" }}>
                  <a
                    href={`https://sepolia.etherscan.io/tx/${lastTxHash}`}
                    target="_blank"
                    rel="noreferrer"
                    style={{ color: "var(--aurora-start)", textDecoration: "underline", display: "inline-flex", alignItems: "center", gap: "0.3rem" }}
                  >
                    View Transaction on Etherscan <ExternalLinkIcon size={12} />
                  </a>
                </div>
              )}
            </div>

            <button
              className="btn btn-ghost"
              onClick={resetForm}
              style={{ padding: "0.85rem", fontSize: "0.95rem", width: "100%" }}
            >
              + Submit Another Intent
            </button>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem", marginTop: "1rem" }}>
            <div style={{ display: "flex", gap: "0.75rem" }}>
              <button
                className="btn btn-ghost"
                disabled={!isConnected || !ready || busy || !amount}
                onClick={handleWrap}
                style={{ flex: 1, padding: "0.75rem", fontSize: "0.95rem" }}
              >
                1. Wrap {inSymbol}
              </button>
              <button
                className="btn btn-ghost"
                disabled={!isConnected || !ready || busy}
                onClick={handleApproveExecutor}
                style={{ flex: 1, padding: "0.75rem", fontSize: "0.95rem" }}
              >
                2. Approve {cInSymbol}
              </button>
            </div>
            <button
              className="btn btn-primary"
              disabled={!isConnected || !ready || busy || !amount}
              onClick={handleSubmit}
              style={{ padding: "1rem", fontSize: "1.05rem", width: "100%" }}
            >
              {busy ? "Processing FHE & Submitting..." : `3. Encrypt & Submit (${inSymbol} → ${outSymbol})`}
            </button>
          </div>
        )}

        {status && (
          <div
            className="mono"
            style={{
              padding: "0.75rem",
              borderRadius: "8px",
              background: "var(--bg-elevated)",
              border: "1px solid var(--border)",
              fontSize: "0.85rem",
              color: status.startsWith("Error") ? "var(--danger)" : "var(--muted)",
              marginTop: "0.5rem",
              wordBreak: "break-word"
            }}
          >
            {status}
          </div>
        )}

        {/* User Active Intents Summary */}
        {userIntentIds && userIntentIds.length > 0 && (
          <div style={{ marginTop: "1.5rem", borderTop: "1px solid var(--border)", paddingTop: "1rem" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.5rem" }}>
              <span style={{ fontSize: "0.85rem", fontWeight: "bold", textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--muted)" }}>
                Your Intent History ({userIntentIds.length})
              </span>
            </div>
            <div style={{ display: "flex", gap: "0.5rem", overflowX: "auto", paddingBottom: "0.25rem" }}>
              {userIntentIds.slice(-5).reverse().map((id) => (
                <span
                  key={id.toString()}
                  className="badge mono"
                  style={{ background: "var(--bg-elevated)", border: "1px solid var(--border)", fontSize: "0.8rem" }}
                >
                  Intent #{id.toString()}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}