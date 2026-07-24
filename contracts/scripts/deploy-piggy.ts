import hre from "hardhat";
import fs from "fs";
import path from "path";

async function main() {
  const { viem } = await hre.network.connect();
  const [walletClient] = await viem.getWalletClients();
  const publicClient = await viem.getPublicClient();
  const deployer = walletClient.account.address;
  console.log("Deploying Piggy Bank with account:", deployer);

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

  const piggy = await viem.deployContract("ConfidentialPiggyBank", [], txOpts);
  console.log("ConfidentialPiggyBank deployed to:", piggy.address);

  // Update frontend deployments
  const deploymentsPath = path.join(process.cwd(), "../frontend/src/lib/deployments.json");
  if (fs.existsSync(deploymentsPath)) {
    const data = JSON.parse(fs.readFileSync(deploymentsPath, "utf8"));
    data.contracts.ConfidentialPiggyBank = piggy.address;
    fs.writeFileSync(deploymentsPath, JSON.stringify(data, null, 2));
    console.log("Updated frontend deployments.json");
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
