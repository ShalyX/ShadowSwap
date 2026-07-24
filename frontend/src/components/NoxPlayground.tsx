"use client";

import { useState } from "react";
import { useAccount, useWalletClient } from "wagmi";
import { isAddress } from "viem";
import { encryptAmount, decryptHandle } from "@/lib/nox";

export function NoxPlayground() {
  const { address, isConnected } = useAccount();
  const { data: walletClient } = useWalletClient();

  // Encrypt State
  const [encContractAddress, setEncContractAddress] = useState("");
  const [encValue, setEncValue] = useState("");
  const [encryptBusy, setEncryptBusy] = useState(false);
  const [encResult, setEncResult] = useState<{ handle: string; proof: string } | null>(null);
  const [encError, setEncError] = useState("");

  // Decrypt State
  const [decHandle, setDecHandle] = useState("");
  const [decryptBusy, setDecryptBusy] = useState(false);
  const [decResult, setDecResult] = useState<string | null>(null);
  const [decError, setDecError] = useState("");

  const handleEncrypt = async () => {
    if (!walletClient || !isConnected) return;
    setEncError("");
    setEncResult(null);
    setEncryptBusy(true);

    try {
      if (!isAddress(encContractAddress)) {
        throw new Error("Invalid contract address");
      }
      const valBig = BigInt(encValue);
      const res = await encryptAmount(walletClient, valBig, encContractAddress);
      
      setEncResult({
        handle: res.handle,
        proof: res.handleProof,
      });
    } catch (e: any) {
      console.error(e);
      setEncError(e.message || String(e));
    } finally {
      setEncryptBusy(false);
    }
  };

  const handleDecrypt = async () => {
    if (!walletClient || !isConnected) return;
    setDecError("");
    setDecResult(null);
    setDecryptBusy(true);

    try {
      if (!decHandle.startsWith("0x")) {
        throw new Error("Invalid handle format (must start with 0x)");
      }
      
      const res = await decryptHandle(walletClient, decHandle as `0x${string}`);
      setDecResult(res.value.toString());
    } catch (e: any) {
      console.error(e);
      setDecError(e.message || String(e));
    } finally {
      setDecryptBusy(false);
    }
  };

  return (
    <div className="card" style={{ padding: "2rem" }}>
      
      <div style={{ marginBottom: "2rem", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <h2 style={{ margin: 0, color: "var(--accent)" }}>Nox SDK Playground</h2>
        <span className="badge">{isConnected ? `Connected: ${address?.slice(0,6)}...` : "Not Connected"}</span>
      </div>

      <div className="grid-2">
        {/* Encrypt Widget */}
        <div style={{ border: "1px solid var(--border)", padding: "1.5rem", borderRadius: "8px" }}>
          <h3 style={{ margin: "0 0 1rem 0" }}>Encrypt</h3>
          
          <div style={{ display: "grid", gap: "1rem", marginBottom: "1rem" }}>
            <div>
              <label className="label">Contract address (0x...)</label>
              <input
                type="text"
                className="input mono"
                placeholder="0x..."
                value={encContractAddress}
                onChange={(e) => setEncContractAddress(e.target.value)}
              />
            </div>
            
            <div>
              <label className="label">Value (uint256)</label>
              <input
                type="number"
                className="input mono"
                placeholder="0"
                value={encValue}
                onChange={(e) => setEncValue(e.target.value)}
              />
            </div>
          </div>

          <button 
            className="btn btn-primary" 
            style={{ width: "100%", marginBottom: "1rem" }} 
            onClick={handleEncrypt}
            disabled={encryptBusy || !isConnected || !encContractAddress || !encValue}
          >
            {encryptBusy ? "Encrypting..." : "Encrypt"}
          </button>

          {encError && (
            <div className="mono" style={{ padding: "0.5rem", color: "var(--danger)", fontSize: "0.85rem", background: "var(--bg)", borderRadius: "4px" }}>
              Error: {encError}
            </div>
          )}

          {encResult && (
            <div style={{ padding: "1rem", background: "var(--bg)", borderRadius: "8px", border: "1px solid var(--border)", wordBreak: "break-all" }}>
              <div className="mono" style={{ fontSize: "0.85rem", marginBottom: "0.5rem" }}>
                <strong>Handle:</strong><br/>
                <span style={{ color: "var(--muted)" }}>{encResult.handle}</span>
              </div>
              <div className="mono" style={{ fontSize: "0.85rem" }}>
                <strong>Handle Proof:</strong><br/>
                <span style={{ color: "var(--muted)", maxHeight: "100px", overflow: "auto", display: "block" }}>{encResult.proof}</span>
              </div>
            </div>
          )}
        </div>

        {/* Decrypt Widget */}
        <div style={{ border: "1px solid var(--border)", padding: "1.5rem", borderRadius: "8px" }}>
          <h3 style={{ margin: "0 0 1rem 0" }}>Decrypt</h3>
          
          <div style={{ display: "grid", gap: "1rem", marginBottom: "1rem" }}>
            <div>
              <label className="label">Handle (0x...)</label>
              <input
                type="text"
                className="input mono"
                placeholder="0x..."
                value={decHandle}
                onChange={(e) => setDecHandle(e.target.value)}
              />
            </div>
          </div>

          <button 
            className="btn btn-primary" 
            style={{ width: "100%", marginBottom: "1rem" }} 
            onClick={handleDecrypt}
            disabled={decryptBusy || !isConnected || !decHandle}
          >
            {decryptBusy ? "Decrypting..." : "Decrypt"}
          </button>

          {decError && (
            <div className="mono" style={{ padding: "0.5rem", color: "var(--danger)", fontSize: "0.85rem", background: "var(--bg)", borderRadius: "4px" }}>
              Error: {decError}
            </div>
          )}

          {decResult !== null && (
            <div style={{ padding: "1rem", background: "var(--bg)", borderRadius: "8px", border: "1px solid var(--border)" }}>
              <div className="mono" style={{ fontSize: "0.9rem" }}>
                <strong>Decrypted Value:</strong><br/>
                <span style={{ color: "var(--accent)", fontSize: "1.5rem", fontWeight: "bold" }}>{decResult}</span>
              </div>
            </div>
          )}
        </div>

      </div>
    </div>
  );
}
