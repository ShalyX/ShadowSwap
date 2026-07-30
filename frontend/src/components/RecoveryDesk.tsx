"use client";

import { useCallback, useEffect, useState } from "react";
import { useAccount, usePublicClient, useWriteContract } from "wagmi";
import { Address, formatUnits } from "viem";
import deployments from "@/lib/deployments.json";
import { executorAbi, intentBookAbi } from "@/lib/abis";
import { isTargetChain, TARGET_CHAIN_ID, TARGET_CHAIN_LABEL } from "@/lib/chains";
import { formatError } from "@/lib/errors";
import { effectiveRecoveryStatus, getRecoveryPresentation, RecoveryKind } from "@/lib/recoveryUi";

type RecoveryRow = {
  id: bigint;
  kind: RecoveryKind;
  owner: Address;
  status: number;
  finalizedAmount: bigint;
};

const INCIDENT_INTENTS: ReadonlyArray<{ id: bigint; kind: RecoveryKind }> = [
  { id: 3n, kind: "finalized" },
  { id: 4n, kind: "finalized" },
  { id: 5n, kind: "finalized" },
  { id: 6n, kind: "confidential" },
];

export function RecoveryDesk() {
  const { address, isConnected, chainId } = useAccount();
  const publicClient = usePublicClient();
  const { writeContractAsync } = useWriteContract();
  const contracts = deployments.contracts as Record<string, string>;
  const intentBook = contracts.intentBook as Address;
  const executor = contracts.executor as Address;

  const [rows, setRows] = useState<RecoveryRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<bigint | null>(null);
  const [confirmedIds, setConfirmedIds] = useState<Set<bigint>>(() => new Set());
  const [message, setMessage] = useState("");

  const refresh = useCallback(async () => {
    if (!publicClient) return;
    setLoading(true);
    try {
      const next = await Promise.all(
        INCIDENT_INTENTS.map(async ({ id, kind }) => {
          const [intent, finalizedAmount] = await Promise.all([
            publicClient.readContract({
              address: intentBook,
              abi: intentBookAbi,
              functionName: "getIntent",
              args: [id],
            }),
            publicClient.readContract({
              address: executor,
              abi: executorAbi,
              functionName: "finalizedAmountIn",
              args: [id],
            }),
          ]);
          return {
            id,
            kind,
            owner: intent.user,
            status: Number(intent.status),
            finalizedAmount,
          } satisfies RecoveryRow;
        }),
      );
      setRows(next);
    } catch (error) {
      setMessage(`Could not read recovery state: ${formatError(error)}`);
    } finally {
      setLoading(false);
    }
  }, [executor, intentBook, publicClient]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const recover = async (row: RecoveryRow) => {
    if (!publicClient || !address || row.owner.toLowerCase() !== address.toLowerCase()) return;
    if (!isTargetChain(chainId)) {
      setMessage(`Switch your wallet to ${TARGET_CHAIN_LABEL} before recovering funds.`);
      return;
    }
    setBusyId(row.id);
    setMessage(`Confirm recovery for intent #${row.id.toString()} in your wallet.`);
    try {
      const functionName = row.kind === "finalized" ? "refundFinalized" : "refundConfidential";
      await publicClient.simulateContract({
        account: address,
        address: executor,
        abi: executorAbi,
        functionName,
        args: [row.id],
      });
      const hash = await writeContractAsync({
        account: address,
        address: executor,
        abi: executorAbi,
        functionName,
        args: [row.id],
        chainId: TARGET_CHAIN_ID,
      });
      setMessage(`Recovery submitted for #${row.id.toString()}. Waiting for confirmation.`);
      const receipt = await publicClient.waitForTransactionReceipt({ hash });
      if (receipt.status !== "success") throw new Error("Recovery transaction reverted");
      setConfirmedIds((current) => {
        const next = new Set(current);
        next.add(row.id);
        return next;
      });
      setMessage(`Intent #${row.id.toString()} recovered.`);
      await refresh();
    } catch (error) {
      setMessage(`Recovery failed: ${formatError(error)}`);
    } finally {
      setBusyId(null);
    }
  };

  return (
    <section className="recovery-desk" aria-labelledby="recovery-title">
      <header>
        <div>
          <span className="section-label">INCIDENT RECOVERY</span>
          <h2 id="recovery-title">Return interrupted orders.</h2>
        </div>
        <p>Each action returns the original asset to the wallet that placed the order. It does not execute a swap.</p>
      </header>

      {loading ? (
        <p className="recovery-state">Reading on-chain recovery state.</p>
      ) : (
        <div className="recovery-register">
          {rows.map((row) => {
            const isOwner = !!address && row.owner.toLowerCase() === address.toLowerCase();
            const onTarget = isTargetChain(chainId);
            const presentation = getRecoveryPresentation({
              status: effectiveRecoveryStatus(row.status, confirmedIds.has(row.id)),
              kind: row.kind,
              finalizedAmount: row.finalizedAmount,
              formattedAmount: formatUnits(row.finalizedAmount, 6),
              isConnected,
              onTarget,
              isOwner,
              busy: busyId === row.id,
              locked: busyId !== null,
              targetLabel: TARGET_CHAIN_LABEL,
            });
            return (
              <div className="recovery-row" key={row.id.toString()}>
                <strong>#{row.id.toString()}</strong>
                <div>
                  <span>{presentation.title}</span>
                  <small>{presentation.detail}</small>
                </div>
                <button disabled={presentation.disabled} onClick={() => void recover(row)}>
                  {presentation.action}
                </button>
              </div>
            );
          })}
        </div>
      )}

      {message && <p className="recovery-state" role="status">{message}</p>}
    </section>
  );
}
