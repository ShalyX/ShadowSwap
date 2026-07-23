import { sepolia } from "wagmi/chains";

/** Hackathon target — Nox Handle SDK has built-in Sepolia defaults. */
export const TARGET_CHAIN = sepolia;
export const TARGET_CHAIN_ID = sepolia.id; // 11155111

export const TARGET_CHAIN_LABEL = "Ethereum Sepolia";

/** EIP-3085 params for wallets that need wallet_addEthereumChain */
export const SEPOLIA_ADD_CHAIN_PARAMS = {
  chainId: `0x${TARGET_CHAIN_ID.toString(16)}`,
  chainName: TARGET_CHAIN_LABEL,
  nativeCurrency: {
    name: "Sepolia Ether",
    symbol: "ETH",
    decimals: 18,
  },
  rpcUrls: [
    process.env.NEXT_PUBLIC_SEPOLIA_RPC || "https://ethereum-sepolia-rpc.publicnode.com",
  ],
  blockExplorerUrls: ["https://sepolia.etherscan.io"],
} as const;

export function isTargetChain(chainId: number | undefined | null): boolean {
  return chainId === TARGET_CHAIN_ID;
}
