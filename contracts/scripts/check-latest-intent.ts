import { createPublicClient, http } from "viem";
import { sepolia } from "viem/chains";
import { intentBookAbi } from "../../frontend/src/lib/abis.ts";
import deployments from "../../frontend/src/lib/deployments.json";

const client = createPublicClient({ chain: sepolia, transport: http("https://ethereum-sepolia-rpc.publicnode.com") });

async function main() {
    const intentBook = deployments.contracts.intentBook as `0x${string}`;
    const nextIntentId = await client.readContract({
        address: intentBook,
        abi: intentBookAbi,
        functionName: "nextIntentId"
    });
    console.log("Next Intent ID:", nextIntentId);
}
main();
