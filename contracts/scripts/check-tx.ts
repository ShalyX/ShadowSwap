import { createPublicClient, http } from "viem";
import { sepolia } from "viem/chains";

const client = createPublicClient({ chain: sepolia, transport: http() });

async function main() {
    // get block number
    const blockNumber = await client.getBlockNumber();
    console.log("Current block:", blockNumber);
}
main();
