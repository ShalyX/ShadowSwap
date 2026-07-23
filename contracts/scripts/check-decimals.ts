import { createPublicClient, http } from "viem";
import { sepolia } from "viem/chains";
import { erc20Abi } from "../../frontend/src/lib/abis.ts";
import deployments from "../../frontend/src/lib/deployments.json";

const client = createPublicClient({ chain: sepolia, transport: http("https://ethereum-sepolia-rpc.publicnode.com") });

async function main() {
    const sUSD = deployments.contracts.sUSD as `0x${string}`;
    const decimals = await client.readContract({
        address: sUSD,
        abi: erc20Abi,
        functionName: "decimals"
    });
    console.log("sUSD decimals:", decimals);
}
main();
