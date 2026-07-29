import { keccak256, type Hex } from "viem";

export type GoldenIntent = {
  id: bigint;
  batchId: number;
  status: number;
  deadline: bigint;
  cTokenIn: string;
  cTokenOut: string;
  tokenIn: string;
  tokenOut: string;
};

export function buildGoldenMinOuts(
  quotedNetOut: bigint,
  amountsIn: bigint[],
  slippageBps: bigint
): bigint[] {
  if (quotedNetOut <= 0n || amountsIn.length !== 2 || amountsIn.some((value) => value <= 0n)) {
    throw new Error("golden min-out plan requires one positive quote and two positive inputs");
  }
  if (slippageBps < 0n || slippageBps >= 10_000n) {
    throw new Error("slippageBps must be between 0 and 9999");
  }
  const netIn = amountsIn[0] + amountsIn[1];
  return amountsIn.map((amount) => {
    const quotedShare = (quotedNetOut * amount) / netIn;
    const minOut = (quotedShare * (10_000n - slippageBps)) / 10_000n;
    if (minOut <= 0n) throw new Error("golden batch produced a non-positive minOut");
    return minOut;
  });
}

export function validateGoldenDeployment(
  config: { executorSecurityVersion?: number },
  minOuts: bigint[]
): void {
  if (config.executorSecurityVersion !== 4) {
    throw new Error("golden batch requires executor security version 4");
  }
  if (minOuts.length !== 2 || minOuts.some((value) => value <= 0n)) {
    throw new Error("golden batch requires exactly two positive minOut values");
  }
}

export function validateGoldenBatchMembership(
  actualIds: readonly bigint[],
  expectedIds: readonly bigint[]
): void {
  if (
    actualIds.length !== expectedIds.length ||
    actualIds.some((id, index) => id !== expectedIds[index])
  ) {
    throw new Error("golden batch membership changed before sealing");
  }
}

export function validateRuntimeBytecode(localCode: Hex, deployedCode: Hex): Hex {
  if (localCode === "0x" || deployedCode === "0x") {
    throw new Error("executor runtime bytecode is missing");
  }
  const localHash = keccak256(localCode);
  const deployedHash = keccak256(deployedCode);
  if (localHash !== deployedHash) {
    throw new Error(`executor runtime bytecode mismatch: local=${localHash} deployed=${deployedHash}`);
  }
  return deployedHash;
}

export function validateGoldenBatch(
  intents: GoldenIntent[],
  targetBatchId: number,
  now: bigint
): GoldenIntent[] {
  if (intents.length !== 2) {
    throw new Error(`golden batch requires exactly two intents, got ${intents.length}`);
  }
  for (const intent of intents) {
    if (intent.batchId !== targetBatchId) {
      throw new Error(`intent #${intent.id} is not in target batch #${targetBatchId}`);
    }
    if (intent.status !== 1 && intent.status !== 2) {
      throw new Error(`intent #${intent.id} is not pending or batched`);
    }
    if (intent.deadline <= now) {
      throw new Error(`intent #${intent.id} is expired`);
    }
  }
  const first = intents[0];
  const key = (intent: GoldenIntent) =>
    [intent.cTokenIn, intent.cTokenOut, intent.tokenIn, intent.tokenOut]
      .map((value) => value.toLowerCase())
      .join(":");
  if (intents.some((intent) => key(intent) !== key(first))) {
    throw new Error("golden batch intents are not same-pair");
  }
  return intents;
}
