/**
 * Solo settlement path for ShadowSwap.
 *
 * Reliable path (works with Nox ACL rules):
 *  1. Resolve clear amountIn / minOut (form override or private decrypt of intent handles)
 *  2. Encrypt amount for **cTokenIn** as applicationContract
 *  3. pullConfidential(cToken, user, enc, proof)
 *  4. startUnwrap(cToken, enc2, proof2)
 *  5. publicDecrypt(unwrapRequestId)
 *  6. finalizeUnwrapForIntent
 *  7. executeSoloAfterUnwrap
 *
 * Why not pullFromIntent alone?
 * Intent amount handles are ACL'd to the IntentBook at submit. confidentialTransferFrom
 * runs Nox ops as the cToken — without allowing cToken on the handle, Nox reverts
 * NotAllowed(handle, cToken). Re-encrypting for cToken uses fromExternal ACL correctly.
 */
import {
  type Address,
  type Hash,
  type Hex,
  type PublicClient,
  type TransactionReceipt,
  type WalletClient,
  decodeEventLog,
  parseEventLogs,
  keccak256,
  toBytes,
} from "viem";
import { executorAbi, intentBookAbi } from "@/lib/abis";
import { decryptHandle, encryptAmount, publicDecryptHandle } from "@/lib/nox";

export type SoloSettleStep =
  | "idle"
  | "load-intent"
  | "resolve-amounts"
  | "pull"
  | "unwrap"
  | "public-decrypt"
  | "finalize"
  | "execute"
  | "done"
  | "error";

export type SoloSettleState = {
  step: SoloSettleStep;
  intentId: bigint;
  user: Address;
  cTokenIn: Address;
  cTokenOut: Address;
  tokenIn: Address;
  tokenOut: Address;
  amountInHandle: Hex;
  minOutHandle: Hex;
  pulledAmountHandle?: Hex;
  unwrapRequestId?: Hex;
  amountInClear?: bigint;
  minOutClear?: bigint;
  amountOut?: bigint;
  lastTx?: Hash;
  log: string[];
  error?: string;
};

/** Wallet write adapter — intentionally loose so UI can pass any contract ABI. */
export type WriteFn = (args: {
  address: Address;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  abi: any;
  functionName: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  args?: readonly any[];
}) => Promise<Hash>;

const ZERO_HANDLE = ("0x" + "0".repeat(64)) as Hex;

/** ConfidentialPulled(uint256,address,address,bytes32) */
const CONFIDENTIAL_PULLED_TOPIC = keccak256(
  toBytes("ConfidentialPulled(uint256,address,address,bytes32)")
);
/** UnwrapStarted(uint256,address,bytes32) */
const UNWRAP_STARTED_TOPIC = keccak256(toBytes("UnwrapStarted(uint256,address,bytes32)"));
/** UnwrapRequested(address,bytes32) on cToken wrapper */
const UNWRAP_REQUESTED_TOPIC = keccak256(toBytes("UnwrapRequested(address,bytes32)"));
/** ConfidentialTransfer(address,address,bytes32) — amount is indexed */
const CONFIDENTIAL_TRANSFER_TOPIC = keccak256(
  toBytes("ConfidentialTransfer(address,address,bytes32)")
);

function pushLog(state: SoloSettleState, line: string): SoloSettleState {
  return { ...state, log: [...state.log, line] };
}

async function waitSuccess(
  publicClient: PublicClient,
  hash: Hash,
  label: string
): Promise<TransactionReceipt> {
  const receipt = await publicClient.waitForTransactionReceipt({ hash });
  if (receipt.status !== "success") {
    throw new Error(
      `${label} reverted (status=${receipt.status}). tx ${hash}. ` +
        `Common causes: not operator on cToken, insufficient cBalance, expired intent, or Nox ACL.`
    );
  }
  return receipt;
}

export async function loadIntentForSettle(
  publicClient: PublicClient,
  intentBook: Address,
  intentId: bigint
): Promise<Omit<SoloSettleState, "step" | "log" | "error">> {
  const intent = (await publicClient.readContract({
    address: intentBook,
    abi: intentBookAbi,
    functionName: "getIntent",
    args: [intentId],
  })) as {
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

  if (!intent.user || intent.user === "0x0000000000000000000000000000000000000000") {
    throw new Error(`Intent ${intentId} not found`);
  }
  if (intent.status !== 1 && intent.status !== 2) {
    throw new Error(
      `Intent ${intentId} not ready (status=${intent.status}; need Pending=1 or Batched=2)`
    );
  }
  if (intent.deadline < BigInt(Math.floor(Date.now() / 1000))) {
    throw new Error(`Intent ${intentId} expired`);
  }

  return {
    intentId,
    user: intent.user,
    cTokenIn: intent.cTokenIn,
    cTokenOut: intent.cTokenOut,
    tokenIn: intent.tokenIn,
    tokenOut: intent.tokenOut,
    amountInHandle: intent.amountIn,
    minOutHandle: intent.minAmountOut,
  };
}

type TxLog = {
  address: Address;
  data: Hex;
  topics: readonly Hex[];
};

function parseAmountFromPullLogs(logs: readonly TxLog[], executor: Address): Hex | null {
  // 1) ConfidentialPulled on executor
  for (const log of logs) {
    if (log.address.toLowerCase() !== executor.toLowerCase()) continue;
    if (log.topics[0]?.toLowerCase() === CONFIDENTIAL_PULLED_TOPIC.toLowerCase()) {
      // non-indexed amount in data
      if (log.data && log.data.length >= 66) {
        const amount = (`0x${log.data.slice(2, 66)}`) as Hex;
        if (amount !== ZERO_HANDLE) return amount;
      }
    }
  }

  try {
    const decoded = parseEventLogs({
      abi: executorAbi,
      logs: logs as never,
      eventName: "ConfidentialPulled",
    });
    for (const e of decoded) {
      if (e.address.toLowerCase() !== executor.toLowerCase()) continue;
      const amount = (e.args as { amount?: Hex }).amount;
      if (amount && amount !== ZERO_HANDLE) return amount;
    }
  } catch {
    /* continue */
  }

  // 2) ConfidentialTransfer to executor (amount is indexed → topics[3])
  for (const log of logs) {
    if (log.topics[0]?.toLowerCase() !== CONFIDENTIAL_TRANSFER_TOPIC.toLowerCase()) continue;
    const to = log.topics[2] ? (`0x${log.topics[2].slice(26)}` as Address) : null;
    if (to && to.toLowerCase() === executor.toLowerCase() && log.topics[3]) {
      const amount = log.topics[3] as Hex;
      if (amount !== ZERO_HANDLE) return amount;
    }
  }

  return null;
}

export function parsePulledAmountHandle(logs: readonly TxLog[], executor: Address): Hex {
  const amount = parseAmountFromPullLogs(logs, executor);
  if (amount) return amount;
  throw new Error(
    "ConfidentialPulled event not found — pull may have reverted (check operator + cBalance) or RPC stripped logs."
  );
}

export function parseUnwrapRequestId(logs: readonly TxLog[], executor: Address): Hex {
  for (const log of logs) {
    if (
      log.address.toLowerCase() === executor.toLowerCase() &&
      log.topics[0]?.toLowerCase() === UNWRAP_STARTED_TOPIC.toLowerCase() &&
      log.data &&
      log.data.length >= 66
    ) {
      const id = (`0x${log.data.slice(2, 66)}`) as Hex;
      if (id !== ZERO_HANDLE) return id;
    }
  }

  try {
    const decoded = parseEventLogs({
      abi: executorAbi,
      logs: logs as never,
      eventName: "UnwrapStarted",
    });
    for (const e of decoded) {
      const id = (e.args as { unwrapRequestId?: Hex }).unwrapRequestId;
      if (id && id !== ZERO_HANDLE) return id;
    }
  } catch {
    /* continue */
  }

  // cToken UnwrapRequested(receiver indexed, amount in data)
  for (const log of logs) {
    if (log.topics[0]?.toLowerCase() !== UNWRAP_REQUESTED_TOPIC.toLowerCase()) continue;
    if (log.data && log.data.length >= 66) {
      const id = (`0x${log.data.slice(2, 66)}`) as Hex;
      if (id !== ZERO_HANDLE) return id;
    }
  }

  for (const log of logs) {
    try {
      if (!log.topics.length) continue;
      const d = decodeEventLog({
        abi: executorAbi,
        data: log.data,
        topics: log.topics as [Hex, ...Hex[]],
      });
      if (d.eventName === "UnwrapStarted") {
        const id = (d.args as { unwrapRequestId?: Hex }).unwrapRequestId;
        if (id && id !== ZERO_HANDLE) return id;
      }
    } catch {
      /* skip */
    }
  }
  throw new Error("UnwrapStarted event not found — cannot publicDecrypt");
}

export async function publicDecryptWithRetry(
  walletClient: WalletClient,
  handle: Hex,
  opts?: {
    maxAttempts?: number;
    baseDelayMs?: number;
    onAttempt?: (n: number, err: string) => void;
  }
): Promise<{ value: bigint; decryptionProof: Hex }> {
  const maxAttempts = opts?.maxAttempts ?? 12;
  const baseDelayMs = opts?.baseDelayMs ?? 2000;

  let lastErr: unknown;
  for (let i = 1; i <= maxAttempts; i++) {
    try {
      const result = await publicDecryptHandle(walletClient, handle);
      return {
        value: result.value as bigint,
        decryptionProof: result.decryptionProof as Hex,
      };
    } catch (e) {
      lastErr = e;
      const msg = e instanceof Error ? e.message : String(e);
      opts?.onAttempt?.(i, msg);
      const retryable =
        /NotYetComputed|not yet|404|403|access_denied|not publicly decryptable|does not exist|Failed to decrypt/i.test(
          msg
        );
      if (!retryable || i === maxAttempts) break;
      const delay = Math.min(baseDelayMs * 2 ** Math.min(i - 1, 4), 20_000);
      await new Promise((r) => setTimeout(r, delay));
    }
  }
  throw lastErr instanceof Error
    ? lastErr
    : new Error(`publicDecrypt failed after ${maxAttempts} attempts: ${String(lastErr)}`);
}

/**
 * Run the full solo settlement path.
 */
export async function runSoloSettlement(params: {
  publicClient: PublicClient;
  walletClient: WalletClient;
  write: WriteFn;
  executor: Address;
  intentBook: Address;
  intentId: bigint;
  /** Prefer form values from the same session (avoids private decrypt round-trip) */
  amountInClear?: bigint;
  minOutClear?: bigint;
  deadlineSeconds?: number;
  onProgress?: (state: SoloSettleState) => void;
}): Promise<SoloSettleState> {
  const {
    publicClient,
    walletClient,
    write,
    executor,
    intentBook,
    intentId,
    deadlineSeconds = 600,
    onProgress,
  } = params;

  const emit = (s: SoloSettleState) => {
    onProgress?.(s);
    return s;
  };

  let state: SoloSettleState = {
    step: "load-intent",
    intentId,
    user: "0x0000000000000000000000000000000000000000",
    cTokenIn: "0x0000000000000000000000000000000000000000",
    cTokenOut: "0x0000000000000000000000000000000000000000",
    tokenIn: "0x0000000000000000000000000000000000000000",
    tokenOut: "0x0000000000000000000000000000000000000000",
    amountInHandle: ZERO_HANDLE,
    minOutHandle: ZERO_HANDLE,
    log: [`Loading intent #${intentId}…`],
  };
  emit(state);

  try {
    const loaded = await loadIntentForSettle(publicClient, intentBook, intentId);
    state = emit(
      pushLog(
        { ...state, ...loaded, step: "resolve-amounts" },
        `Intent ready: ${loaded.tokenIn.slice(0, 8)}… → ${loaded.tokenOut.slice(0, 8)}… user ${loaded.user.slice(0, 8)}…`
      )
    );

    // Resolve clear amounts (needed to re-encrypt for cToken ACL)
    let amountInClear = params.amountInClear;
    let minOutClear = params.minOutClear;

    if (amountInClear == null || amountInClear === 0n) {
      state = emit(pushLog(state, "Private-decrypting amountIn handle (user ACL)…"));
      const { value } = await decryptHandle(walletClient, loaded.amountInHandle);
      amountInClear = value as bigint;
    }
    if (minOutClear == null) {
      try {
        state = emit(pushLog(state, "Private-decrypting minOut handle…"));
        const { value } = await decryptHandle(walletClient, loaded.minOutHandle);
        minOutClear = value as bigint;
      } catch {
        minOutClear = 0n;
        state = emit(pushLog(state, "minOut decrypt failed — using 0 (set slippage carefully)"));
      }
    }

    if (amountInClear <= 0n) {
      throw new Error("amountIn is 0 — enter amount in the form or ensure intent has a size");
    }

    state = emit(
      pushLog(
        { ...state, amountInClear, minOutClear, step: "pull" },
        `Clear sizes: amountIn=${amountInClear} minOut=${minOutClear}`
      )
    );

    state = emit(pushLog(state, `Initializing executor balance in ${loaded.cTokenIn.slice(0, 10)}…`));
    try {
      const initTx = await write({
        address: loaded.cTokenIn,
        abi: [{ type: "function", name: "wrap", stateMutability: "nonpayable", inputs: [{ type: "address" }, { type: "uint256" }], outputs: [{ type: "uint256" }] }],
        functionName: "wrap",
        args: [executor, 0n],
      });
      await waitSuccess(publicClient, initTx, "wrap(0)");
    } catch (e) {
      state = emit(pushLog(state, `  Init skipped/failed: ${e instanceof Error ? e.message.slice(0, 80) : String(e)}`));
    }

    // Encrypt for cToken (applicationContract) so fromExternal ACL works inside the wrapper
    state = emit(
      pushLog(state, "1/5 Encrypt amount for cToken + pullConfidential…")
    );
    const encPull = await encryptAmount(walletClient, amountInClear, loaded.cTokenIn);
    const pullTx = await write({
      address: executor,
      abi: executorAbi,
      functionName: "pullConfidential",
      args: [loaded.cTokenIn, loaded.user, encPull.handle, encPull.handleProof],
    });
    const pullReceipt = await waitSuccess(publicClient, pullTx, "pullConfidential");

    // Optional: capture transferred handle for logging (unwrap uses fresh external encrypt)
    let pulledAmountHandle: Hex | undefined;
    try {
      pulledAmountHandle = parsePulledAmountHandle(pullReceipt.logs, executor);
    } catch {
      pulledAmountHandle = undefined;
    }

    state = emit(
      pushLog(
        { ...state, step: "unwrap", pulledAmountHandle, lastTx: pullTx },
        `Pulled OK (tx ${pullTx.slice(0, 10)}…)` +
          (pulledAmountHandle ? ` handle ${pulledAmountHandle.slice(0, 14)}…` : "")
      )
    );

    // 2) Start unwrap with fresh encryption for cToken
    state = emit(pushLog(state, "2/5 Encrypt + startUnwrap…"));
    const encUnwrap = await encryptAmount(walletClient, amountInClear, loaded.cTokenIn);
    const unwrapTx = await write({
      address: executor,
      abi: executorAbi,
      functionName: "startUnwrap",
      args: [loaded.cTokenIn, encUnwrap.handle, encUnwrap.handleProof],
    });
    const unwrapReceipt = await waitSuccess(publicClient, unwrapTx, "startUnwrap");
    const unwrapRequestId = parseUnwrapRequestId(unwrapReceipt.logs, executor);
    state = emit(
      pushLog(
        { ...state, step: "public-decrypt", unwrapRequestId, lastTx: unwrapTx },
        `Unwrap request ${unwrapRequestId.slice(0, 14)}… (tx ${unwrapTx.slice(0, 10)}…)`
      )
    );

    // 3) publicDecrypt
    state = emit(pushLog(state, "3/5 publicDecrypt(unwrapRequestId) via Nox gateway…"));
    const { value: decryptedIn, decryptionProof } = await publicDecryptWithRetry(
      walletClient,
      unwrapRequestId,
      {
        onAttempt: (n, err) => {
          state = emit(pushLog(state, `  publicDecrypt attempt ${n}: ${err.slice(0, 120)}`));
        },
      }
    );
    // Prefer gateway-decrypted value (source of truth for finalize)
    amountInClear = decryptedIn;
    state = emit(
      pushLog(
        { ...state, step: "finalize", amountInClear },
        `Decrypted amountIn = ${amountInClear.toString()} (now public for AMM)`
      )
    );

    // 4) Finalize unwrap
    state = emit(pushLog(state, "4/5 finalizeUnwrapForIntent…"));
    const finTx = await write({
      address: executor,
      abi: executorAbi,
      functionName: "finalizeUnwrapForIntent",
      args: [intentId, loaded.cTokenIn, unwrapRequestId, decryptionProof],
    });
    await waitSuccess(publicClient, finTx, "finalizeUnwrap");
    state = emit(
      pushLog({ ...state, step: "execute", lastTx: finTx }, `Finalized unwrap (tx ${finTx.slice(0, 10)}…)`)
    );

    // 5) AMM + re-shield
    const deadline = BigInt(Math.floor(Date.now() / 1000) + deadlineSeconds);
    state = emit(
      pushLog(
        state,
        `5/5 executeSoloAfterUnwrap(amountIn=${amountInClear}, minOut=${minOutClear})…`
      )
    );
    const execTx = await write({
      address: executor,
      abi: executorAbi,
      functionName: "executeSoloAfterUnwrap",
      args: [
        intentId,
        loaded.user,
        loaded.cTokenOut,
        loaded.tokenIn,
        loaded.tokenOut,
        amountInClear,
        minOutClear ?? 0n,
        deadline,
      ],
    });
    await waitSuccess(publicClient, execTx, "executeSoloAfterUnwrap");

    state = emit(
      pushLog(
        { ...state, step: "done", lastTx: execTx, amountInClear, minOutClear },
        `Done. Intent #${intentId} settled → confidential ${loaded.cTokenOut.slice(0, 10)}… (tx ${execTx.slice(0, 10)}…)`
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
