import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildGoldenMinOuts,
  validateGoldenBatch,
  validateGoldenBatchMembership,
  validateGoldenDeployment,
  validateRuntimeBytecode,
} from "../scripts/lib/golden-batch.js";

const pair = {
  cTokenIn: "0x0000000000000000000000000000000000000001",
  cTokenOut: "0x0000000000000000000000000000000000000002",
  tokenIn: "0x0000000000000000000000000000000000000003",
  tokenOut: "0x0000000000000000000000000000000000000004",
} as const;

function intent(id: bigint, overrides: Partial<Parameters<typeof validateGoldenBatch>[0][number]> = {}) {
  return {
    id,
    batchId: 15,
    status: 1,
    deadline: 2_000n,
    ...pair,
    ...overrides,
  };
}

describe("golden batch safety gate", () => {
  it("accepts exactly two fresh same-pair intents in the target batch", () => {
    const result = validateGoldenBatch([intent(16n), intent(17n)], 15, 1_000n);
    assert.deepEqual(result.map((row) => row.id), [16n, 17n]);
  });

  it("rejects expired intents before any settlement transaction", () => {
    assert.throws(
      () => validateGoldenBatch([intent(16n, { deadline: 999n }), intent(17n)], 15, 1_000n),
      /expired/
    );
  });

  it("rejects intents from another batch", () => {
    assert.throws(
      () => validateGoldenBatch([intent(16n), intent(17n, { batchId: 14 })], 15, 1_000n),
      /target batch/
    );
  });

  it("rejects mixed token pairs", () => {
    assert.throws(
      () => validateGoldenBatch([intent(16n), intent(17n, { tokenOut: "0x0000000000000000000000000000000000000005" })], 15, 1_000n),
      /same-pair/
    );
  });

  it("requires the hardened deployment and positive minimum outputs", () => {
    assert.throws(
      () => validateGoldenDeployment({ executorSecurityVersion: 1 }, [1n, 1n]),
      /security version 4/
    );
    assert.throws(
      () => validateGoldenDeployment({ executorSecurityVersion: 4 }, [1n, 0n]),
      /positive minOut/
    );
    assert.doesNotThrow(() =>
      validateGoldenDeployment({ executorSecurityVersion: 4 }, [1n, 2n])
    );
  });

  it("derives positive pro-rata min-outs below the quoted batch output", () => {
    const minOuts = buildGoldenMinOuts(12_000n, [5n, 7n], 1_000n);
    assert.deepEqual(minOuts, [4_500n, 6_300n]);
    assert.equal(minOuts[0] + minOuts[1], 10_800n);
  });

  it("rejects a third-party intent added before sealing", () => {
    assert.throws(
      () => validateGoldenBatchMembership([1n, 2n, 3n], [1n, 2n]),
      /membership changed/
    );
    assert.doesNotThrow(() => validateGoldenBatchMembership([1n, 2n], [1n, 2n]));
  });

  it("binds evidence to the locally compiled executor runtime", () => {
    const code = "0x6001600055" as const;
    const hash = validateRuntimeBytecode(code, code);
    assert.match(hash, /^0x[0-9a-f]{64}$/);
    assert.throws(
      () => validateRuntimeBytecode(code, "0x6002600055"),
      /runtime bytecode mismatch/
    );
  });
});
