"use client";

import { useState } from "react";
import { useAccount, usePublicClient, useWriteContract } from "wagmi";
import { Address, isAddress, zeroAddress } from "viem";
import { formatError } from "@/lib/errors";
import deployments from "@/lib/deployments.json";
import { intentBookAbi } from "@/lib/abis";
import { ShieldIcon, LockIcon, BuildingIcon, KeyIcon, ExternalLinkIcon, CheckCircleIcon } from "@/components/Icons";

export function PrivacyPanel() {
  const { address, isConnected } = useAccount();
  const publicClient = usePublicClient();
  const { writeContractAsync } = useWriteContract();

  const contracts = deployments.contracts as Record<string, string>;
  const ready =
    (deployments.config as { executorSecurityVersion?: number }).executorSecurityVersion === 4 &&
    isAddress(contracts.intentBook) &&
    contracts.intentBook !== zeroAddress;

  const [intentId, setIntentId] = useState("");
  const [auditorAddr, setAuditorAddr] = useState("");
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);

  const handleGrantAuditor = async () => {
    if (!ready) {
      setStatus("Auditor grants are unavailable until the hardened deployment is active");
      return;
    }
    if (!address || !publicClient || !isAddress(auditorAddr)) {
      setStatus("Enter a valid Ethereum address for the Auditor");
      return;
    }
    if (!/^\d+$/.test(intentId) || BigInt(intentId) <= 0n) {
      setStatus("Enter a valid intent ID you own");
      return;
    }
    setBusy(true);
    setStatus("Submitting the auditor ACL grant to ShadowIntentBook...");
    try {
      const hash = await writeContractAsync({
        address: contracts.intentBook as Address,
        abi: intentBookAbi,
        functionName: "grantAuditor",
        args: [BigInt(intentId), auditorAddr],
      });
      const receipt = await publicClient.waitForTransactionReceipt({ hash });
      if (receipt.status !== "success") throw new Error("Auditor ACL transaction reverted");
      setStatus(
        `Intent #${intentId}: granted viewer-only decrypt rights to ${auditorAddr.slice(0, 6)}…${auditorAddr.slice(-4)} · tx ${hash.slice(0, 10)}…`
      );
    } catch (e) {
      setStatus(formatError(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <aside className="auditor-instrument">
      <header>
        <span className="section-label">SELECTIVE DISCLOSURE</span>
        <h2>Open one view.<br />Not the wallet.</h2>
        <p>An intent owner can grant an address viewer-only decrypt rights. Spending authority does not move.</p>
      </header>

      <div className="privacy-register">
        <div><span>While queued</span><strong>Amount and minimum output are Nox handles.</strong></div>
        <div><span>At settlement</span><strong>Inputs become public for AMM execution.</strong></div>
        <div><span>Auditor grant</span><strong>Read-only access to one owned intent.</strong></div>
      </div>

      <div className="auditor-form">
        <label><span>Intent ID you own</span><input type="number" min="1" step="1" placeholder="0" value={intentId} onChange={(event) => setIntentId(event.target.value)} /></label>
        <label><span>Auditor address</span><input type="text" placeholder="0x…" value={auditorAddr} onChange={(event) => setAuditorAddr(event.target.value)} /></label>
        <button disabled={!ready || !isConnected || busy || !intentId || !auditorAddr} onClick={handleGrantAuditor}>{busy ? "Registering access" : "Grant read-only access"}</button>
        {status && <p className="instrument-status">{status}</p>}
      </div>

      <a className="privacy-spec" href="https://github.com/ShalyX/ShadowSwap/blob/master/docs/PRIVACY_MODEL.md" target="_blank" rel="noreferrer">Read the privacy model <ExternalLinkIcon size={12} /></a>
    </aside>
  );
}
