export function PrivacyPanel() {
  return (
    <aside className="card" style={{ padding: "1.5rem" }}>
      <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "1.25rem" }}>
        <h3 style={{ margin: 0, fontSize: "1.1rem", textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--accent)" }}>Privacy Model</h3>
      </div>
      
      <div style={{ display: "grid", gap: "1.25rem" }}>
        <div style={{ display: "flex", gap: "1rem" }}>
          <div style={{ color: "var(--accent-2)" }}>✦</div>
          <div>
            <strong style={{ color: "var(--text)", display: "block", marginBottom: "0.25rem" }}>Encrypted Intents</strong>
            <span style={{ color: "var(--muted)", fontSize: "0.9rem", lineHeight: 1.5 }}>amountIn & minOut are encrypted as Nox handles while resting in the intent book.</span>
          </div>
        </div>
        
        <div style={{ display: "flex", gap: "1rem" }}>
          <div style={{ color: "var(--accent-2)" }}>✦</div>
          <div>
            <strong style={{ color: "var(--text)", display: "block", marginBottom: "0.25rem" }}>Batch Netting</strong>
            <span style={{ color: "var(--muted)", fontSize: "0.9rem", lineHeight: 1.5 }}>Intents share a seal period to allow same-pair flow to net into a single AMM touch.</span>
          </div>
        </div>

        <div style={{ display: "flex", gap: "1rem" }}>
          <div style={{ color: "var(--accent-2)" }}>✦</div>
          <div>
            <strong style={{ color: "var(--text)", display: "block", marginBottom: "0.25rem" }}>Honest Settlement</strong>
            <span style={{ color: "var(--muted)", fontSize: "0.9rem", lineHeight: 1.5 }}>Sizes are only revealed when unwrapping into the public AMM. Outputs re-shield instantly.</span>
          </div>
        </div>

        <div style={{ display: "flex", gap: "1rem" }}>
          <div style={{ color: "var(--accent-2)" }}>✦</div>
          <div>
            <strong style={{ color: "var(--text)", display: "block", marginBottom: "0.25rem" }}>Auditor ACL</strong>
            <span style={{ color: "var(--muted)", fontSize: "0.9rem", lineHeight: 1.5 }}>Institutional selective disclosure: grant view rights without spending rights.</span>
          </div>
        </div>
      </div>

      <div style={{ marginTop: "1.5rem", paddingTop: "1rem", borderTop: "1px solid var(--border)" }}>
        <p style={{ color: "var(--muted)", fontSize: "0.85rem", margin: 0 }}>
          Read the full specs: <code className="mono" style={{ color: "var(--accent-2)", background: "rgba(0, 245, 212, 0.1)", padding: "0.2rem 0.4rem", borderRadius: "4px" }}>docs/PRIVACY_MODEL.md</code>
        </p>
      </div>
    </aside>
  );
}
