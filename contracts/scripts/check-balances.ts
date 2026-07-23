import { createPublicClient, http } from "viem";
import { sepolia } from "viem/chains";
import { erc20Abi, intentBookAbi } from "../frontend/src/lib/abis";
import deployments from "../frontend/src/lib/deployments.json";

const client = createPublicClient({ chain: sepolia, transport: http("https://ethereum-sepolia-rpc.publicnode.com") });

async function main() {
    const user = "0x1DcB045123730e606A88380BCe534332F50332d2" as const;
    const tokenIn = deployments.contracts.sUSD as `0x${string}`;

    const sUSDBal = await client.readContract({
        address: tokenIn,
        abi: erc20Abi,
        functionName: "balanceOf",
        args: [user]
    });
    console.log("sUSD balance:", sUSDBal);

    const intentBook = deployments.contracts.intentBook as `0x${string}`;
    const intent = await client.readContract({
        address: intentBook,
        abi: intentBookAbi,
        functionName: "getIntent",
        args: [4n]
    }) as any;
    
    console.log("Intent 4 amountIn handle:", intent.amountIn);
}
main();
