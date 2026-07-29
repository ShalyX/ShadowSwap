import test from "node:test";
import assert from "node:assert/strict";
import { applySlippageToQuote } from "./quote.ts";

test("derives minimum output from the executable AMM quote", () => {
  const liveQuote = 498_375_592_718_754n;
  assert.equal(applySlippageToQuote(liveQuote, 0.5), 495_883_714_755_160n);
});

test("rejects invalid slippage instead of producing an unsafe minimum", () => {
  assert.throws(() => applySlippageToQuote(1_000n, -0.1), /slippage/i);
  assert.throws(() => applySlippageToQuote(1_000n, 100), /slippage/i);
});
