import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { decideOpenBatch, isActiveIntentCandidate, isPermanentSettlementFailure, nextIntentSettlementStep, solverExitCode } from "../scripts/lib/solver-policy.js";

describe("solver batch policy", () => {
  it("keeps a singleton open until the configured window expires", () => {
    assert.equal(decideOpenBatch({ compatibleCount: 1, openAt: 100n, windowSeconds: 300n, now: 399n }), "wait");
    assert.equal(decideOpenBatch({ compatibleCount: 1, openAt: 100n, windowSeconds: 300n, now: 400n }), "seal");
  });

  it("seals immediately when two compatible intents can share one swap", () => {
    assert.equal(decideOpenBatch({ compatibleCount: 2, openAt: 100n, windowSeconds: 300n, now: 150n }), "seal");
  });

  it("does not seal an empty batch", () => {
    assert.equal(decideOpenBatch({ compatibleCount: 0, openAt: 100n, windowSeconds: 300n, now: 500n }), "wait");
  });

  it("never admits historical or future batches into the mutation candidate set", () => {
    const base = { status: 2, deadline: 500n, now: 100n, minimumBatchId: 7, maximumBatchId: 7 };
    assert.equal(isActiveIntentCandidate({ ...base, batchId: 6 }), false);
    assert.equal(isActiveIntentCandidate({ ...base, batchId: 7 }), true);
    assert.equal(isActiveIntentCandidate({ ...base, batchId: 8 }), false);
    assert.equal(isActiveIntentCandidate({ ...base, batchId: 7, status: 1, deadline: 99n }), false);
    assert.equal(isActiveIntentCandidate({ ...base, batchId: 7, status: 5, deadline: 0n }), true);
  });
});

describe("solver source safety gates", () => {
  const source = readFileSync(new URL("../scripts/solver-bot.ts", import.meta.url), "utf8");

  it("contains no argumentless seal mutation", () => {
    assert.equal(source.includes('name: "sealCurrentBatch"'), false);
    assert.equal(source.includes('functionName: "sealCurrentBatch"'), false);
  });

  it("returns from discovery mode before the first wallet write", () => {
    const discoveryReturn = source.indexOf("if (discoveryOnly)");
    const firstWrite = source.indexOf("walletClient.writeContract");
    assert.ok(discoveryReturn >= 0);
    assert.ok(firstWrite > discoveryReturn);
  });
});

describe("solver failure containment", () => {
  it("halts on deterministic execution failures", () => {
    assert.equal(isPermanentSettlementFailure("execution reverted: slippage"), true);
    assert.equal(isPermanentSettlementFailure("Batch 7 execution reverted: 0xabc"), true);
    assert.equal(isPermanentSettlementFailure("configured signer is not an authorized solver"), true);
    assert.equal(isPermanentSettlementFailure("Intent #9 is not safely resumable from its on-chain state"), true);
    assert.equal(isPermanentSettlementFailure("HTTP request failed with timeout"), false);
    assert.equal(isPermanentSettlementFailure("Access denied: not publicly decryptable"), false);
  });

  it("maps permanent startup and mined-revert failures to the no-restart exit status", () => {
    assert.equal(solverExitCode("configured signer is not an authorized solver"), 78);
    assert.equal(solverExitCode("Batch 7 execution reverted: 0xabc"), 78);
    assert.equal(solverExitCode("HTTP request failed with timeout"), 1);
  });
});

describe("solver recovery policy", () => {
  it("pulls an untouched pending or batched intent", () => {
    assert.equal(nextIntentSettlementStep({ status: 1, pulled: false, unwrapStarted: false, finalizedAmount: 0n }), "pull");
    assert.equal(nextIntentSettlementStep({ status: 2, pulled: false, unwrapStarted: false, finalizedAmount: 0n }), "pull");
  });

  it("resumes each durable on-chain stage instead of pulling twice", () => {
    assert.equal(nextIntentSettlementStep({ status: 5, pulled: true, unwrapStarted: false, finalizedAmount: 0n }), "start-unwrap");
    assert.equal(nextIntentSettlementStep({ status: 5, pulled: true, unwrapStarted: true, finalizedAmount: 0n }), "finalize-unwrap");
    assert.equal(nextIntentSettlementStep({ status: 5, pulled: true, unwrapStarted: true, finalizedAmount: 9n }), "ready");
  });

  it("skips terminal and inconsistent intents", () => {
    assert.equal(nextIntentSettlementStep({ status: 3, pulled: false, unwrapStarted: false, finalizedAmount: 0n }), "skip");
    assert.equal(nextIntentSettlementStep({ status: 5, pulled: false, unwrapStarted: false, finalizedAmount: 0n }), "skip");
  });
});
