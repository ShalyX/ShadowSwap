"use client";

import { useMemo, useState } from "react";
import {
  useAccount,
  useReadContract,
  useWriteContract,
  useWalletClient,
  usePublicClient,
} from "wagmi";
import { type Address, type Hash, isAddress, zeroAddress } from "viem";
import deployments from "@/lib/deployments.json";
import { intentBookAbi, executorAbi } from "@/lib/abis";
import {
  loadBatchIntents,
  runBatchSettlement,
  type BatchSettleState,
  type BatchSettleStep,
  type IntentClearAmounts,
} from "@/lib/settleBatch";
import { formatError } from "@/lib/errors";

const STEP_LABEL: Record<BatchSettleStep, string> = {
  idle: "Idle",
  "load-batch": "Load batch",
  seal: "Seal batch",
  "per-intent": "Unwrap intents",
  "execute-batch": "Aggregate AMM swap",
  done: "Settled",
  error: "Error",
};

const STATUS = ["None", "Pending", "Batched", "Executed", "Cancelled", "Settling", "Refunded"] as const;

function hasDeployed(addr?: string) {
  return !!addr && isAddress(addr) && addr !== zeroAddress;
}

function short(addr: string) {
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

export function BatchDesk() {
  const { address, isConnected } = useAccount();
  const { data: walletClient } = useWalletClient();
  const publicClient = usePublicClient();
  const { writeContractAsync } = useWriteContract();

  const c = deployments.contracts as Record<string, string>;
  const deploymentConfig = deployments.config as { executorSecurityVersion?: number };
  const ready =
    deploymentConfig.executorSecurityVersion === 4 &&
    hasDeployed(c.intentBook) &&
    hasDeployed(c.executor);

  const [batchIdInput, setBatchIdInput] = useState("");
  const [preview, setPreview] = useState<{
    batchId: number;
    allIds: bigint[];
    intents: IntentClearAmounts[];
    isSealed: boolean;
    isExecuted: boolean;
    pairLabel: string | null;
    openAt: bigint;
  } | null>(null);
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [status, setStatus] = useState("");
  const [settle, setSettle] = useState<BatchSettleState | null>(null);
  const [busy, setBusy] = useState(false);

  const { data: currentBatchId, refetch: refetchBatchId } = useReadContract({
    address: c.intentBook as Address,
    abi: intentBookAbi,
    functionName: "currentBatchId",
    query: { enabled: ready },
  });

  const { data: batchWindow } = useReadContract({
    address: c.intentBook as Address,
    abi: intentBookAbi,
    functionName: "batchWindow",
    query: { enabled: ready },
  });

  const { data: isAuthorizedSolver } = useReadContract({
    address: c.executor as Address,
    abi: executorAbi,
    functionName: "authorizedSolvers",
    args: [address as Address],
    query: { enabled: ready && !!address },
  });

  const effectiveBatchId = useMemo(() => {
    if (batchIdInput.trim()) {
      try {
        return Number(batchIdInput.trim());
      } catch {
        return null;
      }
    }
    if (currentBatchId != null) return Number(currentBatchId);
    return null;
  }, [batchIdInput, currentBatchId]);

  async function loadPreview() {
    if (!publicClient || !ready || effectiveBatchId == null) {
      setStatus("Need public client + batch id");
      return;
    }
    setBusy(true);
    setStatus(`Loading batch #${effectiveBatchId}…`);
    try {
      const data = await loadBatchIntents(
        publicClient,
        c.intentBook as Address,
        effectiveBatchId
      );
      setPreview({
        batchId: effectiveBatchId,
        allIds: data.allIds,
        intents: data.intents,
        isSealed: data.isSealed,
        isExecuted: data.isExecuted,
        pairLabel: data.pairLabel,
        openAt: data.openAt,
      });
      const sel: Record<string, boolean> = {};
      for (const it of data.intents) sel[it.intentId.toString()] = true;
      setSelected(sel);
      setStatus(
        `Batch #${effectiveBatchId}: ${data.allIds.length} intents, ${data.intents.length} same-pair settleable` +
          (data.isSealed ? " · sealed" : " · open") +
          (data.isExecuted ? " · executed" : "")
      );
    } catch (e) {
      setStatus(formatError(e));
    } finally {
      setBusy(false);
    }
  }

  const sealBatch = async () => {
    if (!ready || !isConnected) {
      setStatus("Hardened batch transactions are unavailable on this deployment");
      return;
    }
    setBusy(true);
    try {
      setStatus("Sealing current batch…");
      const hash = await writeContractAsync({
        address: c.intentBook as Address,
        abi: intentBookAbi,
        functionName: "sealCurrentBatch",
      });
      if (publicClient) await publicClient.waitForTransactionReceipt({ hash });
      setStatus(`Sealed. tx ${hash.slice(0, 10)}…`);
      await refetchBatchId();
      await loadPreview();
    } catch (e) {
      setStatus(formatError(e));
    } finally {
      setBusy(false);
    }
  };

  const runBatch = async () => {
    if (!ready) {
      setStatus("Hardened batch transactions are unavailable on this deployment");
      return;
    }
    if (!walletClient || !publicClient || !address) {
      setStatus("Connect wallet");
      return;
    }
    if (!isAuthorizedSolver) {
      setStatus("This wallet is not authorized to run batch settlement");
      return;
    }
    if (effectiveBatchId == null) {
      setStatus("Enter batch id");
      return;
    }
    const only = Object.entries(selected)
      .filter(([, v]) => v)
      .map(([k]) => BigInt(k));
    if (only.length === 0) {
      setStatus("Select at least one intent");
      return;
    }

    setBusy(true);
    setSettle(null);
    try {
      const write = (async (args: {
        address: Address;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        abi: any;
        functionName: string;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        args?: readonly any[];
      }): Promise<Hash> => {
        return writeContractAsync({
          address: args.address,
          abi: args.abi,
          functionName: args.functionName,
          args: args.args,
        } as Parameters<typeof writeContractAsync>[0]);
      }) as import("@/lib/settleSolo").WriteFn;

      const final = await runBatchSettlement({
        publicClient,
        walletClient,
        write,
        executor: c.executor as Address,
        intentBook: c.intentBook as Address,
        batchId: effectiveBatchId,
        sealIfNeeded: true,
        onlyIntentIds: only,
        onProgress: (s) => {
          setSettle({ ...s });
          setStatus(s.log[s.log.length - 1] ?? STEP_LABEL[s.step]);
        },
      });
      setSettle(final);
      await loadPreview();
    } catch (e) {
      setStatus(formatError(e));
    } finally {
      setBusy(false);
    }
  };

  const windowSec = batchWindow != null ? Number(batchWindow) : 300;
  const openAge =
    preview?.openAt != null && preview.openAt > 0n
      ? Math.max(0, Math.floor(Date.now() / 1000) - Number(preview.openAt))
      : null;

  return (
    <section className="solver-console" aria-label="Batch settlement console">
      <header className="solver-console-head">
        <div><span className="section-label">AUTHORIZED SOLVER</span><h2>Settle the crowd<br />as one move.</h2></div>
        <div className="solver-thesis"><span data-ready={ready}>{ready ? "EXECUTOR V4 READY" : "DEPLOYMENT UNAVAILABLE"}</span><p>Each confidential intent unwraps separately. Compatible inputs cross the public AMM once, then return pro-rata behind the veil.</p></div>
      </header>

      <div className="solver-ledger" aria-label="Batch timing">
        <div><span>Current intake</span><strong>{currentBatchId != null ? String(currentBatchId) : "—"}</strong></div>
        <div><span>Seal window</span><strong>{windowSec}s</strong></div>
        <div><span>Open age</span><strong>{openAge != null ? `${openAge}s` : "—"}</strong></div>
      </div>

      <div className="solver-controls">
        <label><span>Batch to inspect</span><input placeholder={currentBatchId != null ? `Default ${currentBatchId}` : "Batch id"} inputMode="numeric" value={batchIdInput} onChange={(event) => setBatchIdInput(event.target.value)} /></label>
        <div>
          <button disabled={!ready || busy} onClick={() => currentBatchId != null && setBatchIdInput(String(currentBatchId))}>Use current</button>
          <button disabled={!ready || busy} onClick={loadPreview}>Inspect</button>
          <button className="solver-seal" disabled={!ready || !isConnected || busy} onClick={sealBatch}>Seal current</button>
        </div>
      </div>

      {preview ? (
        <section className="batch-manifest">
          <header>
            <div><span className="section-label">VIEWING BATCH {preview.batchId}</span><h3>{preview.intents.length} of {preview.allIds.length} intents can move together.</h3></div>
            <div className="batch-state"><span>{preview.isExecuted ? "EXECUTED" : preview.isSealed ? "SEALED" : "OPEN"}</span>{preview.pairLabel && <code title={preview.pairLabel}>{preview.pairLabel.slice(0, 22)}…</code>}</div>
          </header>
          {preview.intents.length === 0 ? <p className="solver-empty">No live same-pair intents remain in this batch.</p> : (
            <div className="intent-manifest">{preview.intents.map((intent) => { const key = intent.intentId.toString(); return (
              <label key={key}><input type="checkbox" checked={!!selected[key]} onChange={(event) => setSelected((state) => ({ ...state, [key]: event.target.checked }))} /><strong>#{key}</strong><span>{short(intent.user)}</span><code>{short(intent.tokenIn)} → {short(intent.tokenOut)}</code><b>{STATUS[intent.status] ?? intent.status}</b></label>
            ); })}</div>
          )}
          <div className="batch-execute">
            <button disabled={!ready || !isConnected || !isAuthorizedSolver || busy || preview.intents.length === 0 || preview.isExecuted} onClick={runBatch}>{busy ? "SETTLEMENT IN PROGRESS" : "RUN ONE PUBLIC AMM SWAP"}</button>
            <p>{!isConnected ? "Connect the authorized solver wallet." : !isAuthorizedSolver ? "Connected wallet is not an authorized solver." : "Selected users must still have active executor grants."}</p>
          </div>
        </section>
      ) : <div className="solver-awaiting"><span>NO BATCH LOADED</span><p>Inspect the current intake or enter an older batch ID. Current-chain state and inspected state are shown separately.</p></div>}

      {settle && <section className="settlement-trace"><header><span>{STEP_LABEL[settle.step]}</span>{settle.progressIndex != null && settle.progressTotal != null && <b>{settle.progressIndex}/{settle.progressTotal}</b>}{settle.step === "done" && <strong>ONE AMM TOUCH</strong>}</header><ol>{settle.log.map((line, index) => <li key={index} data-error={line.startsWith("Error")}>{line}</li>)}</ol></section>}
      {status && <output className="solver-status">{status}</output>}
      <footer className="solver-footnote"><span>OPERATOR PATH</span><p>This is a browser-driven solver console. It does not run autonomously after the tab closes.</p></footer>
    </section>
  );
}
