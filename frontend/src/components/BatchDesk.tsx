"use client";

import { useMemo, useState } from "react";
import {
  useAccount,
  useReadContract,
  useWriteContract,
  useWalletClient,
  usePublicClient,
} from "wagmi";
import { type Address, type Hash, isAddress, zeroAddress, formatUnits } from "viem";
import deployments from "@/lib/deployments.json";
import { intentBookAbi, executorAbi } from "@/lib/abis";
import {
  loadBatchIntents,
  runBatchSettlement,
  type BatchSettleState,
  type BatchSettleStep,
  type IntentClearAmounts,
} from "@/lib/settleBatch";

const STEP_LABEL: Record<BatchSettleStep, string> = {
  idle: "Idle",
  "load-batch": "Load batch",
  seal: "Seal batch",
  "per-intent": "Unwrap intents",
  "execute-batch": "Net AMM swap",
  done: "Settled",
  error: "Error",
};

const STATUS = ["None", "Pending", "Batched", "Executed", "Cancelled"] as const;

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
  const { writeContractAsync, isPending } = useWriteContract();

  const c = deployments.contracts as Record<string, string>;
  const ready = hasDeployed(c.intentBook) && hasDeployed(c.executor);

  const [batchIdInput, setBatchIdInput] = useState("");
  const [preview, setPreview] = useState<{
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
      setStatus(`Error: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setBusy(false);
    }
  }

  const sealBatch = async () => {
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
      setStatus(`Error: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setBusy(false);
    }
  };

  const runBatch = async () => {
    if (!walletClient || !publicClient || !address) {
      setStatus("Connect wallet");
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
      setStatus(`Error: ${e instanceof Error ? e.message : String(e)}`);
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
    <div className="card" style={{ padding: "1.75rem" }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: "1rem", flexWrap: "wrap" }}>
        <div>
          <h2 style={{ margin: 0, letterSpacing: "0.05em", textTransform: "uppercase", fontSize: "1.2rem", color: "var(--aurora-start)" }}>Batch settlement</h2>
          <p style={{ color: "var(--muted)", margin: "0.4rem 0 0" }}>
            Seal window → unwrap each intent → <strong style={{ color: "var(--text)" }}>one</strong>{" "}
            AMM swap → pro-rata re-shield
          </p>
        </div>
        <span className="badge">{ready ? "batch ready" : "awaiting deploy"}</span>
      </div>

      <div style={{ display: "grid", gap: "0.9rem", marginTop: "1.25rem" }}>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr 1fr",
            gap: "0.75rem",
            fontSize: "0.9rem",
            color: "var(--muted)",
          }}
        >
          <div className="card" style={{ padding: "0.75rem", background: "var(--bg-elevated)", border: "none" }}>
            Current batch
            <div className="mono" style={{ color: "var(--text)", marginTop: 4 }}>
              {currentBatchId != null ? String(currentBatchId) : "—"}
            </div>
          </div>
          <div className="card" style={{ padding: "0.75rem", background: "var(--bg-elevated)", border: "none" }}>
            Window
            <div className="mono" style={{ color: "var(--text)", marginTop: 4 }}>
              {windowSec}s
            </div>
          </div>
          <div className="card" style={{ padding: "0.75rem", background: "var(--bg-elevated)", border: "none" }}>
            Open age
            <div className="mono" style={{ color: "var(--text)", marginTop: 4 }}>
              {openAge != null ? `${openAge}s` : "—"}
            </div>
          </div>
        </div>

        <div style={{ display: "grid", gap: "0.6rem", gridTemplateColumns: "1fr auto auto auto" }}>
          <input
            className="input"
            placeholder={
              currentBatchId != null
                ? `Batch id (default current: ${currentBatchId})`
                : "Batch id"
            }
            value={batchIdInput}
            onChange={(e) => setBatchIdInput(e.target.value)}
          />
          <button
            className="btn btn-ghost"
            disabled={!ready || busy}
            onClick={() => {
              if (currentBatchId != null) setBatchIdInput(String(currentBatchId));
            }}
          >
            Use current
          </button>
          <button className="btn btn-ghost" disabled={!ready || busy} onClick={loadPreview}>
            Preview
          </button>
          <button className="btn btn-ghost" disabled={!isConnected || busy} onClick={sealBatch}>
            Seal
          </button>
        </div>

        {preview && (
          <div
            style={{
              border: "1px solid var(--border)",
              borderRadius: 12,
              padding: "0.85rem",
              background: "var(--bg-elevated)",
            }}
          >
            <div style={{ display: "flex", flexWrap: "wrap", gap: "0.4rem", marginBottom: "0.65rem" }}>
              <span className="badge">
                {preview.isSealed ? "sealed" : "open"}
                {preview.isExecuted ? " · executed" : ""}
              </span>
              <span className="badge">
                {preview.intents.length} / {preview.allIds.length} settleable (same pair)
              </span>
              {preview.pairLabel && (
                <span className="badge mono" title={preview.pairLabel}>
                  pair {preview.pairLabel.slice(0, 18)}…
                </span>
              )}
            </div>

            {preview.intents.length === 0 ? (
              <p style={{ color: "var(--muted)", fontSize: "0.85rem", margin: 0 }}>
                No Pending/Batched intents. Submit encrypted intents on the swap desk first (same
                direction helps netting).
              </p>
            ) : (
              <div style={{ display: "grid", gap: "0.4rem" }}>
                {preview.intents.map((it) => {
                  const key = it.intentId.toString();
                  return (
                    <label
                      key={key}
                      style={{
                        display: "grid",
                        gridTemplateColumns: "auto 1fr auto",
                        gap: "0.65rem",
                        alignItems: "center",
                        padding: "0.45rem 0.55rem",
                        borderRadius: 8,
                        border: "1px solid var(--border)",
                        fontSize: "0.82rem",
                        cursor: "pointer",
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={!!selected[key]}
                        onChange={(e) =>
                          setSelected((s) => ({ ...s, [key]: e.target.checked }))
                        }
                      />
                      <span className="mono">
                        #{key} · {short(it.user)} · {STATUS[it.status] ?? it.status}
                      </span>
                      <span style={{ color: "var(--muted)" }}>
                        {short(it.tokenIn)}→{short(it.tokenOut)}
                      </span>
                    </label>
                  );
                })}
              </div>
            )}

            <div style={{ marginTop: "0.85rem", display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
              <button
                className="btn btn-primary"
                disabled={!isConnected || busy || preview.intents.length === 0 || preview.isExecuted}
                onClick={runBatch}
              >
                {busy ? "Settling batch…" : "Run batch settle"}
              </button>
              <span style={{ color: "var(--muted)", fontSize: "0.78rem", alignSelf: "center" }}>
                Requires each user set executor as operator on their cTokenIn.
              </span>
            </div>
          </div>
        )}

        {settle && (
          <div
            style={{
              display: "grid",
              gap: "0.5rem",
              padding: "0.85rem",
              borderRadius: 12,
              border: "1px solid var(--border)",
              background: "var(--bg-elevated)",
            }}
          >
            <div style={{ display: "flex", flexWrap: "wrap", gap: "0.4rem", alignItems: "center" }}>
              <span className="badge">{STEP_LABEL[settle.step]}</span>
              {settle.progressIndex != null && settle.progressTotal != null && (
                <span className="badge">
                  intent {settle.progressIndex}/{settle.progressTotal}
                </span>
              )}
              {settle.netIn != null && (
                <span className="badge badge-live">
                  netIn {settle.netIn.toString()}
                  {settle.clears[0] &&
                    ` (~${formatUnits(settle.netIn, settle.clears[0].tokenIn.toLowerCase() === (c.sUSD as string).toLowerCase() ? 6 : 18)})`}
                </span>
              )}
              {settle.step === "done" && (
                <span className="badge badge-live">single AMM touch</span>
              )}
            </div>
            <ol
              className="mono"
              style={{
                margin: 0,
                paddingLeft: "1.2rem",
                fontSize: "0.78rem",
                color: "var(--muted)",
                maxHeight: 200,
                overflow: "auto",
              }}
            >
              {settle.log.map((line, i) => (
                <li
                  key={i}
                  style={{
                    marginBottom: 2,
                    color: line.startsWith("Error") ? "var(--danger)" : undefined,
                  }}
                >
                  {line}
                </li>
              ))}
            </ol>
          </div>
        )}

        {status && (
          <div
            className="mono"
            style={{
              padding: "0.75rem",
              borderRadius: 12,
              background: "var(--bg-elevated)",
              border: "1px solid var(--border)",
              fontSize: "0.82rem",
              wordBreak: "break-word",
            }}
          >
            {status}
          </div>
        )}

        <p style={{ color: "var(--muted)", fontSize: "0.82rem", margin: 0 }}>
          Demo tip: submit 2+ intents same direction within the {windowSec}s window, seal, then run
          batch settle. Chain observers see one pool trade instead of N sized swaps.
        </p>
      </div>
    </div>
  );
}
