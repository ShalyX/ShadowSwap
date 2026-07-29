"use client";

import { useState, useEffect } from "react";
import { useAccount, useWalletClient, usePublicClient, useWriteContract, useReadContract } from "wagmi";
import { parseUnits, formatUnits, isAddress, Address, decodeEventLog } from "viem";
import deployments from "@/lib/deployments.json";
import { intentBookAbi, erc20Abi, erc7984Abi, ammAbi } from "@/lib/abis";
import { encryptAmount } from "@/lib/nox";
import { applySlippageToQuote } from "@/lib/quote";
import { formatError } from "@/lib/errors";
import { ShieldIcon, LockIcon, ZapIcon, ArrowDownUpIcon, ExternalLinkIcon, CheckCircleIcon } from "@/components/Icons";

export function SwapDesk() {
  const { address, isConnected } = useAccount();
  const { data: walletClient } = useWalletClient();
  const publicClient = usePublicClient();
  const { writeContractAsync } = useWriteContract();
  
  const contracts = deployments.contracts as Record<string, string>;
  const deploymentConfig = deployments.config as { executorSecurityVersion?: number };
  const hardenedExecutor = deploymentConfig.executorSecurityVersion === 4;
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

  let quoteAmountIn = 0n;
  try {
    if (amount && Number(amount) > 0) quoteAmountIn = parseUnits(amount, inDecimals);
  } catch {
    quoteAmountIn = 0n;
  }

  const { data: routeAmounts } = useReadContract({
    address: contracts.simpleAMM as Address,
    abi: ammAbi,
    functionName: "getAmountsOut",
    args: [quoteAmountIn, [tokenIn, tokenOut]],
    query: { enabled: !!ready && quoteAmountIn > 0n },
  });
  const quotedOutput = routeAmounts?.[routeAmounts.length - 1] ?? 0n;
  const estimatedOutput = Number(formatUnits(quotedOutput, outDecimals));

  useEffect(() => {
    if (slippagePct !== null && quotedOutput > 0n) {
      setMinOut(formatUnits(applySlippageToQuote(quotedOutput, slippagePct), outDecimals));
    }
  }, [slippagePct, quotedOutput, outDecimals]);

  const handleSlippageClick = (pct: number) => {
    setSlippagePct(pct);
    if (quotedOutput > 0n) {
      setMinOut(formatUnits(applySlippageToQuote(quotedOutput, pct), outDecimals));
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
      setStatus(`Approving the settlement executor through the intent lifetime...`);
      // Intents remain valid for 24 hours. Keep the operator grant alive one
      // additional hour so a batch sealed near expiry can still settle.
      const until = BigInt(Math.floor(Date.now() / 1000) + 90000);
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
    <section className={`veil-order ${isRedacted ? "is-sealed" : ""}`}>
      <header className="order-route">
        <div>
          <span className="section-label">PRIVATE ORDER</span>
          <strong>{inSymbol} <i>into</i> {outSymbol}</strong>
        </div>
        <button type="button" onClick={toggleDirection} disabled={busy || isRedacted} className="route-switch">
          Reverse route <ArrowDownUpIcon size={14} />
        </button>
        <span className="market-rate">1 ETH · ${ethPrice.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}{isPriceLoading ? " · checking" : ""}</span>
      </header>

      {!hardenedExecutor && <div className="instrument-error">Legacy executor paused. Security version 4 is required.</div>}

      <div className="private-field">
        <div className="field-meta">
          <span>PRIVATE ABOVE THIS LINE</span>
          <span>{isConnected ? `Public balances · ${sUSDBal !== undefined ? Number(formatUnits(sUSDBal, 6)).toFixed(2) : "0.00"} sUSD · ${sETHBal !== undefined ? Number(formatUnits(sETHBal, 18)).toFixed(4) : "0.0000"} sETH` : "Connect to read wallet balances"}</span>
        </div>

        <label className="amount-field">
          <span>Amount in</span>
          <div>
            {isRedacted ? <output aria-label="Encrypted amount">██████</output> : <input type="number" inputMode="decimal" placeholder="0" value={amount} onChange={(event) => setAmount(event.target.value)} />}
            <b>{inSymbol}</b>
          </div>
        </label>

        <div className="minimum-field">
          <label>
            <span>Minimum out</span>
            {isRedacted ? <output aria-label="Encrypted minimum output">██████</output> : <input type="number" inputMode="decimal" value={minOut} onChange={(event) => { setMinOut(event.target.value); setSlippagePct(null); }} />}
            <b>{outSymbol}</b>
          </label>
          {!isRedacted && (
            <div className="tolerance-set" aria-label="Slippage tolerance">
              <span>Tolerance</span>
              {[0.1, 0.5, 1].map((pct) => <button key={pct} type="button" data-active={slippagePct === pct} onClick={() => handleSlippageClick(pct)}>{pct}%</button>)}
            </div>
          )}
        </div>
      </div>

      <div className="execution-line">
        <span>THE VEIL</span><i aria-hidden="true" /><span>{isRedacted ? "INTENT SEALED" : "CROSSES ONLY AT SETTLEMENT"}</span>
      </div>

      <div className="public-field">
        <div>
          <span>PUBLIC BELOW THIS LINE</span>
          <strong>{estimatedOutput > 0 ? `≈ ${estimatedOutput.toFixed(isReverse ? 2 : 6)} ${outSymbol}` : "AMM execution appears here"}</strong>
        </div>
        <p>Public execution remains visible and MEV-exposed. Compatible flow may share one pool interaction.</p>
      </div>

      {isRedacted ? (
        <div className="sealed-receipt">
          <div><span>{lastIntentId !== null ? `INTENT ${lastIntentId}` : "ENCRYPTED INTENT"}</span><strong>{status || "Waiting for chain confirmation"}</strong><small>Batch {currentBatchId != null ? String(currentBatchId) : "pending"}</small></div>
          {lastTxHash && <a href={`https://sepolia.etherscan.io/tx/${lastTxHash}`} target="_blank" rel="noreferrer">View transaction <ExternalLinkIcon size={12} /></a>}
          <button onClick={resetForm}>Place another order</button>
        </div>
      ) : (
        <div className="order-actions">
          <div className="prepare-actions">
            <button disabled={!isConnected || !ready || busy || !amount} onClick={handleWrap}>Wrap {inSymbol}</button>
            <button disabled={!isConnected || !ready || busy} onClick={handleApproveExecutor}>Approve {cInSymbol}</button>
          </div>
          <button className="seal-action" disabled={!isConnected || !ready || busy || !amount} onClick={handleSubmit}>
            <span>{busy ? "Encrypting and submitting" : "Encrypt and queue intent"}</span>
            <small>{!isConnected ? "Connect wallet first" : `${inSymbol} → ${outSymbol}`}</small>
          </button>
        </div>
      )}

      {status && !isRedacted && <p className="instrument-status">{status}</p>}
      {userIntentIds && userIntentIds.length > 0 && <div className="intent-history"><span>Recent intents</span>{userIntentIds.slice(-5).reverse().map((id) => <b key={id.toString()}>#{id.toString()}</b>)}</div>}
    </section>
  );
}
