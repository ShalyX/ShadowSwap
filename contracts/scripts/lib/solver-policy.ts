export type OpenBatchDecision = "wait" | "seal";

export function isPermanentSettlementFailure(message: string): boolean {
  const normalized = message.toLowerCase();
  return (
    normalized.includes("revert") ||
    normalized.includes("not an authorized solver") ||
    normalized.includes("not safely resumable") ||
    normalized.includes("invalid minout") ||
    normalized.includes("non-positive input")
  );
}

export function solverExitCode(message: string): 1 | 78 {
  return isPermanentSettlementFailure(message) ? 78 : 1;
}

export function shouldProcessBatch(batchId: number, minimumBatchId: number, maximumBatchId?: number): boolean {
  return batchId >= minimumBatchId && (maximumBatchId === undefined || batchId <= maximumBatchId);
}

export function isActiveIntentCandidate(input: {
  batchId: number;
  status: number;
  deadline: bigint;
  now: bigint;
  minimumBatchId: number;
  maximumBatchId?: number;
}): boolean {
  if (!shouldProcessBatch(input.batchId, input.minimumBatchId, input.maximumBatchId)) return false;
  if (input.status === 5) return true;
  return (input.status === 1 || input.status === 2) && input.deadline >= input.now;
}

export function decideOpenBatch(input: {
  compatibleCount: number;
  openAt: bigint;
  windowSeconds: bigint;
  now: bigint;
}): OpenBatchDecision {
  if (input.compatibleCount <= 0) return "wait";
  if (input.compatibleCount >= 2) return "seal";
  return input.now >= input.openAt + input.windowSeconds ? "seal" : "wait";
}

export type IntentSettlementStep =
  | "pull"
  | "start-unwrap"
  | "finalize-unwrap"
  | "ready"
  | "skip";

export function nextIntentSettlementStep(input: {
  status: number;
  pulled: boolean;
  unwrapStarted: boolean;
  finalizedAmount: bigint;
}): IntentSettlementStep {
  if (input.finalizedAmount > 0n && input.status === 5) return "ready";
  if (input.status === 1 || input.status === 2) {
    return input.pulled || input.unwrapStarted ? "skip" : "pull";
  }
  if (input.status !== 5 || !input.pulled) return "skip";
  return input.unwrapStarted ? "finalize-unwrap" : "start-unwrap";
}
