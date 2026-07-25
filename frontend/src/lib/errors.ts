export function formatError(e: unknown): string {
  if (!e) return "Error: An unknown error occurred";
  const msg = typeof e === "string" ? e : (e as Error).message || String(e);

  if (
    msg.includes("User rejected") ||
    msg.includes("User denied") ||
    msg.includes("user rejected") ||
    msg.includes("ACTION_REJECTED")
  ) {
    return "Error: Transaction rejected in wallet.";
  }

  if (msg.includes("insufficient funds")) {
    return "Error: Insufficient funds for gas or transaction.";
  }

  // Extract short message if Viem HttpRequestError or ContractFunctionExecutionError
  const matchShort = msg.match(/Short Message:\s*([^\n]+)/i);
  if (matchShort && matchShort[1]) {
    return `Error: ${matchShort[1].trim()}`;
  }

  // Fallback: take only the first line and cap length so it never overflows or breaks UI layout
  const firstLine = msg.split("\n")[0].replace(/^Error:\s*/i, "");
  const trimmed = firstLine.length > 120 ? firstLine.slice(0, 117) + "..." : firstLine;
  return `Error: ${trimmed}`;
}
