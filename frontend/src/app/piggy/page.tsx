import { NetworkGuard } from "@/components/NetworkGuard";
import { NoxPlayground } from "@/components/NoxPlayground";

export default function PiggyPage() {
  return (
    <main style={{ maxWidth: 800, margin: "0 auto", padding: "2rem" }}>
      <div style={{ marginBottom: "2rem", textAlign: "center" }}>
        <h1 style={{ fontSize: "2rem", marginBottom: "0.5rem" }}>Confidential Piggy Bank</h1>
        <p className="mono" style={{ color: "var(--muted)", maxWidth: 600, margin: "0 auto" }}>
          Interact with a fully homomorphic encrypted smart contract. Encrypt values off-chain,
          deposit into the piggy bank without revealing the amount, and decrypt your balance.
        </p>
      </div>

      <NetworkGuard>
        <NoxPlayground />
      </NetworkGuard>
    </main>
  );
}
