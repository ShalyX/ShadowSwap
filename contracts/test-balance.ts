import { createPublicClient, http, parseAbi, getAddress } from "viem";
import { sepolia } from "viem/chains";

const client = createPublicClient({ chain: sepolia, transport: http("https://rpc.sepolia.org") });
const user = getAddress("0x1DcB045123730e606A88380BCe534332F50332d2");
const cSUSD = getAddress("0x714003105651171891De0EBE24D396ebF2E8FF47");
const executor = getAddress("0x018b32d16C3740D2F338cbBE2a926a8dceD87bC8");

async function main() {
  const isOperator = await client.readContract({
    address: cSUSD,
    abi: parseAbi(["function isOperator(address,address) view returns (bool)"]),
    functionName: "isOperator",
    args: [user, executor]
  });
  console.log("Is executor operator for user?", isOperator);

  const balanceHandle = await client.readContract({
    address: cSUSD,
    abi: parseAbi(["function balanceOf(address) view returns (uint256)"]),
    functionName: "balanceOf",
    args: [user]
  });
  console.log("User's encrypted balance handle on c-sUSD:", balanceHandle);
}
main();
