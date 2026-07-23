import { createViemHandleClient } from "@iexec-nox/handle";
import type { WalletClient } from "viem";

/**
 * Nox Handle client — `@iexec-nox/handle@0.1.0-beta.13+` required.
 *
 * Built-in network defaults (from SDK `NETWORK_CONFIGS`):
 * - Ethereum Sepolia (11155111)
 *   gateway:  https://gateway-testnets.noxprotocol.dev
 *   compute:  0x24ef36ec5b626d7dcd09a98f3083c2758f0f77bf
 *   subgraph: https://thegraph.ethereum-sepolia-testnet.noxprotocol.io/api/subgraphs/id/9CsccKwvgYFo72zZeU4k4wj2NEBLdWhVE3EUandgmzgo
 * - Arbitrum Sepolia (421614) also built-in
 *
 * Connect the wallet to Sepolia — the SDK resolves config from chainId.
 * Env vars below are optional overrides only.
 */
export const NOX_SEPOLIA = {
  chainId: 11_155_111,
  gatewayUrl: "https://gateway-testnets.noxprotocol.dev",
  smartContractAddress: "0x24ef36ec5b626d7dcd09a98f3083c2758f0f77bf" as const,
  subgraphUrl:
    "https://thegraph.ethereum-sepolia-testnet.noxprotocol.io/api/subgraphs/id/9CsccKwvgYFo72zZeU4k4wj2NEBLdWhVE3EUandgmzgo",
} as const;

export async function getHandleClient(walletClient: WalletClient) {
  const gatewayUrl = process.env.NEXT_PUBLIC_NOX_GATEWAY_URL;
  const subgraphUrl = process.env.NEXT_PUBLIC_NOX_SUBGRAPH_URL;
  const smartContractAddress =
    process.env.NEXT_PUBLIC_NOX_COMPUTE || NOX_SEPOLIA.smartContractAddress;

  // Force manual config to bypass the `gateway()` read issue on the smart contract
  return createViemHandleClient(walletClient as never, {
    gatewayUrl: gatewayUrl || NOX_SEPOLIA.gatewayUrl,
    smartContractAddress: smartContractAddress || NOX_SEPOLIA.smartContractAddress,
    subgraphUrl: subgraphUrl || NOX_SEPOLIA.subgraphUrl,
  } as never);
}

export async function encryptAmount(
  walletClient: WalletClient,
  amount: bigint,
  applicationContract: `0x${string}`
) {
  const client = await getHandleClient(walletClient);
  return client.encryptInput(amount, "uint256", applicationContract);
}

export async function decryptHandle(walletClient: WalletClient, handle: `0x${string}`) {
  const client = await getHandleClient(walletClient);
  return client.decrypt(handle);
}

export async function publicDecryptHandle(
  walletClient: WalletClient,
  handle: `0x${string}`
) {
  const client = await getHandleClient(walletClient);
  return client.publicDecrypt(handle);
}
