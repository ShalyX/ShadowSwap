import { http, createConfig } from "wagmi";
// Import injected from @wagmi/core — NOT from "wagmi/connectors".
// The connectors barrel re-exports baseAccount → @coinbase/cdp-sdk → missing @x402/* packages,
// which breaks Next.js webpack even when we only use injected().
import { injected } from "@wagmi/core";
import { TARGET_CHAIN, TARGET_CHAIN_ID } from "@/lib/chains";

const rpc =
  process.env.NEXT_PUBLIC_SEPOLIA_RPC || "https://ethereum-sepolia-rpc.publicnode.com";

export const config = createConfig({
  chains: [TARGET_CHAIN],
  connectors: [injected({ shimDisconnect: true })],
  transports: {
    [TARGET_CHAIN_ID]: http(rpc),
  },
  ssr: true,
});
