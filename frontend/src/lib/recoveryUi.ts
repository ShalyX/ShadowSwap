export type RecoveryKind = "finalized" | "confidential";

export function effectiveRecoveryStatus(onchainStatus: number, locallyConfirmed: boolean): number {
  return locallyConfirmed ? 6 : onchainStatus;
}

export function getRecoveryPresentation(input: {
  status: number;
  kind: RecoveryKind;
  finalizedAmount: bigint;
  formattedAmount: string;
  isConnected: boolean;
  onTarget: boolean;
  isOwner: boolean;
  busy: boolean;
  locked: boolean;
  targetLabel: string;
}) {
  const recovered = input.status === 6;
  const ready = input.status === 5 && (input.kind === "confidential" || input.finalizedAmount > 0n);
  const disabled = recovered || !ready || !input.isOwner || !input.onTarget || input.locked;

  const title = recovered
    ? "Recovery complete"
    : input.kind === "finalized"
      ? "Underlying finalized"
      : "Confidential balance held";

  const detail = recovered
    ? "Funds returned to owner wallet"
    : input.kind === "finalized" && input.finalizedAmount > 0n
      ? `${input.formattedAmount} USDC ready`
      : input.kind === "confidential"
        ? "Encrypted input ready"
        : "Awaiting recovery state";

  const action = recovered
    ? "Recovered"
    : input.busy
      ? "Confirming"
      : !input.isConnected
        ? "Connect owner wallet"
        : !input.onTarget
          ? `Switch to ${input.targetLabel}`
          : !input.isOwner
            ? "Owner wallet required"
            : "Return funds";

  return { recovered, ready, disabled, title, detail, action };
}
