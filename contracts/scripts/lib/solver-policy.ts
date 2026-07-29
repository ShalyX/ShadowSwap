export type OpenBatchDecision = "wait" | "seal";

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
