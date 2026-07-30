import test from "node:test";
import assert from "node:assert/strict";
import { effectiveRecoveryStatus, getRecoveryPresentation } from "./recoveryUi.ts";

const readyFinalized = {
  status: 5,
  kind: "finalized" as const,
  finalizedAmount: 100_000_000n,
  formattedAmount: "100",
  isConnected: true,
  isOwner: true,
  busy: false,
  locked: false,
  targetLabel: "Ethereum Sepolia",
};

test("blocks recovery writes when the wallet is not on Sepolia", () => {
  const presentation = getRecoveryPresentation({ ...readyFinalized, onTarget: false });
  assert.equal(presentation.disabled, true);
  assert.equal(presentation.action, "Switch to Ethereum Sepolia");
});

test("enables a ready owner recovery on the target chain", () => {
  const presentation = getRecoveryPresentation({ ...readyFinalized, onTarget: true });
  assert.equal(presentation.disabled, false);
  assert.equal(presentation.action, "Return funds");
  assert.equal(presentation.detail, "100 USDC ready");
});

test("keeps a receipt-confirmed recovery locally terminal if readback fails", () => {
  assert.equal(effectiveRecoveryStatus(5, true), 6);
  assert.equal(effectiveRecoveryStatus(5, false), 5);
});

test("shows a truthful terminal state for both recovery kinds", () => {
  for (const kind of ["finalized", "confidential"] as const) {
    const presentation = getRecoveryPresentation({
      ...readyFinalized,
      status: 6,
      kind,
      finalizedAmount: 0n,
      formattedAmount: "0",
      onTarget: true,
    });
    assert.equal(presentation.disabled, true);
    assert.equal(presentation.title, "Recovery complete");
    assert.equal(presentation.detail, "Funds returned to owner wallet");
    assert.equal(presentation.action, "Recovered");
  }
});
