import hre from "hardhat";
import { createPublicClient, createWalletClient, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { sepolia } from "viem/chains";
import { createViemHandleClient } from "@iexec-nox/handle";

async function main() {
  const pk = process.env.PRIVATE_KEY;
  if (!pk) throw new Error("Set PRIVATE_KEY");
  
  // Use a reliable free RPC for Sepolia
  const rpc = "https://1rpc.io/sepolia";
  
  const account = privateKeyToAccount(pk.startsWith("0x") ? (pk as `0x${string}`) : (`0x${pk}` as `0x${string}`));
  const chain = sepolia;
  const transport = http(rpc);
  
  const walletClient = createWalletClient({ account, chain, transport });
  const publicClient = createPublicClient({ chain, transport });

  console.log("Using account:", account.address);

  // 1. Deploy ConfidentialPiggyBank
  const { viem } = await hre.network.connect();
  const txOpts = { 
    maxFeePerGas: 50_000_000_000n, 
    maxPriorityFeePerGas: 3_000_000_000n 
  } as const;

  console.log("Deploying ConfidentialPiggyBank...");
  const piggy = await viem.deployContract("ConfidentialPiggyBank", [], txOpts);
  console.log("Deployed to:", piggy.address);

  // 2. Initialize Nox Client
  const handleClient = await createViemHandleClient(walletClient as never, {
    gatewayUrl: "https://gateway-testnets.noxprotocol.dev",
    smartContractAddress: "0x24ef36ec5b626d7dcd09a98f3083c2758f0f77bf",
    subgraphUrl: "https://thegraph.ethereum-sepolia-testnet.noxprotocol.io/api/subgraphs/id/9CsccKwvgYFo72zZeU4k4wj2NEBLdWhVE3EUandgmzgo",
  });

  // 3. Encrypt Deposit
  console.log("Encrypting a deposit of 100...");
  const enc = await handleClient.encryptInput(100n, "uint256", piggy.address);
  console.log("Handle:", enc.handle);

  // 4. Send Deposit TX
  console.log("Sending deposit transaction...");
  const depositHash = await walletClient.writeContract({
    address: piggy.address,
    abi: [{ type: "function", name: "deposit", stateMutability: "nonpayable", inputs: [{ name: "inputHandle", type: "bytes32" }, { name: "inputProof", type: "bytes" }], outputs: [] }],
    functionName: "deposit",
    args: [enc.handle, enc.handleProof],
  });
  console.log(`Waiting for tx: ${depositHash}`);
  await publicClient.waitForTransactionReceipt({ hash: depositHash });

  // 5. Read Balance
  console.log("Reading encrypted balance handle from contract...");
  const balanceHandle = await publicClient.readContract({
    address: piggy.address,
    abi: [{ type: "function", name: "balance", stateMutability: "view", inputs: [], outputs: [{ type: "bytes32" }] }],
    functionName: "balance",
  });
  console.log("Encrypted Balance Handle:", balanceHandle);

  // 6. Decrypt Balance
  console.log("Decrypting balance handle via Nox Gateway...");
  const dec = await handleClient.decrypt(balanceHandle as `0x${string}`);
  console.log("\n=============================");
  console.log("🎉 SUCCESS: Decrypted Balance is:", dec.value);
  console.log("=============================\n");
}

main().catch(console.error);
