/**
 * Batch settlement path for ShadowSwap.
 *
 * For each intent in a same-pair batch:
 *  1. pullFromIntent
 *  2. startUnwrapHeld
 *  3. publicDecrypt(unwrapRequestId)
 *  4. finalizeUnwrapForIntent
 * Then once:
 *  5. executeBatchSamePair — one AMM swap, pro-rata confidential outputs
 */
import type { Address, Hash, Hex, PublicClient, WalletClient } from "viem";
import { executorAbi, intentBookAbi } from "@/lib/abis";
import { decryptHandle } from "@/lib/nox";
import {
  parsePulledAmountHandle,
  parseUnwrapRequestId,
  publicDecryptWithRetry,
  type WriteFn,
} from "@/lib/settleSolo";

export type BatchSettleStep =
  | "idle"
  | "load-batch"
  | "seal"
  | "per-intent"
  | "execute-batch"
  | "done"
  | "error";

export type IntentClearAmounts = {
  intentId: bigint;
  user: Address;
  cTokenIn: Address;
  cTokenOut: Address;
  tokenIn: Address;
  tokenOut: Address;
  amountInHandle: Hex;
  minOutHandle: Hex;
  amountInClear: bigint;
  minOutClear: bigint;
  status: number;
  batchId: number;
};

export type BatchSettleState = {
  step: BatchSettleStep;
  batchId: number;
  intentIds: bigint[];
  clears: IntentClearAmounts[];
  netIn?: bigint;
  lastTx?: Hash;
  log: string[];
  error?: string;
  progressIndex?: number;
  progressTotal?: number;
  isSealed?: boolean;
  pairLabel?: string;
};

const ZERO = "0x0000000000000000000000000000000000000000";

function pushLog(state: BatchSettleState, line: string): BatchSettleState {
  return { ...state, log: [...state.log, line] };
}

type IntentRow = {
  user: Address;
  cTokenIn: Address;
  cTokenOut: Address;
  tokenIn: Address;
  tokenOut: Address;
  amountIn: Hex;
  minAmountOut: Hex;
  deadline: bigint;
  createdAt: bigint;
  batchId: number;
  status: number;
};

async function readIntent(
  publicClient: PublicClient,
  intentBook: Address,
  intentId: bigint
): Promise<IntentRow> {
  return (await publicClient.readContract({
    address: intentBook,
    abi: intentBookAbi,
    functionName: "getIntent",
    args: [intentId],
  })) as IntentRow;
}

/** Load batch membership + filter largest same-pair settleable cohort */
export async function loadBatchIntents(
  publicClient: PublicClient,
  intentBook: Address,
  batchId: number
): Promise<{
  intentIds: bigint[];
  intents: IntentClearAmounts[];
  pairLabel: string | null;
  isSealed: boolean;
  isExecuted: boolean;
  openAt: bigint;
  sealAt: bigint;
  allIds: bigint[];
}> {
  const allIds = (await publicClient.readContract({
    address: intentBook,
    abi: intentBookAbi,
    functionName: "getBatchIntentIds",
    args: [batchId],
  })) as bigint[];

  let isSealed = false;
  let isExecuted = false;
  let openAt = 0n;
  let sealAt = 0n;
  try {
    const batch = (await publicClient.readContract({
      address: intentBook,
      abi: intentBookAbi,
      functionName: "batches",
      args: [batchId],
    })) as readonly [bigint, bigint, boolean, boolean];
    openAt = batch[0];
    sealAt = batch[1];
    isSealed = Boolean(batch[2]);
    isExecuted = Boolean(batch[3]);
  } catch {
    /* mapping getter may differ */
  }

  const now = BigInt(Math.floor(Date.now() / 1000));
  const settleable: IntentClearAmounts[] = [];
  for (const id of allIds) {
    const intent = await readIntent(publicClient, intentBook, id);
    if (!intent.user || intent.user.toLowerCase() === ZERO) continue;
    // Pending=1 or Batched=2
    if (intent.status !== 1 && intent.status !== 2) continue;
    if (intent.deadline < now) continue;
    settleable.push({
      intentId: id,
      user: intent.user,
      cTokenIn: intent.cTokenIn,
      cTokenOut: intent.cTokenOut,
      tokenIn: intent.tokenIn,
      tokenOut: intent.tokenOut,
      amountInHandle: intent.amountIn,
      minOutHandle: intent.minAmountOut,
      amountInClear: 0n,
      minOutClear: 0n,
      status: intent.status,
      batchId: Number(intent.batchId),
    });
  }

  // Largest same-pair group (tokenIn/tokenOut/cTokenOut)
  const groups = new Map<string, IntentClearAmounts[]>();
  for (const it of settleable) {
    const key = `${it.tokenIn.toLowerCase()}_${it.tokenOut.toLowerCase()}_${it.cTokenOut.toLowerCase()}`;
    const arr = groups.get(key) ?? [];
    arr.push(it);
    groups.set(key, arr);
  }
  let best: IntentClearAmounts[] = [];
  let pairLabel: string | null = null;
  for (const [key, arr] of groups) {
    if (arr.length > best.length) {
      best = arr;
      pairLabel = key;
    }
  }

  return {
    intentIds: best.map((i) => i.intentId),
    intents: best,
    pairLabel,
    isSealed,
    isExecuted,
    openAt,
    sealAt,
    allIds,
  };
}

export async function unwrapIntentToClearWithBook(params: {
  publicClient: PublicClient;
  walletClient: WalletClient;
  write: WriteFn;
  executor: Address;
  intentBook: Address;
  intentId: bigint;
  minOutOverride?: bigint;
  onLog: (line: string) => void;
}): Promise<{ amountInClear: bigint; minOutClear: bigint; meta: IntentClearAmounts }> {
  const {
    publicClient,
    walletClient,
    write,
    executor,
    intentBook,
    intentId,
    minOutOverride,
    onLog,
  } = params;

  const intent = await readIntent(publicClient, intentBook, intentId);
  if (intent.status !== 1 && intent.status !== 2) {
    throw new Error(`Intent #${intentId} not settleable (status=${intent.status})`);
  }

  // Resolve clear amount via private decrypt (user ACL on intent handles)
  onLog(`Intent #${intentId}: private-decrypt amountIn…`);
  const { value: amountPlain } = await decryptHandle(walletClient, intent.amountIn);
  let amountInClear = amountPlain as bigint;
  onLog(`  amountIn=${amountInClear}`);

  let minOutClear = minOutOverride;
  if (minOutClear == null) {
    try {
      const { value } = await decryptHandle(walletClient, intent.minAmountOut);
      minOutClear = value as bigint;
      onLog(`  minOut=${minOutClear}`);
    } catch (e) {
      onLog(
        `  minOut decrypt failed (${e instanceof Error ? e.message.slice(0, 60) : e}) — using 0`
      );
      minOutClear = 0n;
    }
  }

  onLog(`Intent #${intentId}: pullFromIntent.`);
  const pullTx = await write({
    address: executor,
    abi: executorAbi,
    functionName: "pullFromIntent",
    args: [intentId],
  });
  const pullReceipt = await publicClient.waitForTransactionReceipt({ hash: pullTx });
  if (pullReceipt.status !== "success") {
    throw new Error(`pullFromIntent reverted for intent #${intentId}`);
  }
  const pulledAmountHandle = parsePulledAmountHandle(pullReceipt.logs as never, executor);
  onLog(`  pull tx ${pullTx.slice(0, 10)}.`);

  onLog(`Intent #${intentId}: startUnwrapHeld…`);
  const unwrapTx = await write({
    address: executor,
    abi: executorAbi,
    functionName: "startUnwrapHeld",
    args: [intentId, intent.cTokenIn, pulledAmountHandle],
  });
  const unwrapReceipt = await publicClient.waitForTransactionReceipt({ hash: unwrapTx });
  if (unwrapReceipt.status !== "success") {
    throw new Error(`startUnwrapHeld reverted for intent #${intentId}`);
  }
  const unwrapRequestId = parseUnwrapRequestId(unwrapReceipt.logs as never, executor);
  onLog(`  unwrapRequestId ${unwrapRequestId.slice(0, 14)}…`);

  onLog(`Intent #${intentId}: publicDecrypt…`);
  const { value: decryptedIn, decryptionProof } = await publicDecryptWithRetry(
    walletClient,
    unwrapRequestId,
    {
      onAttempt: (n, err) => onLog(`  publicDecrypt attempt ${n}: ${err.slice(0, 80)}`),
    }
  );
  amountInClear = decryptedIn;
  onLog(`  amountInClear=${amountInClear}`);

  onLog(`Intent #${intentId}: finalizeUnwrap…`);
  const finTx = await write({
    address: executor,
    abi: executorAbi,
    functionName: "finalizeUnwrapForIntent",
    args: [intentId, intent.cTokenIn, unwrapRequestId, decryptionProof],
  });
  const finReceipt = await publicClient.waitForTransactionReceipt({ hash: finTx });
  if (finReceipt.status !== "success") {
    throw new Error(`finalizeUnwrap reverted for intent #${intentId}`);
  }

  return {
    amountInClear,
    minOutClear,
    meta: {
      intentId,
      user: intent.user,
      cTokenIn: intent.cTokenIn,
      cTokenOut: intent.cTokenOut,
      tokenIn: intent.tokenIn,
      tokenOut: intent.tokenOut,
      amountInHandle: intent.amountIn,
      minOutHandle: intent.minAmountOut,
      amountInClear,
      minOutClear,
      status: intent.status,
      batchId: Number(intent.batchId),
    },
  };
}

/**
 * Full batch settle: optional seal → unwrap each same-pair intent → one AMM net swap.
 */
export async function runBatchSettlement(params: {
  publicClient: PublicClient;
  walletClient: WalletClient;
  write: WriteFn;
  executor: Address;
  intentBook: Address;
  batchId: number;
  sealIfNeeded?: boolean;
  minOutByIntent?: Record<string, bigint>;
  onlyIntentIds?: bigint[];
  deadlineSeconds?: number;
  onProgress?: (state: BatchSettleState) => void;
}): Promise<BatchSettleState> {
  const {
    publicClient,
    walletClient,
    write,
    executor,
    intentBook,
    batchId,
    sealIfNeeded = true,
    minOutByIntent,
    onlyIntentIds,
    deadlineSeconds = 600,
    onProgress,
  } = params;

  const emit = (s: BatchSettleState) => {
    onProgress?.(s);
    return s;
  };

  let state: BatchSettleState = {
    step: "load-batch",
    batchId,
    intentIds: [],
    clears: [],
    log: [`Loading batch #${batchId}…`],
  };
  emit(state);

  try {
    let loaded = await loadBatchIntents(publicClient, intentBook, batchId);
    let intentIds = loaded.intentIds;
    let intents = loaded.intents;

    if (onlyIntentIds?.length) {
      const set = new Set(onlyIntentIds.map(String));
      intentIds = intentIds.filter((id) => set.has(id.toString()));
      intents = intents.filter((i) => set.has(i.intentId.toString()));
    }

    state = emit(
      pushLog(
        {
          ...state,
          intentIds,
          isSealed: loaded.isSealed,
          pairLabel: loaded.pairLabel ?? undefined,
          step: loaded.isSealed ? "per-intent" : "seal",
        },
        `Batch #${batchId}: ${loaded.allIds.length} total, ${intentIds.length} same-pair settleable` +
          (loaded.isSealed ? " [sealed]" : " [open]") +
          (loaded.isExecuted ? " [executed]" : "")
      )
    );

    if (loaded.isExecuted) throw new Error(`Batch #${batchId} already executed`);
    if (intentIds.length === 0) {
      throw new Error(
        `No settleable same-pair intents in batch #${batchId}. Submit ≥1 pending intent first.`
      );
    }
    if (intentIds.length < 2) {
      state = emit(
        pushLog(
          state,
          "Note: only 1 intent — netting demo is stronger with ≥2 same-pair intents."
        )
      );
    }

    if (!loaded.isSealed && sealIfNeeded) {
      state = emit(pushLog(state, "Sealing current batch…"));
      try {
        const sealTx = await write({
          address: intentBook,
          abi: intentBookAbi,
          functionName: "sealCurrentBatch",
          args: [],
        });
        await publicClient.waitForTransactionReceipt({ hash: sealTx });
        state = emit(
          pushLog(
            { ...state, step: "per-intent", lastTx: sealTx, isSealed: true },
            `Sealed (tx ${sealTx.slice(0, 10)}…)`
          )
        );
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        state = emit(
          pushLog(
            { ...state, step: "per-intent" },
            `Seal skipped/failed (${msg.slice(0, 120)}). Continuing if intents still Pending/Batched…`
          )
        );
      }
    } else {
      state = { ...state, step: "per-intent" };
    }

    if (intents.length > 0) {
      const firstCTokenIn = intents[0].cTokenIn;
      state = emit(pushLog(state, `Initializing executor balance in ${firstCTokenIn.slice(0, 10)}…`));
      try {
        const initTx = await write({
          address: firstCTokenIn,
          abi: [{ type: "function", name: "wrap", stateMutability: "nonpayable", inputs: [{ type: "address" }, { type: "uint256" }], outputs: [{ type: "uint256" }] }],
          functionName: "wrap",
          args: [executor, 0n],
        });
        await publicClient.waitForTransactionReceipt({ hash: initTx });
      } catch (e) {
        state = emit(pushLog(state, `  Init skipped/failed: ${e instanceof Error ? e.message.slice(0, 80) : String(e)}`));
      }
    }

    const clears: IntentClearAmounts[] = [];
    for (let i = 0; i < intentIds.length; i++) {
      const id = intentIds[i];
      state = emit({
        ...state,
        progressIndex: i + 1,
        progressTotal: intentIds.length,
        log: [...state.log, `—— Intent ${i + 1}/${intentIds.length} (#${id}) ——`],
      });

      const { amountInClear, minOutClear, meta } = await unwrapIntentToClearWithBook({
        publicClient,
        walletClient,
        write,
        executor,
        intentBook,
        intentId: id,
        minOutOverride: minOutByIntent?.[id.toString()],
        onLog: (line) => {
          state = emit(pushLog(state, line));
        },
      });
      clears.push({ ...meta, amountInClear, minOutClear, batchId });
    }

    const netIn = clears.reduce((a, c) => a + c.amountInClear, 0n);
    state = emit(
      pushLog(
        { ...state, clears, step: "execute-batch", netIn },
        `All unwrapped. netIn=${netIn} — executeBatchSamePair…`
      )
    );

    const first = clears[0];
    for (const c of clears) {
      if (
        c.tokenIn.toLowerCase() !== first.tokenIn.toLowerCase() ||
        c.tokenOut.toLowerCase() !== first.tokenOut.toLowerCase() ||
        c.cTokenOut.toLowerCase() !== first.cTokenOut.toLowerCase()
      ) {
        throw new Error("Internal error: mixed pairs after filter");
      }
    }

    const deadline = BigInt(Math.floor(Date.now() / 1000) + deadlineSeconds);
    const execTx = await write({
      address: executor,
      abi: executorAbi,
      functionName: "executeBatchSamePair",
      args: [
        batchId,
        clears.map((c) => c.intentId),
        clears.map((c) => c.user),
        first.cTokenOut,
        first.tokenIn,
        first.tokenOut,
        clears.map((c) => c.amountInClear),
        clears.map((c) => c.minOutClear),
        deadline,
      ],
    });
    await publicClient.waitForTransactionReceipt({ hash: execTx });

    state = emit(
      pushLog(
        { ...state, step: "done", lastTx: execTx, netIn },
        `Done. Batch #${batchId} one AMM swap (netIn=${netIn}, n=${clears.length}). tx ${execTx.slice(0, 10)}…`
      )
    );
    return state;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    state = emit({
      ...state,
      step: "error",
      error: msg,
      log: [...state.log, `Error: ${msg}`],
    });
    throw e;
  }
}
