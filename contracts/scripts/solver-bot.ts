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
    name: "executeBatchSamePair",
    stateMutability: "nonpayable",
    inputs: [
      { name: "batchId", type: "uint32" },
      { name: "intentIds", type: "uint256[]" },
      { name: "users", type: "address[]" },
      { name: "cTokenOut", type: "address" },
      { name: "tokenIn", type: "address" },
      { name: "tokenOut", type: "address" },
      { name: "amountIns", type: "uint256[]" },
      { name: "minOuts", type: "uint256[]" },
      { name: "deadline", type: "uint256" },
    ],
    outputs: [{ name: "netOut", type: "uint256" }],
  },
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
    name: "nextIntentId",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "uint256" }],
  },
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
    name: "sealCurrentBatch",
    stateMutability: "nonpayable",
    inputs: [],
    outputs: [{ name: "sealedId", type: "uint32" }],
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

  console.log("🤖 ShadowSwap Solver Bot Initialized");
  console.log("Signer:", account.address);
  console.log("Executor:", executor);
  console.log("IntentBook:", intentBook);

  const { createViemHandleClient } = await import("@iexec-nox/handle");
  const handleClient = await createViemHandleClient(walletClient as never, {
    gatewayUrl: "https://gateway-testnets.noxprotocol.dev",
    smartContractAddress: "0x24ef36ec5b626d7dcd09a98f3083c2758f0f77bf",
    subgraphUrl: "https://thegraph.ethereum-sepolia-testnet.noxprotocol.io/api/subgraphs/id/9CsccKwvgYFo72zZeU4k4wj2NEBLdWhVE3EUandgmzgo",
  });

  const initializedTokens = new Set<string>();

  console.log("Starting polling loop...\n");

  while (true) {
    try {
      const nextIntentId = await publicClient.readContract({
        address: intentBook,
        abi: BOOK_ABI,
        functionName: "nextIntentId",
      });

      const pendingIntents: Array<{ id: bigint; data: any }> = [];

      // Look at all intents we haven't confirmed are Executed/Cancelled
      // For simplicity, we just look at the last 50 intents max.
      // We subtract 1 because nextIntentId is the next ID to be assigned.
      const maxIntentId = nextIntentId > 0n ? nextIntentId - 1n : 0n;
      const start = maxIntentId > 50n ? maxIntentId - 50n : 1n;
      
      for (let i = start; i <= maxIntentId; i++) {
        const intent = await publicClient.readContract({
          address: intentBook,
          abi: BOOK_ABI,
          functionName: "getIntent",
          args: [i],
        });
        // status 1 = Pending
        if (intent.status === 1) {
          pendingIntents.push({ id: i, data: intent });
        }
      }

      if (pendingIntents.length > 0) {
        console.log(`Found ${pendingIntents.length} pending intents. Batching...`);
        
        // Group by (cTokenIn-tokenOut)
        const groups: Record<string, typeof pendingIntents> = {};
        for (const intent of pendingIntents) {
          const key = `${intent.data.cTokenIn}-${intent.data.tokenOut}`;
          if (!groups[key]) groups[key] = [];
          groups[key].push(intent);
        }

        // Execute each group
        for (const [key, group] of Object.entries(groups)) {
          console.log(`\n📦 Processing batch for pair ${key} (${group.length} intents)`);
          const intentIds = group.map((i) => i.id);

          try {
            // 0. Initialize executor balance if needed
            const cTokenIn = group[0].data.cTokenIn;
            if (!initializedTokens.has(cTokenIn)) {
              console.log(`  Initializing executor balance in ${cTokenIn}...`);
              const initTx = await walletClient.writeContract({
                address: cTokenIn,
                abi: [{ type: "function", name: "wrap", stateMutability: "nonpayable", inputs: [{ type: "address" }, { type: "uint256" }], outputs: [{ type: "uint256" }] }],
                functionName: "wrap",
                args: [executor, 0n],
              });
              await publicClient.waitForTransactionReceipt({ hash: initTx });
              initializedTokens.add(cTokenIn);
              console.log("  Executor balance initialized.");
            }

            // 1. Seal Batch
            console.log(`  Sealing batch...`);
            const sealTx = await walletClient.writeContract({
              address: intentBook,
              abi: BOOK_ABI,
              functionName: "sealCurrentBatch",
              args: [],
            });
            const sealReceipt = await publicClient.waitForTransactionReceipt({ hash: sealTx });
            // Extract batchId from receipt (quick hack, just read intent's batchId after)
            const updatedIntent = await publicClient.readContract({
              address: intentBook,
              abi: BOOK_ABI,
              functionName: "getIntent",
              args: [intentIds[0]],
            });
            const batchId = updatedIntent.batchId;
            console.log(`  Batch sealed. batchId: ${batchId}`);

            // 2. Process each intent
            const users: Address[] = [];
            const amountIns: bigint[] = [];
            const minOuts: bigint[] = [];

            for (let idx = 0; idx < group.length; idx++) {
              const intent = group[idx];
              console.log(`  -- Intent #${intent.id} --`);
              
              // Pull
              console.log(`     pullFromIntent...`);
              const pullHash = await walletClient.writeContract({
                address: executor,
                abi: EXECUTOR_ABI,
                functionName: "pullFromIntent",
                args: [intent.id],
              });
              const pullReceipt = await publicClient.waitForTransactionReceipt({ hash: pullHash });
              const pulled = parseEventField(pullReceipt.logs as never, "ConfidentialPulled", "amount", executor);
              
              // Unwrap
              console.log(`     startUnwrapHeld...`);
              const unwrapHash = await walletClient.writeContract({
                address: executor,
                abi: EXECUTOR_ABI,
                functionName: "startUnwrapHeld",
                args: [intent.id, intent.data.cTokenIn, pulled],
              });
              const unwrapReceipt = await publicClient.waitForTransactionReceipt({ hash: unwrapHash });
              const unwrapRequestId = parseEventField(unwrapReceipt.logs as never, "UnwrapStarted", "unwrapRequestId", executor);

              // Decrypt
              console.log(`     publicDecrypt via @iexec-nox/handle...`);
              let amountInClear: bigint | undefined;
              let decryptionProof: Hex | undefined;
              for (let i = 1; i <= 10; i++) {
                try {
                  const res = await handleClient.publicDecrypt(unwrapRequestId as never);
                  amountInClear = res.value as bigint;
                  decryptionProof = res.decryptionProof as Hex;
                  console.log(`       attempt ${i}: ok amountInClear=${amountInClear}`);
                  break;
                } catch (e) {
                  console.log(`       attempt ${i}:`, e instanceof Error ? e.message.slice(0, 100) : e);
                  await sleep(2000 * Math.pow(2, Math.min(i - 1, 3)));
                }
              }
              if (amountInClear == null || !decryptionProof) throw new Error("publicDecrypt failed");

              // Finalize
              console.log(`     finalizeUnwrapForIntent...`);
              const finHash = await walletClient.writeContract({
                address: executor,
                abi: EXECUTOR_ABI,
                functionName: "finalizeUnwrapForIntent",
                args: [intent.id, intent.data.cTokenIn, unwrapRequestId, decryptionProof],
              });
              await publicClient.waitForTransactionReceipt({ hash: finHash });

              users.push(intent.data.user);
              amountIns.push(amountInClear);
              minOuts.push(0n); // using 0 for minOut for simplicity, real bot would decrypt minAmountOut too
            }

            // 3. Execute Batch
            console.log(`  executeBatchSamePair...`);
            const deadline = BigInt(Math.floor(Date.now() / 1000) + 600);
            const execHash = await walletClient.writeContract({
              address: executor,
              abi: EXECUTOR_ABI,
              functionName: "executeBatchSamePair",
              args: [
                batchId,
                intentIds,
                users,
                group[0].data.cTokenOut,
                group[0].data.tokenIn,
                group[0].data.tokenOut,
                amountIns,
                minOuts,
                deadline
              ],
            });
            await publicClient.waitForTransactionReceipt({ hash: execHash });
            console.log(`  ✅ Batch executed successfully! tx: ${execHash}`);

          } catch (err) {
            console.error(`  ❌ Batch failed:`, err);
          }
        }
      }

    } catch (e) {
      console.error("Polling error:", e instanceof Error ? e.message : e);
    }

    await sleep(5000);
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
