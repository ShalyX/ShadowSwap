import { createPublicClient, http } from "viem";
import { sepolia } from "viem/chains";
import { intentBookAbi } from "../frontend/src/lib/abis";

const client = createPublicClient({ chain: sepolia, transport: http() });

async function main() {
    const res = await client.readContract({
        address: "0x4d357b92698cf6868e8fb04bad22797f2031764e",
        abi: intentBookAbi,
        functionName: "intents",
        args: [3n]
    });
    console.log(res);
}
main();
