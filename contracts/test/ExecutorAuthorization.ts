import assert from "node:assert/strict";
import { describe, it } from "node:test";
import hre from "hardhat";
import { zeroAddress } from "viem";

const EXECUTOR_ABI = [
  { type: "error", name: "NotOwner", inputs: [] },
  { type: "error", name: "AssetPairMismatch", inputs: [] },
  { type: "error", name: "UnauthorizedSolver", inputs: [] },
  { type: "error", name: "IntentNotReady", inputs: [] },
  { type: "error", name: "UnwrapAlreadyStarted", inputs: [] },
  { type: "error", name: "ReservedFunds", inputs: [] },
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
    name: "executeSoloAfterUnwrap",
    stateMutability: "nonpayable",
    inputs: [
      { name: "intentId", type: "uint256" },
      { name: "minOutDecryptProof", type: "bytes" },
      { name: "deadline", type: "uint256" },
    ],
    outputs: [{ name: "amountOut", type: "uint256" }],
  },
  {
    type: "function",
    name: "setSolver",
    stateMutability: "nonpayable",
    inputs: [
      { name: "solver", type: "address" },
      { name: "authorized", type: "bool" },
    ],
    outputs: [],
  },
] as const;

describe("ShadowSwapExecutor authorization", async function () {
  const { viem } = await hre.network.connect();
  const [owner, attacker] = await viem.getWalletClients();

  it("does not expose generic pull or unwrap entry points", async function () {
    const artifact = await hre.artifacts.readArtifact("ShadowSwapExecutor");
    const functionNames = artifact.abi
      .filter((item) => item.type === "function")
      .map((item) => item.name);

    assert.equal(functionNames.includes("pullConfidential"), false);
    assert.equal(functionNames.includes("startUnwrap"), false);
    assert.equal(functionNames.includes("finalizeUnwrap"), false);
  });

  it("rejects batch settlement from an unauthorized caller", async function () {
    const executor = await viem.deployContract("ShadowSwapExecutor", [zeroAddress, zeroAddress]);

    await assert.rejects(
      attacker.writeContract({
        address: executor.address,
        abi: EXECUTOR_ABI,
        functionName: "executeBatchSamePair",
        args: [1, [], [], 0n],
      }),
      (error: unknown) =>
        String(error).includes("UnauthorizedSolver") || String(error).includes("0x48422a61")
    );
  });

  it("lets the owner authorize a solver", async function () {
    const executor = await viem.deployContract("ShadowSwapExecutor", [zeroAddress, zeroAddress]);

    await owner.writeContract({
      address: executor.address,
      abi: EXECUTOR_ABI,
      functionName: "setSolver",
      args: [attacker.account.address, true],
    });

    await assert.rejects(
      attacker.writeContract({
        address: executor.address,
        abi: EXECUTOR_ABI,
        functionName: "executeBatchSamePair",
        args: [1, [], [], 0n],
      }),
      (error: unknown) =>
        String(error).includes("IntentNotReady") && !String(error).includes("UnauthorizedSolver")
    );
  });

  it("rejects solver allowlist changes from non-owners", async function () {
    const executor = await viem.deployContract("ShadowSwapExecutor", [zeroAddress, zeroAddress]);

    await assert.rejects(
      attacker.writeContract({
        address: executor.address,
        abi: EXECUTOR_ABI,
        functionName: "setSolver",
        args: [attacker.account.address, true],
      }),
      (error: unknown) =>
        String(error).includes("NotOwner") || String(error).includes("0x30cd7471")
    );
  });

  it("derives solo settlement tokens and recipient from the stored intent", async function () {
    const book = await viem.deployContract("MockIntentBook", []);
    await book.write.setIntent([
      1n,
      owner.account.address,
      owner.account.address,
      attacker.account.address,
      owner.account.address,
      attacker.account.address,
      7,
      2,
    ]);
    await book.write.setAssetPair([owner.account.address, owner.account.address]);
    await book.write.setAssetPair([attacker.account.address, attacker.account.address]);
    await book.write.setStatus([1n, 5]);
    const executor = await viem.deployContract("ShadowSwapExecutor", [book.address, zeroAddress]);

    await assert.rejects(
      owner.writeContract({
        address: executor.address,
        abi: EXECUTOR_ABI,
        functionName: "executeSoloAfterUnwrap",
        args: [
          1n,
          "0x",
          BigInt(Math.floor(Date.now() / 1000) + 600),
        ],
      }),
      (error: unknown) => String(error).includes("UnwrapNotFinalized")
    );
  });

  it("rejects an intent whose wrapper and underlying are not registered", async function () {
    const book = await viem.deployContract("MockIntentBook", []);
    await book.write.setIntent([
      1n,
      owner.account.address,
      owner.account.address,
      owner.account.address,
      owner.account.address,
      attacker.account.address,
      7,
      2,
    ]);
    const executor = await viem.deployContract("ShadowSwapExecutor", [book.address, zeroAddress]);

    await assert.rejects(
      owner.writeContract({
        address: executor.address,
        abi: EXECUTOR_ABI,
        functionName: "executeSoloAfterUnwrap",
        args: [1n, "0x", BigInt(Math.floor(Date.now() / 1000) + 600)],
      }),
      (error: unknown) => String(error).includes("AssetPairMismatch")
    );
  });

  it("derives batch recipients and amounts from stored intents", async function () {
    const book = await viem.deployContract("MockIntentBook", []);
    await book.write.setIntent([
      1n,
      owner.account.address,
      owner.account.address,
      attacker.account.address,
      owner.account.address,
      attacker.account.address,
      7,
      2,
    ]);
    await book.write.setAssetPair([owner.account.address, owner.account.address]);
    await book.write.setAssetPair([attacker.account.address, attacker.account.address]);
    await book.write.setStatus([1n, 5]);
    const executor = await viem.deployContract("ShadowSwapExecutor", [book.address, zeroAddress]);

    await assert.rejects(
      owner.writeContract({
        address: executor.address,
        abi: EXECUTOR_ABI,
        functionName: "executeBatchSamePair",
        args: [
          7,
          [1n],
          ["0x"],
          BigInt(Math.floor(Date.now() / 1000) + 600),
        ],
      }),
      (error: unknown) => String(error).includes("IntentMismatch")
    );
  });

  it("does not mark a batch complete when no intents were executed", async function () {
    const book = await viem.deployContract("ShadowIntentBook", [300n]);
    await book.write.setExecutor([owner.account.address]);

    await book.write.markExecuted([[], 1]);
    const batch = await book.read.batches([1]) as readonly [bigint, bigint, boolean, boolean];

    assert.equal(batch[3], false);
  });

  it("locks an intent against cancellation during settlement and supports refund completion", async function () {
    const book = await viem.deployContract("ShadowIntentBookHarness", []);
    await book.write.setExecutor([owner.account.address]);
    await book.write.seedIntent([1n, owner.account.address, 1, 1]);

    await book.write.beginSettlement([1n]);
    let intent = await book.read.getIntent([1n]) as { status: number };
    assert.equal(intent.status, 5);

    await assert.rejects(
      owner.writeContract({
        address: book.address,
        abi: [{
          type: "function",
          name: "cancelIntent",
          stateMutability: "nonpayable",
          inputs: [{ name: "intentId", type: "uint256" }],
          outputs: [],
        }],
        functionName: "cancelIntent",
        args: [1n],
      })
    );

    await book.write.markRefunded([1n]);
    intent = await book.read.getIntent([1n]) as { status: number };
    assert.equal(intent.status, 6);
  });

  it("marks a batch complete when it is sealed after all intents already finished", async function () {
    const book = await viem.deployContract("ShadowIntentBookHarness", []);
    await book.write.seedIntent([1n, owner.account.address, 1, 3]);

    await book.write.sealCurrentBatch();
    const batch = await book.read.batches([1]) as readonly [bigint, bigint, boolean, boolean];

    assert.equal(batch[2], true);
    assert.equal(batch[3], true);
  });

  it("lets the owner cancel an expired Batched intent and completes its sealed batch", async function () {
    const book = await viem.deployContract("ShadowIntentBookHarness", []);
    await book.write.seedIntent([1n, owner.account.address, 1, 1]);
    await book.write.setDeadline([1n, 0]);
    await book.write.sealCurrentBatch();

    await book.write.cancelIntent([1n]);

    const intent = await book.read.getIntent([1n]) as { status: number };
    const batch = await book.read.batches([1]) as readonly [bigint, bigint, boolean, boolean];
    assert.equal(intent.status, 4);
    assert.equal(batch[3], true);
  });

  it("rejects a second unwrap request before calling the wrapper again", async function () {
    const token = await viem.deployContract("MockERC20", ["Mock", "MOCK", 6]);
    const wrapper = await viem.deployContract("MockUnwrapWrapper", [token.address]);
    const book = await viem.deployContract("MockIntentBook", []);
    await book.write.setIntent([
      1n,
      owner.account.address,
      wrapper.address,
      wrapper.address,
      token.address,
      token.address,
      7,
      5,
    ]);
    await book.write.setAssetPair([wrapper.address, token.address]);
    const executor = await viem.deployContract("ShadowSwapExecutorHarness", [book.address, zeroAddress]);
    const amountHandle = `0x${"11".repeat(32)}` as `0x${string}`;
    const requestHandle = `0x${"22".repeat(32)}` as `0x${string}`;
    await executor.write.seedSettlement([1n, amountHandle, requestHandle]);

    await assert.rejects(
      executor.write.startUnwrapHeld([1n, wrapper.address, amountHandle]),
      (error: unknown) => String(error).includes("UnwrapAlreadyStarted")
    );
  });

  it("reconciles an unwrap finalized directly on the wrapper", async function () {
    const token = await viem.deployContract("MockERC20", ["Mock", "MOCK", 6]);
    const wrapper = await viem.deployContract("MockUnwrapWrapper", [token.address]);
    const book = await viem.deployContract("MockIntentBook", []);
    await book.write.setIntent([
      1n,
      owner.account.address,
      wrapper.address,
      wrapper.address,
      token.address,
      token.address,
      7,
      5,
    ]);
    await book.write.setAssetPair([wrapper.address, token.address]);
    const executor = await viem.deployContract("ShadowSwapExecutorHarness", [book.address, zeroAddress]);
    const amountHandle = `0x${"11".repeat(32)}` as `0x${string}`;
    const requestHandle = `0x${"22".repeat(32)}` as `0x${string}`;
    await executor.write.seedSettlement([1n, amountHandle, requestHandle]);
    await executor.write.setMockDecryptedAmount([5_000_000n]);
    await token.write.mint([executor.address, 5_000_000n]);

    await executor.write.finalizeUnwrapForIntent([
      1n,
      wrapper.address,
      requestHandle,
      "0x",
    ]);

    assert.equal(await executor.read.finalizedAmountIn([1n]), 5_000_000n);
    assert.equal(await executor.read.reservedUnderlying([token.address]), 5_000_000n);
  });

  it("only rescues underlying above the amount reserved for users", async function () {
    const token = await viem.deployContract("MockERC20", ["Mock", "MOCK", 6]);
    const book = await viem.deployContract("MockIntentBook", []);
    const executor = await viem.deployContract("ShadowSwapExecutorHarness", [book.address, zeroAddress]);
    await token.write.mint([executor.address, 7_000_000n]);
    await executor.write.seedReservedUnderlying([token.address, 5_000_000n]);

    await assert.rejects(
      executor.write.rescueToken([token.address, owner.account.address, 2_000_001n]),
      (error: unknown) => String(error).includes("ReservedFunds")
    );

    await executor.write.rescueToken([token.address, owner.account.address, 2_000_000n]);
    assert.equal(await token.read.balanceOf([executor.address]), 5_000_000n);
    assert.equal(await executor.read.reservedUnderlying([token.address]), 5_000_000n);
  });
});
