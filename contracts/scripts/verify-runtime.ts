import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { Address, Hex } from "viem";
import { validateRuntimeBytecode } from "./lib/golden-batch.js";

type Deployment = {
  contracts: { executor: Address };
  config: { executorSecurityVersion: number; executorRuntimeCodeHash: Hex };
};

type Evidence = {
  executorSecurityVersion: number;
  executorRuntimeCodeHash: Hex;
  deployment: { contracts: { executor: Address } };
};

const root = join(process.cwd(), "..");
const deployment = JSON.parse(
  readFileSync(join(root, "deployments", "sepolia.json"), "utf8")
) as Deployment;
const evidence = JSON.parse(
  readFileSync(join(root, "evidence", "golden-batch", "v4", "latest.json"), "utf8")
) as Evidence;
const artifact = JSON.parse(
  readFileSync(
    join(
      process.cwd(),
      "artifacts",
      "contracts",
      "ShadowSwapExecutor.sol",
      "ShadowSwapExecutor.json"
    ),
    "utf8"
  )
) as { deployedBytecode: Hex };

if (deployment.config.executorSecurityVersion !== 4 || evidence.executorSecurityVersion !== 4) {
  throw new Error("deployment and evidence must both declare executor security version 4");
}
if (evidence.deployment.contracts.executor.toLowerCase() !== deployment.contracts.executor.toLowerCase()) {
  throw new Error("evidence executor does not match the deployment manifest");
}

const response = await fetch(
  `https://eth-sepolia.blockscout.com/api/v2/smart-contracts/${deployment.contracts.executor}`
);
if (!response.ok) throw new Error(`Blockscout request failed with HTTP ${response.status}`);
const contract = (await response.json()) as {
  is_verified: boolean;
  deployed_bytecode: Hex;
};
if (!contract.is_verified) throw new Error("executor source is not verified on Blockscout");

const runtimeHash = validateRuntimeBytecode(artifact.deployedBytecode, contract.deployed_bytecode);
if (
  deployment.config.executorRuntimeCodeHash !== runtimeHash ||
  evidence.executorRuntimeCodeHash !== runtimeHash
) {
  throw new Error(`manifest or evidence runtime hash does not match ${runtimeHash}`);
}

console.log(
  JSON.stringify(
    {
      executor: deployment.contracts.executor,
      executorSecurityVersion: 4,
      runtimeCodeHash: runtimeHash,
      blockscoutVerified: true,
      localRuntimeMatchesDeployed: true,
      evidenceBound: true,
    },
    null,
    2
  )
);
