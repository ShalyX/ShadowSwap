export function applySlippageToQuote(quotedAmountOut: bigint, slippagePct: number): bigint {
  if (!Number.isFinite(slippagePct) || slippagePct < 0 || slippagePct >= 100) {
    throw new Error("Slippage must be between 0 and 100 percent");
  }

  const slippageBps = BigInt(Math.round(slippagePct * 100));
  return (quotedAmountOut * (10_000n - slippageBps)) / 10_000n;
}
