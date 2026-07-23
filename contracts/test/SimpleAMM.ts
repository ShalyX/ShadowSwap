import assert from "node:assert/strict";
import { describe, it } from "node:test";
import hre from "hardhat";

describe("SimpleAMM", async function () {
  const { viem } = await hre.network.connect();
  const publicClient = await viem.getPublicClient();
  const [wallet] = await viem.getWalletClients();
  const me = wallet.account.address;

  it("quotes and swaps with constant product", async function () {
    const tokenA = await viem.deployContract("MockERC20", ["A", "A", 18]);
    const tokenB = await viem.deployContract("MockERC20", ["B", "B", 18]);
    const amm = await viem.deployContract("SimpleAMM", []);

    const liq = 1_000_000n * 10n ** 18n;
    await tokenA.write.mint([me, liq * 2n]);
    await tokenB.write.mint([me, liq * 2n]);
    await tokenA.write.approve([amm.address, liq]);
    await tokenB.write.approve([amm.address, liq]);
    await amm.write.addLiquidity([tokenA.address, tokenB.address, liq, liq]);

    const amountIn = 1_000n * 10n ** 18n;
    const amounts = await amm.read.getAmountsOut([
      amountIn,
      [tokenA.address, tokenB.address],
    ]);
    assert.equal(amounts.length, 2);
    assert.ok(amounts[1] > 0n);

    await tokenA.write.approve([amm.address, amountIn]);
    const balBefore = await tokenB.read.balanceOf([me]);
    await amm.write.swapExactTokensForTokens([
      amountIn,
      1n,
      [tokenA.address, tokenB.address],
      me,
      BigInt(Math.floor(Date.now() / 1000) + 600),
    ]);
    const balAfter = await tokenB.read.balanceOf([me]);
    assert.ok(balAfter > balBefore);

    // touch chain for sanity
    assert.ok((await publicClient.getBlockNumber()) >= 0n);
  });
});
