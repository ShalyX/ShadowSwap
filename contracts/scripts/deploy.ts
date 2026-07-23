/**
 * ShadowSwap deploy script — local Hardhat or Ethereum Sepolia.
 *
 * Deploys:
 *  - MockERC20 sUSD / sETH (demo assets)
 *  - SimpleAMM + seed liquidity
 *  - ConfidentialWrappedToken wrappers (cSUSD / cSETH)
 *  - ShadowIntentBook (5 min batch window default)
 *  - ShadowSwapExecutor
 *  - ShadowFaucet
 *
 * Env:
 *  PRIVATE_KEY, SEPOLIA_RPC_URL (for sepolia)
 */
import { writeFileSync, mkdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import hre from "hardhat";

async function sleep(ms: number) {
  await new Promise((r) => setTimeout(r, ms));
}

async function main() {
  const { viem } = await hre.network.connect();
  const [walletClient] = await viem.getWalletClients();
  const publicClient = await viem.getPublicClient();
  const deployer = walletClient.account.address;

  console.log("Deployer:", deployer);
  console.log("Chain:", await publicClient.getChainId());

  // Bump fees so sequential txs on public RPCs don't hit "replacement underpriced"
  const fees = await publicClient.estimateFeesPerGas().catch(() => null);
  const maxPriorityFeePerGas =
    fees?.maxPriorityFeePerGas != null
      ? (fees.maxPriorityFeePerGas * 3n) / 2n + 2_000_000_000n
      : 3_000_000_000n;
  const maxFeePerGas =
    fees?.maxFeePerGas != null
      ? (fees.maxFeePerGas * 2n) + maxPriorityFeePerGas
      : 50_000_000_000n;

  const txOpts = { maxFeePerGas, maxPriorityFeePerGas } as const;
  console.log(
    "Fees:",
    "maxFee",
    maxFeePerGas.toString(),
    "priority",
    maxPriorityFeePerGas.toString()
  );

  /** Wait for a writeContract-style hash and throw if it reverted */
  async function waitTx(label: string, hashPromise: Promise<`0x${string}`>) {
    const hash = await hashPromise;
    console.log(`  ${label} tx ${hash.slice(0, 12)}…`);
    const receipt = await publicClient.waitForTransactionReceipt({
      hash,
      confirmations: 1,
      timeout: 180_000,
    });
    if (receipt.status !== "success") {
      throw new Error(`${label} reverted (status=${receipt.status}) tx=${hash}`);
    }
    // small gap so nonce/mempool stays calm on public RPCs
    await sleep(1500);
    return receipt;
  }

  const amountA = 1_000_000n * 10n ** 6n; // 1M sUSD (6 dec)
  const amountB = 500n * 10n ** 18n; // 500 sETH (18 dec)
  const lpA = 100_000n * 10n ** 6n;
  const lpB = 50n * 10n ** 18n;
  const faucetA = 1_000n * 10n ** 6n;
  const faucetB = 1n * 10n ** 18n;
  const batchWindow = 300n; // 5 minutes

  console.log("\n1) Mock tokens...");
  const tokenA = await viem.deployContract("MockERC20", ["Shadow USD", "sUSD", 6], txOpts);
  console.log("  sUSD:", tokenA.address);
  await sleep(1500);
  const tokenB = await viem.deployContract("MockERC20", ["Shadow ETH", "sETH", 18], txOpts);
  console.log("  sETH:", tokenB.address);
  await sleep(1500);

  console.log("\n2) Mint demo inventory to deployer...");
  await waitTx("mint sUSD", tokenA.write.mint([deployer, amountA], txOpts));
  await waitTx("mint sETH", tokenB.write.mint([deployer, amountB], txOpts));

  console.log("\n3) SimpleAMM + liquidity...");
  const amm = await viem.deployContract("SimpleAMM", [], txOpts);
  console.log("  AMM:", amm.address);
  await sleep(1500);
  await waitTx("approve sUSD→AMM", tokenA.write.approve([amm.address, lpA], txOpts));
  await waitTx("approve sETH→AMM", tokenB.write.approve([amm.address, lpB], txOpts));
  await waitTx(
    "addLiquidity",
    amm.write.addLiquidity([tokenA.address, tokenB.address, lpA, lpB], txOpts)
  );

  console.log("\n4) Confidential wrappers (Nox ERC-7984)...");
  // NOTE: On local hardhat without NoxCompute, confidential ops will not fully work.
  // On Sepolia, NoxCompute is at 0x24Ef36Ec5b626D7DCD09a98F3083c2758F0F77bF
  const cTokenA = await viem.deployContract(
    "ConfidentialWrappedToken",
    ["Confidential Shadow USD", "cSUSD", "https://shadowswap.local/cSUSD", tokenA.address],
    txOpts
  );
  console.log("  cSUSD:", cTokenA.address);
  await sleep(1500);
  const cTokenB = await viem.deployContract(
    "ConfidentialWrappedToken",
    ["Confidential Shadow ETH", "cSETH", "https://shadowswap.local/cSETH", tokenB.address],
    txOpts
  );
  console.log("  cSETH:", cTokenB.address);
  await sleep(1500);

  console.log("\n5) Intent book + executor...");
  const book = await viem.deployContract("ShadowIntentBook", [batchWindow], txOpts);
  console.log("  IntentBook:", book.address);
  await sleep(1500);
  const executor = await viem.deployContract(
    "ShadowSwapExecutor",
    [book.address, amm.address],
    txOpts
  );
  console.log("  Executor:", executor.address);
  await sleep(1500);
  await waitTx("setExecutor", book.write.setExecutor([executor.address], txOpts));

  console.log("\n6) Faucet...");
  const faucet = await viem.deployContract(
    "ShadowFaucet",
    [
      tokenA.address,
      tokenB.address,
      faucetA,
      faucetB,
      0n, // no cooldown for hackathon demo
    ],
    txOpts
  );
  console.log("  Faucet:", faucet.address);
  await sleep(1500);

  // Fund faucet with inventory so users can claim
  console.log("\n7) Fund faucet...");
  await waitTx("fund faucet sUSD", tokenA.write.transfer([faucet.address, faucetA * 50n], txOpts));
  await waitTx("fund faucet sETH", tokenB.write.transfer([faucet.address, faucetB * 50n], txOpts));

  const chainId = await publicClient.getChainId();
  const deployment = {
    network: chainId === 11155111 ? "sepolia" : `chain-${chainId}`,
    chainId,
    deployedAt: new Date().toISOString(),
    deployer,
    explorer: chainId === 11155111 ? "https://sepolia.etherscan.io" : null,
    contracts: {
      sUSD: tokenA.address,
      sETH: tokenB.address,
      cSUSD: cTokenA.address,
      cSETH: cTokenB.address,
      simpleAMM: amm.address,
      intentBook: book.address,
      executor: executor.address,
      faucet: faucet.address,
      noxCompute:
        chainId === 11155111
          ? "0x24Ef36Ec5b626D7DCD09a98F3083c2758F0F77bF"
          : "0xB9E659AFC855778060Cf0B86E349a36404b7614c",
      uniswapV2Router02Sepolia: "0xeE567Fe1712Faf6149d80dA1E6934E354124CfE3",
    },
    config: {
      batchWindowSeconds: Number(batchWindow),
      faucetAmounts: {
        sUSD: faucetA.toString(),
        sETH: faucetB.toString(),
      },
      seedLiquidity: {
        sUSD: lpA.toString(),
        sETH: lpB.toString(),
      },
    },
  };

  const outDir = join(process.cwd(), "..", "deployments");
  if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true });
  const outFile = join(outDir, `${deployment.network}.json`);
  writeFileSync(outFile, JSON.stringify(deployment, null, 2));
  // Also mirror into frontend
  const feDir = join(process.cwd(), "..", "frontend", "src", "lib");
  if (existsSync(join(process.cwd(), "..", "frontend"))) {
    if (!existsSync(feDir)) mkdirSync(feDir, { recursive: true });
    writeFileSync(join(feDir, "deployments.json"), JSON.stringify(deployment, null, 2));
  }

  console.log("\n✅ Deployment written to", outFile);
  console.log(JSON.stringify(deployment.contracts, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
