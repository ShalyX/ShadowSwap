import { createPublicClient, http } from "viem";
import { sepolia } from "viem/chains";
import { erc7984Abi } from "../frontend/src/lib/abis";

const client = createPublicClient({ chain: sepolia, transport: http() });

async function main() {
    const isOp = await client.readContract({
        address: "0x452f01f61957b49002010e3e0c1eda97492144a8",
        abi: [{
            type: "function",
            name: "isOperator",
            stateMutability: "view",
            inputs: [{ name: "holder", type: "address" }, { name: "spender", type: "address" }],
            outputs: [{ type: "bool" }]
        }],
        functionName: "isOperator",
        args: ["0x1DcB045123730e606A88380BCe534332F50332d2", "0x607c7cedd4ac5b88e15048dab7c42c5b994b848d"]
    });
    console.log("isOperator:", isOp);
}
main();
