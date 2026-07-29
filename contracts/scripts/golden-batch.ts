import "dotenv/config";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import {
  createPublicClient,
  createWalletClient,
  http,
  parseEventLogs,
  parseUnits,
  type Address,
  type Hex,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { sepolia } from "viem/chains";
import {
  buildGoldenMinOuts,
  validateGoldenBatch,
  validateGoldenBatchMembership,
  validateGoldenDeployment,
  validateRuntimeBytecode,
  type GoldenIntent,
} from "./lib/golden-batch.js";

type Deployment = {
  network: string;
  chainId: number;
  deployedAt: string;
  contracts: Record<string, Address>;
  config: {
    executorSecurityVersion?: number;
    executorRuntimeCodeHash?: Hex;
    settlementVenue?: string;
  };
};

const root = join(process.cwd(), "..");
const deployment = JSON.parse(
  readFileSync(join(root, "deployments", "sepolia.json"), "utf8")
) as Deployment;

const bookAbi = [
  { type: "function", name: "nextIntentId", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
  { type: "function", name: "currentBatchId", stateMutability: "view", inputs: [], outputs: [{ type: "uint32" }] },
  { type: "function", name: "getBatchIntentIds", stateMutability: "view", inputs: [{ type: "uint32" }], outputs: [{ type: "uint256[]" }] },
  { type: "function", name: "sealCurrentBatch", stateMutability: "nonpayable", inputs: [], outputs: [{ type: "uint32" }] },
  { type: "function", name: "submitIntent", stateMutability: "nonpayable", inputs: [
    { type: "address" }, { type: "address" }, { type: "address" }, { type: "address" },
    { type: "bytes32" }, { type: "bytes" }, { type: "bytes32" }, { type: "bytes" }, { type: "uint64" },
  ], outputs: [{ type: "uint256" }] },
  { type: "function", name: "getIntent", stateMutability: "view", inputs: [{ type: "uint256" }], outputs: [{ type: "tuple", components: [
    { name: "user", type: "address" }, { name: "cTokenIn", type: "address" }, { name: "cTokenOut", type: "address" },
    { name: "tokenIn", type: "address" }, { name: "tokenOut", type: "address" }, { name: "amountIn", type: "bytes32" },
    { name: "minAmountOut", type: "bytes32" }, { name: "deadline", type: "uint64" }, { name: "createdAt", type: "uint64" },
    { name: "batchId", type: "uint32" }, { name: "status", type: "uint8" },
  ] }] },
  { type: "function", name: "batches", stateMutability: "view", inputs: [{ type: "uint32" }], outputs: [
    { name: "openAt", type: "uint64" }, { name: "sealAt", type: "uint64" }, { name: "isSealed", type: "bool" },
    { name: "isExecuted", type: "bool" },
  ] },
] as const;

const erc20Abi = [
  { type: "function", name: "approve", stateMutability: "nonpayable", inputs: [{ type: "address" }, { type: "uint256" }], outputs: [{ type: "bool" }] },
] as const;

const cTokenAbi = [
  { type: "function", name: "wrap", stateMutability: "nonpayable", inputs: [{ type: "address" }, { type: "uint256" }], outputs: [{ type: "bytes32" }] },
  { type: "function", name: "setOperator", stateMutability: "nonpayable", inputs: [{ type: "address" }, { type: "uint48" }], outputs: [] },
  { type: "function", name: "isOperator", stateMutability: "view", inputs: [{ type: "address" }, { type: "address" }], outputs: [{ type: "bool" }] },
] as const;

const ammAbi = [
  { type: "function", name: "getAmountsOut", stateMutability: "view", inputs: [{ type: "uint256" }, { type: "address[]" }], outputs: [{ type: "uint256[]" }] },
] as const;

const executorAbi = [
  { type: "function", name: "authorizedSolvers", stateMutability: "view", inputs: [{ type: "address" }], outputs: [{ type: "bool" }] },
  { type: "function", name: "pullFromIntent", stateMutability: "nonpayable", inputs: [{ type: "uint256" }], outputs: [{ type: "bytes32" }] },
  { type: "function", name: "startUnwrapHeld", stateMutability: "nonpayable", inputs: [{ type: "uint256" }, { type: "address" }, { type: "bytes32" }], outputs: [{ type: "bytes32" }] },
  { type: "function", name: "finalizeUnwrapForIntent", stateMutability: "nonpayable", inputs: [{ type: "uint256" }, { type: "address" }, { type: "bytes32" }, { type: "bytes" }], outputs: [] },
  { type: "function", name: "finalizedAmountIn", stateMutability: "view", inputs: [{ type: "uint256" }], outputs: [{ type: "uint256" }] },
  { type: "function", name: "executeBatchSamePair", stateMutability: "nonpayable", inputs: [
    { type: "uint32" }, { type: "uint256[]" }, { type: "bytes[]" }, { type: "uint256" },
  ], outputs: [{ type: "uint256" }] },
  { type: "event", name: "ConfidentialPulled", inputs: [
    { name: "intentId", type: "uint256", indexed: true }, { name: "from", type: "address", indexed: true },
    { name: "cTokenIn", type: "address", indexed: true }, { name: "amount", type: "bytes32", indexed: false },
  ] },
  { type: "event", name: "UnwrapStarted", inputs: [
    { name: "intentId", type: "uint256", indexed: true }, { name: "cTokenIn", type: "address", indexed: true },
    { name: "unwrapRequestId", type: "bytes32", indexed: false },
  ] },
  { type: "event", name: "BatchSwapExecuted", inputs: [
    { name: "batchId", type: "uint32", indexed: true }, { name: "tokenIn", type: "address", indexed: false },
    { name: "tokenOut", type: "address", indexed: false }, { name: "netAmountIn", type: "uint256", indexed: false },
    { name: "netAmountOut", type: "uint256", indexed: false }, { name: "intentCount", type: "uint256", indexed: false },
  ] },
] as const;

type IntentEvidence = {
  id: string;
  amountIn: string;
  minOut: string;
  submitTx: Hex;
  pullTx?: Hex;
  unwrapTx?: Hex;
  finalizeTx?: Hex;
  unwrapRequestId?: Hex;
};

type Evidence = {
  schemaVersion: 2;
  network: "sepolia";
  chainId: 11155111;
  executorSecurityVersion: 4;
  executorRuntimeCodeHash: Hex;
  deployment: { deployedAt: string; contracts: Record<string, Address> };
  startedAt: string;
  signer: Address;
  settlementVenue: string;
  batchId: number;
  quotedNetOut: string;
  approvalTx?: Hex;
  wrapTx?: Hex;
  operatorTx?: Hex;
  sealTx?: Hex;
  intents: IntentEvidence[];
  executeTx?: Hex;
  netAmountIn?: string;
  netAmountOut?: string;
  blockNumber?: string;
  gasUsed?: string;
  completedAt?: string;
};

const evidencePath = join(root, "evidence", "golden-batch", "v4", "latest.json");
function save(evidence: Evidence): void {
  mkdirSync(dirname(evidencePath), { recursive: true });
  writeFileSync(evidencePath, `${JSON.stringify(evidence, null, 2)}\n`);
}

function eventField(
  logs: readonly unknown[],
  eventName: "ConfidentialPulled" | "UnwrapStarted",
  field: "amount" | "unwrapRequestId"
): Hex {
  const events = parseEventLogs({ abi: executorAbi, logs: logs as never, eventName });
  const event = events[0];
  if (!event) throw new Error(`${eventName} missing from receipt`);
  const value = (event.args as unknown as Record<string, Hex>)[field];
  if (!value) throw new Error(`${eventName}.${field} missing from receipt`);
  return value;
}

async function retryDecrypt(
  handleClient: { publicDecrypt(handle: never): Promise<{ value: unknown; decryptionProof: string }> },
  handle: Hex,
  label: string
): Promise<{ value: bigint; proof: Hex }> {
  for (let attempt = 1; attempt <= 10; attempt++) {
    try {
      const result = await handleClient.publicDecrypt(handle as never);
      return { value: result.value as bigint, proof: result.decryptionProof as Hex };
    } catch (error) {
      const message = error instanceof Error ? error.message.slice(0, 120) : String(error);
      console.log(`${label} decrypt attempt ${attempt}: ${message}`);
      await new Promise((resolve) => setTimeout(resolve, Math.min(16_000, 2_000 * 2 ** (attempt - 1))));
    }
  }
  throw new Error(`${label} publicDecrypt failed after 10 attempts`);
}

async function main(): Promise<void> {
  validateGoldenDeployment(deployment.config, [1n, 1n]);
  if (deployment.chainId !== sepolia.id || deployment.network !== "sepolia") {
    throw new Error("deployment manifest is not Ethereum Sepolia");
  }
  if (existsSync(evidencePath)) {
    const previous = JSON.parse(readFileSync(evidencePath, "utf8")) as Evidence;
    if (previous.completedAt) {
      throw new Error(`v4 golden batch already completed at ${previous.completedAt}`);
    }
    throw new Error(`incomplete v4 evidence exists at ${evidencePath}; inspect it before retrying`);
  }

  const privateKey = process.env.PRIVATE_KEY;
  const rpcUrl = process.env.SEPOLIA_RPC_URL;
  if (!privateKey || !rpcUrl) throw new Error("PRIVATE_KEY and SEPOLIA_RPC_URL are required");

  const account = privateKeyToAccount(
    (privateKey.startsWith("0x") ? privateKey : `0x${privateKey}`) as Hex
  );
  const transport = http(rpcUrl);
  const wallet = createWalletClient({ account, chain: sepolia, transport });
  const publicClient = createPublicClient({ chain: sepolia, transport });
  if ((await publicClient.getChainId()) !== sepolia.id) throw new Error("RPC is not Ethereum Sepolia");
  const waitSuccess = async (label: string, txHash: Hex) => {
    const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });
    if (receipt.status !== "success") throw new Error(`${label} reverted: ${txHash}`);
    return receipt;
  };

  const { intentBook, executor, sUSD, sETH, cSUSD, cSETH, noxCompute, simpleAMM } = deployment.contracts;
  for (const [name, address] of Object.entries({ intentBook, executor, sUSD, sETH, cSUSD, cSETH, simpleAMM })) {
    if ((await publicClient.getCode({ address })) == null) throw new Error(`${name} has no deployed bytecode`);
  }
  const artifactPath = join(
    process.cwd(),
    "artifacts",
    "contracts",
    "ShadowSwapExecutor.sol",
    "ShadowSwapExecutor.json"
  );
  if (!existsSync(artifactPath)) {
    throw new Error("compiled ShadowSwapExecutor artifact is missing; run npm run compile first");
  }
  const artifact = JSON.parse(readFileSync(artifactPath, "utf8")) as { deployedBytecode: Hex };
  const deployedExecutorCode = await publicClient.getCode({ address: executor });
  if (!deployedExecutorCode) throw new Error("executor has no deployed runtime bytecode");
  const executorRuntimeCodeHash = validateRuntimeBytecode(
    artifact.deployedBytecode,
    deployedExecutorCode
  );
  if (deployment.config.executorRuntimeCodeHash !== executorRuntimeCodeHash) {
    throw new Error(
      `executor runtime hash is not provenance-bound in the manifest: expected ${executorRuntimeCodeHash}`
    );
  }
  const authorized = await publicClient.readContract({
    address: executor,
    abi: executorAbi,
    functionName: "authorizedSolvers",
    args: [account.address],
  });
  if (!authorized) throw new Error(`signer ${account.address} is not an authorized solver`);

  const batchId = Number(await publicClient.readContract({ address: intentBook, abi: bookAbi, functionName: "currentBatchId" }));
  const batch = await publicClient.readContract({ address: intentBook, abi: bookAbi, functionName: "batches", args: [batchId] });
  const existingIds = await publicClient.readContract({ address: intentBook, abi: bookAbi, functionName: "getBatchIntentIds", args: [batchId] });
  if (batch[2] || batch[3] || existingIds.length !== 0) {
    throw new Error(`current batch #${batchId} is not empty and open`);
  }

  const amounts = [parseUnits("5", 6), parseUnits("7", 6)];
  const netIn = amounts[0] + amounts[1];
  const quote = await publicClient.readContract({
    address: simpleAMM,
    abi: ammAbi,
    functionName: "getAmountsOut",
    args: [netIn, [sUSD, sETH]],
  });
  const quotedNetOut = quote[quote.length - 1];
  const minOuts = buildGoldenMinOuts(quotedNetOut, amounts, 1_000n);
  validateGoldenDeployment(deployment.config, minOuts);

  const evidence: Evidence = {
    schemaVersion: 2,
    network: "sepolia",
    chainId: 11155111,
    executorSecurityVersion: 4,
    executorRuntimeCodeHash,
    deployment: { deployedAt: deployment.deployedAt, contracts: deployment.contracts },
    startedAt: new Date().toISOString(),
    signer: account.address,
    settlementVenue: deployment.config.settlementVenue ?? "unknown",
    batchId,
    quotedNetOut: quotedNetOut.toString(),
    intents: [],
  };
  save(evidence);

  let hash = await wallet.writeContract({ address: sUSD, abi: erc20Abi, functionName: "approve", args: [cSUSD, netIn] });
  await waitSuccess("sUSD approval", hash);
  evidence.approvalTx = hash;
  save(evidence);

  hash = await wallet.writeContract({ address: cSUSD, abi: cTokenAbi, functionName: "wrap", args: [account.address, netIn] });
  await waitSuccess("input wrap", hash);
  evidence.wrapTx = hash;
  save(evidence);

  const isOperator = await publicClient.readContract({ address: cSUSD, abi: cTokenAbi, functionName: "isOperator", args: [account.address, executor] });
  if (!isOperator) {
    hash = await wallet.writeContract({ address: cSUSD, abi: cTokenAbi, functionName: "setOperator", args: [executor, 4_102_444_800] });
    await waitSuccess("operator grant", hash);
    evidence.operatorTx = hash;
    save(evidence);
  }

  const { createViemHandleClient } = await import("@iexec-nox/handle");
  const handleClient = await createViemHandleClient(wallet as never, {
    gatewayUrl: "https://gateway-testnets.noxprotocol.dev",
    smartContractAddress: noxCompute,
    subgraphUrl: "https://thegraph.ethereum-sepolia-testnet.noxprotocol.io/api/subgraphs/id/9CsccKwvgYFo72zZeU4k4wj2NEBLdWhVE3EUandgmzgo",
  });
  const deadline = BigInt(Math.floor(Date.now() / 1000) + 86_400);

  for (let index = 0; index < amounts.length; index++) {
    const id = await publicClient.readContract({ address: intentBook, abi: bookAbi, functionName: "nextIntentId" });
    const encryptedAmount = await handleClient.encryptInput(amounts[index], "uint256", intentBook);
    const encryptedMinOut = await handleClient.encryptInput(minOuts[index], "uint256", intentBook);
    hash = await wallet.writeContract({
      address: intentBook,
      abi: bookAbi,
      functionName: "submitIntent",
      args: [cSUSD, cSETH, sUSD, sETH, encryptedAmount.handle, encryptedAmount.handleProof, encryptedMinOut.handle, encryptedMinOut.handleProof, deadline],
    });
    await waitSuccess(`intent #${id} submission`, hash);
    evidence.intents.push({ id: id.toString(), amountIn: amounts[index].toString(), minOut: minOuts[index].toString(), submitTx: hash });
    save(evidence);
  }

  const rows: Array<GoldenIntent & { amountHandle: Hex; minOutHandle: Hex }> = [];
  for (const record of evidence.intents) {
    const id = BigInt(record.id);
    const intent = await publicClient.readContract({ address: intentBook, abi: bookAbi, functionName: "getIntent", args: [id] });
    rows.push({
      id,
      batchId: Number(intent.batchId),
      status: Number(intent.status),
      deadline: intent.deadline,
      cTokenIn: intent.cTokenIn,
      cTokenOut: intent.cTokenOut,
      tokenIn: intent.tokenIn,
      tokenOut: intent.tokenOut,
      amountHandle: intent.amountIn,
      minOutHandle: intent.minAmountOut,
    });
  }
  validateGoldenBatch(rows, batchId, BigInt(Math.floor(Date.now() / 1000)));
  const idsBeforeSeal = await publicClient.readContract({
    address: intentBook,
    abi: bookAbi,
    functionName: "getBatchIntentIds",
    args: [batchId],
  });
  validateGoldenBatchMembership(idsBeforeSeal, rows.map((row) => row.id));

  hash = await wallet.writeContract({ address: intentBook, abi: bookAbi, functionName: "sealCurrentBatch", args: [] });
  await waitSuccess("batch seal", hash);
  const idsAfterSeal = await publicClient.readContract({
    address: intentBook,
    abi: bookAbi,
    functionName: "getBatchIntentIds",
    args: [batchId],
  });
  validateGoldenBatchMembership(idsAfterSeal, rows.map((row) => row.id));
  evidence.sealTx = hash;
  save(evidence);

  try {
    const initializationTx = await wallet.writeContract({ address: cSUSD, abi: cTokenAbi, functionName: "wrap", args: [executor, 0n] });
    await waitSuccess("executor balance initialization", initializationTx);
  } catch {
    // The executor confidential balance may already be initialized.
  }

  const minOutProofs: Hex[] = [];
  for (let index = 0; index < rows.length; index++) {
    const row = rows[index];
    const record = evidence.intents[index];

    hash = await wallet.writeContract({ address: executor, abi: executorAbi, functionName: "pullFromIntent", args: [row.id] });
    let receipt = await waitSuccess(`pull intent #${row.id}`, hash);
    const pulled = eventField(receipt.logs, "ConfidentialPulled", "amount");
    record.pullTx = hash;
    save(evidence);

    const minOutResult = await retryDecrypt(handleClient as never, row.minOutHandle, `minOut #${row.id}`);
    if (minOutResult.value !== BigInt(record.minOut)) throw new Error(`minOut mismatch for intent #${row.id}`);
    minOutProofs.push(minOutResult.proof);

    hash = await wallet.writeContract({ address: executor, abi: executorAbi, functionName: "startUnwrapHeld", args: [row.id, cSUSD, pulled] });
    receipt = await waitSuccess(`start unwrap #${row.id}`, hash);
    const requestId = eventField(receipt.logs, "UnwrapStarted", "unwrapRequestId");
    record.unwrapTx = hash;
    record.unwrapRequestId = requestId;
    save(evidence);

    const amountResult = await retryDecrypt(handleClient as never, requestId, `amount #${row.id}`);
    if (amountResult.value !== BigInt(record.amountIn)) throw new Error(`amount mismatch for intent #${row.id}`);

    hash = await wallet.writeContract({
      address: executor,
      abi: executorAbi,
      functionName: "finalizeUnwrapForIntent",
      args: [row.id, cSUSD, requestId, amountResult.proof],
    });
    receipt = await waitSuccess(`finalize unwrap #${row.id}`, hash);
    record.finalizeTx = hash;
    save(evidence);

    const finalized = await publicClient.readContract({ address: executor, abi: executorAbi, functionName: "finalizedAmountIn", args: [row.id] });
    if (finalized !== amountResult.value) throw new Error(`executor accounting mismatch for intent #${row.id}`);
  }

  hash = await wallet.writeContract({
    address: executor,
    abi: executorAbi,
    functionName: "executeBatchSamePair",
    args: [batchId, rows.map((row) => row.id), minOutProofs, BigInt(Math.floor(Date.now() / 1000) + 600)],
  });
  const executionReceipt = await waitSuccess("v4 batch execution", hash);
  const event = parseEventLogs({ abi: executorAbi, logs: executionReceipt.logs, eventName: "BatchSwapExecuted" })[0];
  if (!event) throw new Error("BatchSwapExecuted event missing");

  evidence.executeTx = hash;
  evidence.netAmountIn = event.args.netAmountIn.toString();
  evidence.netAmountOut = event.args.netAmountOut.toString();
  evidence.blockNumber = executionReceipt.blockNumber.toString();
  evidence.gasUsed = executionReceipt.gasUsed.toString();
  evidence.completedAt = new Date().toISOString();
  save(evidence);

  console.log(`SUCCESS v4 batch=${batchId} intents=${evidence.intents.map((intent) => intent.id).join(",")} netIn=${evidence.netAmountIn} netOut=${evidence.netAmountOut} tx=${hash}`);
  console.log(`evidence=${evidencePath}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
