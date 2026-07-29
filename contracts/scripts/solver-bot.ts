import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
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
import { decideOpenBatch, nextIntentSettlementStep } from "./lib/solver-policy.js";

const EXECUTOR_ABI = [
  {
    type: "function",
    name: "executeBatchSamePair",
    stateMutability: "nonpayable",
    inputs: [
      { name: "batchId", type: "uint32" },
      { name: "intentIds", type: "uint256[]" },
      { name: "minOutDecryptProofs", type: "bytes[]" },
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
    type: "function",
    name: "authorizedSolvers",
    stateMutability: "view",
    inputs: [{ name: "solver", type: "address" }],
    outputs: [{ type: "bool" }],
  },
  {
    type: "function",
    name: "lastPulledAmount",
    stateMutability: "view",
    inputs: [{ name: "intentId", type: "uint256" }],
    outputs: [{ type: "bytes32" }],
  },
  {
    type: "function",
    name: "unwrapRequestForIntent",
    stateMutability: "view",
    inputs: [{ name: "intentId", type: "uint256" }],
    outputs: [{ type: "bytes32" }],
  },
  {
    type: "function",
    name: "finalizedAmountIn",
    stateMutability: "view",
    inputs: [{ name: "intentId", type: "uint256" }],
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
    name: "currentBatchId",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "uint32" }],
  },
  {
    type: "function",
    name: "batchWindow",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "uint64" }],
  },
  {
    type: "function",
    name: "batches",
    stateMutability: "view",
    inputs: [{ name: "batchId", type: "uint32" }],
    outputs: [
      { name: "openAt", type: "uint64" },
      { name: "sealAt", type: "uint64" },
      { name: "isSealed", type: "bool" },
      { name: "isExecuted", type: "bool" },
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
        config?: { executorSecurityVersion?: number };
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
      const v = (match.args as unknown as Record<string, unknown>)[field];
      if (typeof v === "string" && v.startsWith("0x")) return v as Hex;
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
        const v = (d.args as unknown as Record<string, unknown>)[field];
        if (typeof v === "string" && v.startsWith("0x")) return v as Hex;
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
  if (dep.config?.executorSecurityVersion !== 4) {
    throw new Error("Refusing settlement: deployment is not executor security version 4");
  }
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
  const isAuthorized = await publicClient.readContract({
    address: executor,
    abi: EXECUTOR_ABI,
    functionName: "authorizedSolvers",
    args: [account.address],
  });
  if (!isAuthorized) {
    throw new Error(`Configured signer ${account.address} is not an authorized solver`);
  }
  const chainId = await publicClient.getChainId();
  if (chainId !== sepolia.id) throw new Error(`Refusing unexpected chain id ${chainId}`);
  const minimumGasWei = BigInt(process.env.SOLVER_MIN_GAS_WEI || "1000000000000000");
  const pollMs = Number(process.env.SOLVER_POLL_MS || "15000");
  const maxScan = BigInt(process.env.SOLVER_MAX_SCAN || "200");
  if (!Number.isSafeInteger(pollMs) || pollMs < 5000) throw new Error("SOLVER_POLL_MS must be an integer >= 5000");

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

  const decryptWithRetry = async (handle: Hex) => {
    for (let attempt = 1; attempt <= 10; attempt++) {
      try {
        return await handleClient.publicDecrypt(handle as never);
      } catch (error) {
        const message = error instanceof Error ? error.message.slice(0, 140) : String(error);
        console.warn(`decrypt attempt ${attempt}/10 failed: ${message}`);
        if (attempt === 10) throw error;
        await sleep(2000 * Math.pow(2, Math.min(attempt - 1, 3)));
      }
    }
    throw new Error("publicDecrypt exhausted retries");
  };
  const zeroHandle = `0x${"0".repeat(64)}`.toLowerCase();

  while (true) {
    try {
      const gasBalance = await publicClient.getBalance({ address: account.address });
      if (gasBalance < minimumGasWei) {
        console.error(`Solver paused: gas balance ${gasBalance} is below floor ${minimumGasWei}`);
        await sleep(pollMs);
        continue;
      }

      const [nextIntentId, currentBatchId, batchWindow] = await Promise.all([
        publicClient.readContract({ address: intentBook, abi: BOOK_ABI, functionName: "nextIntentId" }),
        publicClient.readContract({ address: intentBook, abi: BOOK_ABI, functionName: "currentBatchId" }),
        publicClient.readContract({ address: intentBook, abi: BOOK_ABI, functionName: "batchWindow" }),
      ]);
      const currentBatch = await publicClient.readContract({
        address: intentBook,
        abi: BOOK_ABI,
        functionName: "batches",
        args: [currentBatchId],
      });

      const activeIntents: Array<{ id: bigint; data: any }> = [];
      const now = BigInt(Math.floor(Date.now() / 1000));
      const maxIntentId = nextIntentId > 0n ? nextIntentId - 1n : 0n;
      const startId = maxIntentId >= maxScan ? maxIntentId - maxScan + 1n : 1n;

      for (let intentId = startId; intentId <= maxIntentId; intentId++) {
        const intent = await publicClient.readContract({
          address: intentBook,
          abi: BOOK_ABI,
          functionName: "getIntent",
          args: [intentId],
        });
        const status = Number(intent.status);
        const freshQueued = (status === 1 || status === 2) && intent.deadline >= now;
        const recoverable = status === 5;
        if (freshQueued || recoverable) activeIntents.push({ id: intentId, data: intent });
      }

      const pairKey = (row: { data: any }) => [
        row.data.batchId,
        row.data.cTokenIn,
        row.data.cTokenOut,
        row.data.tokenIn,
        row.data.tokenOut,
      ].join("-").toLowerCase();

      const currentPending = activeIntents.filter(
        (row) => Number(row.data.status) === 1 && Number(row.data.batchId) === Number(currentBatchId)
      );
      const currentPairCounts = new Map<string, number>();
      for (const row of currentPending) {
        const key = pairKey(row);
        currentPairCounts.set(key, (currentPairCounts.get(key) || 0) + 1);
      }
      const largestCompatibleGroup = Math.max(0, ...currentPairCounts.values());
      const [openAt, , isSealed] = currentBatch;
      const sealDecision = isSealed ? "wait" : decideOpenBatch({
        compatibleCount: largestCompatibleGroup,
        openAt,
        windowSeconds: batchWindow,
        now,
      });
      let sealedNow = false;
      if (sealDecision === "seal") {
        console.log(`Sealing batch ${currentBatchId}: ${largestCompatibleGroup} compatible intent(s)`);
        const sealHash = await walletClient.writeContract({
          address: intentBook,
          abi: BOOK_ABI,
          functionName: "sealCurrentBatch",
          args: [],
        });
        const receipt = await publicClient.waitForTransactionReceipt({ hash: sealHash });
        if (receipt.status !== "success") throw new Error(`Batch seal reverted: ${sealHash}`);
        sealedNow = true;
        console.log(`Batch ${currentBatchId} sealed: ${sealHash}`);
      } else if (currentPending.length > 0 && !isSealed) {
        const age = now > openAt ? now - openAt : 0n;
        console.log(`Batch ${currentBatchId} remains open: ${largestCompatibleGroup} compatible, age ${age}/${batchWindow}s`);
      }

      const processable = activeIntents.filter((row) => {
        const status = Number(row.data.status);
        if (status === 2 || status === 5) return true;
        return status === 1 && sealedNow && Number(row.data.batchId) === Number(currentBatchId);
      });
      const groups: Record<string, typeof processable> = {};
      for (const row of processable) (groups[pairKey(row)] ||= []).push(row);

      for (const [key, group] of Object.entries(groups)) {
        console.log(`Processing ${key}: ${group.length} intent(s)`);
        try {
          const cTokenIn = group[0].data.cTokenIn as Address;
          const operatorAbi = [{
            type: "function",
            name: "isOperator",
            stateMutability: "view",
            inputs: [{ name: "holder", type: "address" }, { name: "spender", type: "address" }],
            outputs: [{ type: "bool" }],
          }] as const;
          for (const row of group) {
            if (Number(row.data.status) === 5) continue;
            const hasGrant = await publicClient.readContract({
              address: cTokenIn,
              abi: operatorAbi,
              functionName: "isOperator",
              args: [row.data.user as Address, executor],
            });
            if (!hasGrant) {
              throw new Error(`Intent #${row.id} is waiting for its user to renew the executor operator grant`);
            }
          }
          if (!initializedTokens.has(cTokenIn.toLowerCase())) {
            const initHash = await walletClient.writeContract({
              address: cTokenIn,
              abi: [{ type: "function", name: "wrap", stateMutability: "nonpayable", inputs: [{ type: "address" }, { type: "uint256" }], outputs: [{ type: "uint256" }] }],
              functionName: "wrap",
              args: [executor, 0n],
            });
            const initReceipt = await publicClient.waitForTransactionReceipt({ hash: initHash });
            if (initReceipt.status !== "success") throw new Error(`Executor balance initialization reverted: ${initHash}`);
            initializedTokens.add(cTokenIn.toLowerCase());
          }

          const intentIds: bigint[] = [];
          const minOutProofs: Hex[] = [];
          for (const row of group) {
            const intent = await publicClient.readContract({
              address: intentBook,
              abi: BOOK_ABI,
              functionName: "getIntent",
              args: [row.id],
            });
            let [pulled, unwrapRequestId, finalizedAmount] = await Promise.all([
              publicClient.readContract({ address: executor, abi: EXECUTOR_ABI, functionName: "lastPulledAmount", args: [row.id] }),
              publicClient.readContract({ address: executor, abi: EXECUTOR_ABI, functionName: "unwrapRequestForIntent", args: [row.id] }),
              publicClient.readContract({ address: executor, abi: EXECUTOR_ABI, functionName: "finalizedAmountIn", args: [row.id] }),
            ]);
            let step = nextIntentSettlementStep({
              status: Number(intent.status),
              pulled: pulled.toLowerCase() !== zeroHandle,
              unwrapStarted: unwrapRequestId.toLowerCase() !== zeroHandle,
              finalizedAmount,
            });
            console.log(`Intent #${row.id}: ${step}`);

            if (step === "pull") {
              const pullHash = await walletClient.writeContract({
                address: executor,
                abi: EXECUTOR_ABI,
                functionName: "pullFromIntent",
                args: [row.id],
              });
              const pullReceipt = await publicClient.waitForTransactionReceipt({ hash: pullHash });
              if (pullReceipt.status !== "success") throw new Error(`Intent #${row.id} pull reverted: ${pullHash}`);
              pulled = parseEventField(pullReceipt.logs as never, "ConfidentialPulled", "amount", executor);
              step = "start-unwrap";
            }
            if (step === "start-unwrap") {
              const unwrapHash = await walletClient.writeContract({
                address: executor,
                abi: EXECUTOR_ABI,
                functionName: "startUnwrapHeld",
                args: [row.id, intent.cTokenIn, pulled],
              });
              const unwrapReceipt = await publicClient.waitForTransactionReceipt({ hash: unwrapHash });
              if (unwrapReceipt.status !== "success") throw new Error(`Intent #${row.id} unwrap start reverted: ${unwrapHash}`);
              unwrapRequestId = parseEventField(unwrapReceipt.logs as never, "UnwrapStarted", "unwrapRequestId", executor);
              step = "finalize-unwrap";
            }
            if (step === "finalize-unwrap") {
              const amountResult = await decryptWithRetry(unwrapRequestId as Hex);
              if ((amountResult.value as bigint) <= 0n) throw new Error(`Intent #${row.id} decrypted to a non-positive input`);
              const finalizeHash = await walletClient.writeContract({
                address: executor,
                abi: EXECUTOR_ABI,
                functionName: "finalizeUnwrapForIntent",
                args: [row.id, intent.cTokenIn, unwrapRequestId, amountResult.decryptionProof as Hex],
              });
              const finalizeReceipt = await publicClient.waitForTransactionReceipt({ hash: finalizeHash });
              if (finalizeReceipt.status !== "success") throw new Error(`Intent #${row.id} unwrap finalization reverted: ${finalizeHash}`);
              finalizedAmount = amountResult.value as bigint;
              step = "ready";
            }
            if (step !== "ready" || finalizedAmount <= 0n) {
              throw new Error(`Intent #${row.id} is not safely resumable from its on-chain state`);
            }

            const minOutResult = await decryptWithRetry(intent.minAmountOut as Hex);
            if ((minOutResult.value as bigint) <= 0n) throw new Error(`Intent #${row.id} has invalid minOut`);
            intentIds.push(row.id);
            minOutProofs.push(minOutResult.decryptionProof as Hex);
          }

          const batchId = Number(group[0].data.batchId);
          const deadline = BigInt(Math.floor(Date.now() / 1000) + 600);
          const executeHash = await walletClient.writeContract({
            address: executor,
            abi: EXECUTOR_ABI,
            functionName: "executeBatchSamePair",
            args: [batchId, intentIds, minOutProofs, deadline],
          });
          const executeReceipt = await publicClient.waitForTransactionReceipt({ hash: executeHash });
          if (executeReceipt.status !== "success") throw new Error(`Batch ${batchId} execution reverted: ${executeHash}`);
          console.log(`Batch ${batchId} executed in one AMM transaction: ${executeHash}`);
        } catch (error) {
          console.error(`Batch group failed: ${error instanceof Error ? error.message : String(error)}`);
        }
      }
    } catch (error) {
      console.error(`Polling error: ${error instanceof Error ? error.message : String(error)}`);
    }

    if (process.env.SOLVER_ONCE === "1") break;
    await sleep(pollMs);
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
