import { createWalletClient, createPublicClient, http, parseEther, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { sepolia } from "viem/chains";
import deployments from "../../deployments/sepolia.json";

async function main() {
  const pk = process.env.PRIVATE_KEY;
  if (!pk) throw new Error("Missing PRIVATE_KEY");
  const rpc = process.env.SEPOLIA_RPC_URL || "https://rpc.sepolia.org";

  const account = privateKeyToAccount(pk.startsWith("0x") ? (pk as Hex) : (`0x${pk}` as Hex));
  const chain = sepolia;
  const transport = http(rpc);
  const walletClient = createWalletClient({ account, chain, transport });
  const publicClient = createPublicClient({ chain, transport });

  const user = "0x1DcB045123730e606A88380BCe534332F50332d2" as `0x${string}`;

  console.log("Sending Sepolia ETH to", user);
  const hashEth = await walletClient.sendTransaction({
    to: user,
    value: parseEther("0.05")
  });
  await publicClient.waitForTransactionReceipt({ hash: hashEth });
  console.log("ETH sent!");

  const MOCK_ERC20_ABI = [
    { type: "function", name: "mint", stateMutability: "nonpayable", inputs: [{ name: "to", type: "address" }, { name: "amount", type: "uint256" }], outputs: [] }
  ];

  console.log("Minting sUSD...");
  const hash1 = await walletClient.writeContract({
    address: deployments.sUSD as `0x${string}`,
    abi: MOCK_ERC20_ABI,
    functionName: "mint",
    args: [user, parseEther("10000")]
  });
  await publicClient.waitForTransactionReceipt({ hash: hash1 });
  
  console.log("Minting sETH...");
  const hash2 = await walletClient.writeContract({
    address: deployments.sETH as `0x${string}`,
    abi: MOCK_ERC20_ABI,
    functionName: "mint",
    args: [user, parseEther("10")]
  });
  await publicClient.waitForTransactionReceipt({ hash: hash2 });

  console.log("User successfully funded!");
}

main().catch(console.error);
