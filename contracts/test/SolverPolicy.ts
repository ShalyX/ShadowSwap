import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { decideOpenBatch, nextIntentSettlementStep } from "../scripts/lib/solver-policy.js";

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
