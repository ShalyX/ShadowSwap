/**
 * ShadowSwap — solo settlement path (CLI).
 *
 * Prerequisites:
 *  - Contracts deployed (see deploy.ts → deployments/*.json)
 *  - User has: faucet → wrap → setOperator(executor) → submitIntent
 *  - Env: PRIVATE_KEY, SEPOLIA_RPC_URL (or local node)
 *  - Optional: INTENT_ID (defaults to latest for signer)
 *
 * Flow:
 *  1. pullFromIntent
 *  2. startUnwrapHeld
 *  3. publicDecrypt(unwrapRequestId) via @iexec-nox/handle
 *  4. finalizeUnwrapForIntent
 *  5. executeSoloAfterUnwrap
 *
 * Usage:
 *   INTENT_ID=1 npx hardhat run scripts/settle-solo.ts --network sepolia
 */
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import hre from "hardhat";
import {
  createWalletClient,
  createPublicClient,
  http,
  type Address,
  type Hex,
  parseEventLogs,
  decodeEventLog,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { sepolia } from "viem/chains";

const EXECUTOR_ABI = [
  {
    type: "function",
    name: "pullFromIntent",
    stateMutability: "nonpayable",
    inputs: [{ name: "intentId", type: "uint256" }],
    outputs: [{ type: "bytes32" }],
  },
  {
    type: "function",
    name: "startUnwrapHeld",
    stateMutability: "nonpayable",
    inputs: [
      { name: "intentId", type: "uint256" },
      { name: "cTokenIn", type: "address" },
      { name: "amount", type: "bytes32" },
    ],
    outputs: [{ type: "bytes32" }],
  },
  {
    type: "function",
    name: "finalizeUnwrapForIntent",
    stateMutability: "nonpayable",
    inputs: [
      { name: "intentId", type: "uint256" },
      { name: "cTokenIn", type: "address" },
      { name: "unwrapRequestId", type: "bytes32" },
      { name: "decryptedAmountAndProof", type: "bytes" },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "executeSoloAfterUnwrap",
    stateMutability: "nonpayable",
    inputs: [
      { name: "intentId", type: "uint256" },
      { name: "user", type: "address" },
      { name: "cTokenOut", type: "address" },
      { name: "tokenIn", type: "address" },
      { name: "tokenOut", type: "address" },
      { name: "amountInClear", type: "uint256" },
      { name: "minOutClear", type: "uint256" },
      { name: "deadline", type: "uint256" },
    ],
    outputs: [{ type: "uint256" }],
  },
  {
    type: "event",
    name: "ConfidentialPulled",
    inputs: [
      { name: "intentId", type: "uint256", indexed: true },
      { name: "from", type: "address", indexed: true },
      { name: "cTokenIn", type: "address", indexed: true },
      { name: "amount", type: "bytes32", indexed: false },
    ],
  },
  {
    type: "event",
    name: "UnwrapStarted",
    inputs: [
      { name: "intentId", type: "uint256", indexed: true },
      { name: "cTokenIn", type: "address", indexed: true },
      { name: "unwrapRequestId", type: "bytes32", indexed: false },
    ],
  },
] as const;

const BOOK_ABI = [
  {
    type: "function",
    name: "getIntent",
    stateMutability: "view",
    inputs: [{ name: "intentId", type: "uint256" }],
    outputs: [
      {
        type: "tuple",
        components: [
          { name: "user", type: "address" },
          { name: "cTokenIn", type: "address" },
          { name: "cTokenOut", type: "address" },
          { name: "tokenIn", type: "address" },
          { name: "tokenOut", type: "address" },
          { name: "amountIn", type: "bytes32" },
          { name: "minAmountOut", type: "bytes32" },
          { name: "deadline", type: "uint64" },
          { name: "createdAt", type: "uint64" },
          { name: "batchId", type: "uint32" },
          { name: "status", type: "uint8" },
        ],
      },
    ],
  },
  {
    type: "function",
    name: "getUserIntents",
    stateMutability: "view",
    inputs: [{ name: "user", type: "address" }],
    outputs: [{ type: "uint256[]" }],
  },
] as const;

function loadDeployment() {
  const candidates = [
    join(process.cwd(), "..", "deployments", "sepolia.json"),
    join(process.cwd(), "deployments", "sepolia.json"),
    join(process.cwd(), "..", "frontend", "src", "lib", "deployments.json"),
  ];
  for (const p of candidates) {
    if (existsSync(p)) {
      return JSON.parse(readFileSync(p, "utf8")) as {
        contracts: Record<string, string>;
      };
    }
  }
  throw new Error("No deployments file found — run deploy:sepolia first");
}

function parseEventField(
  logs: { address: string; data: Hex; topics: Hex[] }[],
  eventName: "ConfidentialPulled" | "UnwrapStarted",
  field: "amount" | "unwrapRequestId",
  executor: string
): Hex {
  try {
    const events = parseEventLogs({
      abi: EXECUTOR_ABI,
      logs: logs as never,
      eventName,
    });
    const match = events.find((e) => e.address.toLowerCase() === executor.toLowerCase());
    if (match && "args" in match) {
      const v = (match.args as Record<string, Hex>)[field];
      if (v) return v;
    }
  } catch {
    /* fall through */
  }
  for (const log of logs) {
    try {
      const d = decodeEventLog({
        abi: EXECUTOR_ABI,
        data: log.data,
        topics: log.topics as [Hex, ...Hex[]],
      });
      if (d.eventName === eventName) {
        const v = (d.args as Record<string, Hex>)[field];
        if (v) return v;
      }
    } catch {
      /* skip */
    }
  }
  throw new Error(`${eventName}.${field} not found in logs`);
}

async function sleep(ms: number) {
  await new Promise((r) => setTimeout(r, ms));
}

async function main() {
  const dep = loadDeployment();
  const executor = dep.contracts.executor as Address;
  const intentBook = dep.contracts.intentBook as Address;
  if (!executor || executor === "0x0000000000000000000000000000000000000000") {
    throw new Error("Executor not deployed in deployments file");
  }

  const pk = process.env.PRIVATE_KEY;
  if (!pk) throw new Error("Set PRIVATE_KEY");
  const rpc = process.env.SEPOLIA_RPC_URL || process.env.RPC_URL;
  if (!rpc) throw new Error("Set SEPOLIA_RPC_URL");

  const account = privateKeyToAccount(pk.startsWith("0x") ? (pk as Hex) : (`0x${pk}` as Hex));
  const chain = sepolia;
  const transport = http(rpc);
  const walletClient = createWalletClient({ account, chain, transport });
  const publicClient = createPublicClient({ chain, transport });

  console.log("Signer:", account.address);
  console.log("Executor:", executor);
  console.log("IntentBook:", intentBook);

  let intentId = process.env.INTENT_ID ? BigInt(process.env.INTENT_ID) : null;
  if (intentId == null) {
    const ids = (await publicClient.readContract({
      address: intentBook,
      abi: BOOK_ABI,
      functionName: "getUserIntents",
      args: [account.address],
    })) as bigint[];
    if (!ids.length) throw new Error("No intents for signer — submit one first");
    intentId = ids[ids.length - 1];
  }
  console.log("Intent id:", intentId.toString());

  const intent = (await publicClient.readContract({
    address: intentBook,
    abi: BOOK_ABI,
    functionName: "getIntent",
    args: [intentId],
  })) as {
    user: Address;
    cTokenIn: Address;
    cTokenOut: Address;
    tokenIn: Address;
    tokenOut: Address;
    minAmountOut: Hex;
    status: number;
  };
  console.log("Intent status:", intent.status, "cTokenIn:", intent.cTokenIn);

  // --- BUGFIX: Initialize executor balance in cTokenIn ---
  // If the executor has never received cTokenIn, its balance handle is 0x0.
  // Nox.transfer fails with NotAllowed(0x0, cToken) if the recipient's balance is 0x0.
  // Wrapping 0 tokens initializes the balance handle for the executor!
  console.log("\n0) Initializing executor balance in cTokenIn...");
  const initTx = await walletClient.writeContract({
    address: intent.cTokenIn,
    abi: [
      {
        type: "function",
        name: "wrap",
        stateMutability: "nonpayable",
        inputs: [{ type: "address" }, { type: "uint256" }],
        outputs: [{ type: "uint256" }],
      },
    ],
    functionName: "wrap",
    args: [executor, 0n],
  });
  await publicClient.waitForTransactionReceipt({ hash: initTx });
  console.log("Executor balance initialized.");

  // 1) Pull
  console.log("\n1) pullFromIntent…");
  const pullHash = await walletClient.writeContract({
    address: executor,
    abi: EXECUTOR_ABI,
    functionName: "pullFromIntent",
    args: [intentId],
  });
  const pullReceipt = await publicClient.waitForTransactionReceipt({ hash: pullHash });
  const pulled = parseEventField(
    pullReceipt.logs as never,
    "ConfidentialPulled",
    "amount",
    executor
  );
  console.log("  pulled handle:", pulled);
  console.log("  tx:", pullHash);

  // 2) Unwrap
  console.log("\n2) startUnwrapHeld…");
  const unwrapHash = await walletClient.writeContract({
    address: executor,
    abi: EXECUTOR_ABI,
    functionName: "startUnwrapHeld",
    args: [intentId, intent.cTokenIn, pulled],
  });
  const unwrapReceipt = await publicClient.waitForTransactionReceipt({ hash: unwrapHash });
  const unwrapRequestId = parseEventField(
    unwrapReceipt.logs as never,
    "UnwrapStarted",
    "unwrapRequestId",
    executor
  );
  console.log("  unwrapRequestId:", unwrapRequestId);
  console.log("  tx:", unwrapHash);

  // 3) publicDecrypt
  console.log("\n3) publicDecrypt via @iexec-nox/handle...");
  // Dynamic import so contracts package can run without hard dep if missing
  const { createViemHandleClient } = await import("@iexec-nox/handle");
  const handleClient = await createViemHandleClient(walletClient as never, {
    gatewayUrl: "https://gateway-testnets.noxprotocol.dev",
    smartContractAddress: "0x24ef36ec5b626d7dcd09a98f3083c2758f0f77bf",
    subgraphUrl: "https://thegraph.ethereum-sepolia-testnet.noxprotocol.io/api/subgraphs/id/9CsccKwvgYFo72zZeU4k4wj2NEBLdWhVE3EUandgmzgo",
  });

  let amountInClear: bigint | undefined;
  let decryptionProof: Hex | undefined;
  let lastErr: unknown;
  for (let i = 1; i <= 12; i++) {
    try {
      const res = await handleClient.publicDecrypt(unwrapRequestId as never);
      amountInClear = res.value as bigint;
      decryptionProof = res.decryptionProof as Hex;
      console.log(`  attempt ${i}: ok amountInClear=${amountInClear}`);
      break;
    } catch (e) {
      lastErr = e;
      console.log(`  attempt ${i}:`, e instanceof Error ? e.message.slice(0, 100) : e);
      await sleep(Math.min(2000 * 2 ** Math.min(i - 1, 4), 20000));
    }
  }
  if (amountInClear == null || !decryptionProof) {
    throw lastErr instanceof Error ? lastErr : new Error("publicDecrypt failed");
  }

  // 4) Finalize
  console.log("\n4) finalizeUnwrapForIntent…");
  const finHash = await walletClient.writeContract({
    address: executor,
    abi: EXECUTOR_ABI,
    functionName: "finalizeUnwrapForIntent",
    args: [intentId, intent.cTokenIn, unwrapRequestId, decryptionProof],
  });
  await publicClient.waitForTransactionReceipt({ hash: finHash });
  console.log("  tx:", finHash);

  // minOut: optional MIN_OUT env, else 0 (demo only — set MIN_OUT for real slippage)
  const minOutClear = process.env.MIN_OUT ? BigInt(process.env.MIN_OUT) : 0n;
  if (minOutClear === 0n) {
    console.warn("  WARN: MIN_OUT=0 — sandwichable; set MIN_OUT for production demos");
  }

  // 5) Execute
  console.log("\n5) executeSoloAfterUnwrap…");
  const deadline = BigInt(Math.floor(Date.now() / 1000) + 600);
  const execHash = await walletClient.writeContract({
    address: executor,
    abi: EXECUTOR_ABI,
    functionName: "executeSoloAfterUnwrap",
    args: [
      intentId,
      intent.user,
      intent.cTokenOut,
      intent.tokenIn,
      intent.tokenOut,
      amountInClear,
      minOutClear,
      deadline,
    ],
  });
  await publicClient.waitForTransactionReceipt({ hash: execHash });
  console.log("  tx:", execHash);
  console.log("\n✅ Solo settlement complete for intent", intentId.toString());

  // silence unused hre import warning in some setups
  void hre;
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
