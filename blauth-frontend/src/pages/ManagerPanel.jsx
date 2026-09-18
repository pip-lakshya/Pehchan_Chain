import { useState, useCallback } from "react";
import { Link, useNavigate } from "react-router-dom";
import { transferAsset, getAssetOwner } from "../services/api";

const WALLET_ID_KEY = "blauthWalletId";

// ─── DID validation ──────────────────────────────────────────────────────────
// Accepts any non-empty string starting with "did:" or a plain wallet-id that
// the backend will convert to did:pehchan:<id>.
function isValidDID(value) {
  if (!value || typeof value !== "string") return false;
  return value.trim().length > 3;
}

// ─── Transaction status badge ─────────────────────────────────────────────────
function TxStatusPill({ status }) {
  const map = {
    idle: null,
    submitting: (
      <span className="blauth-manager-status-pill is-pending">⏳ Submitting…</span>
    ),
    success: (
      <span className="blauth-manager-status-pill is-success">✔ Confirmed</span>
    ),
    error: (
      <span className="blauth-manager-status-pill is-error">✖ Failed</span>
    ),
  };
  return map[status] || null;
}

// ─── Manager Panel ────────────────────────────────────────────────────────────
function ManagerPanel() {
  const navigate = useNavigate();

  // Derive requester DID from the stored wallet session.
  const [walletId] = useState(() => localStorage.getItem(WALLET_ID_KEY));
  const managerDID = walletId
    ? walletId.startsWith("did:") ? walletId : `did:pehchan:${walletId}`
    : "did:pehchan:manager_workspace";

  const [activeTab, setActiveTab] = useState("assign"); // "assign" | "lookup" | "txlog"

  // ── Tab 1: Assign an existing asset ────────────────────────────────────────
  const [userDID, setUserDID]           = useState("");
  const [tokenId, setTokenId]           = useState("");
  const [recipientAddr, setRecipientAddr] = useState("");

  const [assignStatus, setAssignStatus] = useState("idle");
  const [assignResult, setAssignResult] = useState(null);
  const [assignError,  setAssignError]  = useState("");

  // ── Tab 2: Look up a token's current owner ──────────────────────────────────
  const [lookupTokenId,   setLookupTokenId]   = useState("");
  const [lookupResult,    setLookupResult]    = useState(null);
  const [lookupError,     setLookupError]     = useState("");
  const [lookupLoading,   setLookupLoading]   = useState(false);

  // ── Session transaction log ─────────────────────────────────────────────────
  const [txLogs, setTxLogs] = useState([]);

  function addTxLog(details) {
    setTxLogs((prev) => [
      { id: Date.now(), timestamp: new Date().toLocaleTimeString(), ...details },
      ...prev,
    ]);
  }

  // ─── Handle Asset Assignment ──────────────────────────────────────────────
  async function handleAssignSubmit(e) {
    e.preventDefault();
    setAssignError("");
    setAssignResult(null);

    if (!isValidDID(userDID)) {
      setAssignError("Target DID is required and must be a valid DID string (e.g. did:pehchan:…).");
      return;
    }
    if (!tokenId.trim()) {
      setAssignError("Token ID is required.");
      return;
    }
    if (!recipientAddr.trim() || !recipientAddr.trim().startsWith("0x")) {
      setAssignError("Recipient wallet address must be a valid 0x… Ethereum address.");
      return;
    }

    setAssignStatus("submitting");

    try {
      const res = await transferAsset({
        requesterDID:  managerDID,
        tokenId:       tokenId.trim(),
        recipient:     recipientAddr.trim(),
        targetDID:     userDID.trim(),
      });

      setAssignResult(res);
      setAssignStatus("success");
      addTxLog({
        type:            "ASSIGN_NFT",
        tokenId:         res.tokenId,
        targetDID:       res.targetDID,
        transactionHash: res.transactionHash,
        blockNumber:     res.blockNumber,
      });
    } catch (err) {
      setAssignError(err.message || "Failed to assign asset. Check the token ID and DID.");
      setAssignStatus("error");
    }
  }

  // ─── Handle Token Lookup ──────────────────────────────────────────────────
  const handleLookup = useCallback(
    async (e) => {
      e.preventDefault();
      setLookupError("");
      setLookupResult(null);

      if (!lookupTokenId.trim()) {
        setLookupError("Token ID is required.");
        return;
      }

      setLookupLoading(true);
      try {
        const res = await getAssetOwner(lookupTokenId.trim());
        setLookupResult(res);
      } catch (err) {
        setLookupError(err.message || "Asset not found or blockchain unavailable.");
      } finally {
        setLookupLoading(false);
      }
    },
    [lookupTokenId],
  );

  // ─────────────────────────────────────────────────────────────────────────
  return (
    <main className="blauth-consent">
      {/* Secondary nav — mirrors Admin Console style */}
      <nav className="blauth-register-nav" aria-label="Manager navigation">
        <span className="blauth-nav-status">
          <i /> Manager Panel
        </span>
      </nav>

      <section className="blauth-consent-shell">
        <header className="blauth-consent-intro">
          <p className="blauth-eyebrow">
            <span /> Bharat Electronics Limited (BEL)
          </p>
          <h1>
            PehchanChain<br />
            <em>Manager Panel.</em>
          </h1>
          <p>
            Search for an existing asset, select a target user DID, assign the asset
            on-chain, and track transaction status — all without minting new tokens.
          </p>
        </header>

        <article className="blauth-consent-card">
          <header className="blauth-request-header">
            <div>
              <p>Asset Management</p>
              <h2>Manager Workspace</h2>
            </div>
            {/* Role badge — visual only; enforcement is on backend + blockchain */}
            <span className="blauth-admin-badge blauth-manager-role-badge">
              MANAGER ACCESS
            </span>
          </header>

          {/* ── Session DID banner ─────────────────────────────────────────── */}
          <div className="blauth-manager-did-strip">
            <span className="blauth-manager-did-label">Your DID</span>
            <code className="blauth-manager-did-value">{managerDID}</code>
          </div>

          {/* ── Tabs ────────────────────────────────────────────────────────── */}
          <div className="blauth-admin-tabs" role="tablist">
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === "assign"}
              className={activeTab === "assign" ? "is-active" : ""}
              onClick={() => setActiveTab("assign")}
            >
              Assign Asset
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === "lookup"}
              className={activeTab === "lookup" ? "is-active" : ""}
              onClick={() => setActiveTab("lookup")}
            >
              Token Lookup
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === "txlog"}
              className={activeTab === "txlog" ? "is-active" : ""}
              onClick={() => setActiveTab("txlog")}
            >
              Tx Log
              {txLogs.length > 0 && (
                <span className="blauth-manager-tx-count">{txLogs.length}</span>
              )}
            </button>
          </div>

          {/* ══════════════════════════════════════════════════════════════════
              TAB 1 — ASSIGN AN EXISTING ASSET
          ══════════════════════════════════════════════════════════════════ */}
          {activeTab === "assign" && (
            <div className="blauth-admin-tab-content">
              <section className="blauth-admin-card-section">
                <div className="blauth-admin-section-header">
                  <div>
                    <h3>Assign / Transfer Existing Asset</h3>
                    <span className="blauth-admin-badge blauth-admin-badge-blue">
                      MANAGER &amp; ADMIN
                    </span>
                  </div>
                  <button
                    type="button"
                    className="blauth-did-copy-btn"
                    onClick={() => {
                      setUserDID("did:pehchan:wallet_demo_student");
                      setTokenId("1");
                      setRecipientAddr("0x3333333333333333333333333333333333333333");
                    }}
                    style={{ padding: "6px 12px", fontSize: "11px" }}
                  >
                    ⚡ Auto-Fill Demo Assignment
                  </button>
                  <p className="blauth-admin-help-text">
                    <strong>ASSIGN</strong> transfers an already-minted token to a
                    target user's DID and wallet address.&ensp;
                    <em>
                      Minting new asset types is an Admin-only operation and is not
                      available here.
                    </em>
                  </p>
                </div>

                {/* ── No-mint notice ──────────────────────────────────────── */}
                <div className="blauth-manager-nomint-notice" role="note">
                  <span className="blauth-manager-nomint-icon">🔒</span>
                  <p>
                    <strong>Mint is disabled for Managers.</strong> This restriction is
                    enforced by the{" "}
                    <code className="blauth-manager-code">PehchanAccessControl</code>{" "}
                    smart contract and the backend — not only the UI. Any attempt to
                    call <code className="blauth-manager-code">/asset/mint</code> with a
                    Manager DID will be rejected with <strong>HTTP 403</strong>.
                  </p>
                </div>

                <form
                  onSubmit={handleAssignSubmit}
                  className="blauth-form-grid"
                  noValidate
                >
                  {/* Step 1 — Select target user DID */}
                  <div className="blauth-input-group is-wide">
                    <label htmlFor="mgr-user-did">
                      Step 1 — Target User DID
                      <span className="blauth-manager-step-hint">
                        Enter the DID of the user receiving the asset
                      </span>
                    </label>
                    <input
                      id="mgr-user-did"
                      type="text"
                      value={userDID}
                      onChange={(e) => setUserDID(e.target.value)}
                      placeholder="did:pehchan:…"
                      autoComplete="off"
                      spellCheck={false}
                      aria-describedby="mgr-user-did-hint"
                      required
                    />
                    <small id="mgr-user-did-hint" className="blauth-manager-field-hint">
                      Example: <code>did:pehchan:student_001</code>
                    </small>
                  </div>

                  {/* Step 2 — Token ID to assign */}
                  <div className="blauth-input-group">
                    <label htmlFor="mgr-token-id">
                      Step 2 — Token ID
                      <span className="blauth-manager-step-hint">
                        The ID of an Admin-minted asset
                      </span>
                    </label>
                    <input
                      id="mgr-token-id"
                      type="text"
                      value={tokenId}
                      onChange={(e) => setTokenId(e.target.value)}
                      placeholder="e.g. 1, 2, 42"
                      inputMode="numeric"
                      required
                    />
                  </div>

                  {/* Step 3 — Recipient wallet address */}
                  <div className="blauth-input-group">
                    <label htmlFor="mgr-recipient">
                      Step 3 — Recipient Wallet Address
                      <span className="blauth-manager-step-hint">
                        Ethereum address that will hold the token
                      </span>
                    </label>
                    <input
                      id="mgr-recipient"
                      type="text"
                      value={recipientAddr}
                      onChange={(e) => setRecipientAddr(e.target.value)}
                      placeholder="0x…"
                      autoComplete="off"
                      spellCheck={false}
                      required
                    />
                  </div>

                  {/* Submit row */}
                  <div className="blauth-input-group is-wide blauth-manager-submit-row">
                    <button
                      type="submit"
                      className="blauth-continue-button"
                      disabled={assignStatus === "submitting"}
                    >
                      {assignStatus === "submitting"
                        ? "Submitting on-chain…"
                        : "Assign Asset to User →"}
                    </button>
                    <TxStatusPill status={assignStatus} />
                  </div>
                </form>

                {assignError && (
                  <p className="blauth-field-error" role="alert">
                    {assignError}
                  </p>
                )}

                {assignResult && (
                  <div className="blauth-admin-success-box blauth-manager-result-box">
                    <h4>✔ Asset Successfully Assigned</h4>
                    <div className="blauth-manager-result-grid">
                      <div className="blauth-manager-result-row">
                        <span>Token ID</span>
                        <strong>#{assignResult.tokenId}</strong>
                      </div>
                      <div className="blauth-manager-result-row">
                        <span>New Owner DID</span>
                        <code>{assignResult.targetDID}</code>
                      </div>
                      {assignResult.transactionHash && (
                        <div className="blauth-manager-result-row">
                          <span>Tx Hash</span>
                          <code className="blauth-manager-txhash">
                            {assignResult.transactionHash}
                          </code>
                        </div>
                      )}
                      {assignResult.blockNumber && (
                        <div className="blauth-manager-result-row">
                          <span>Block</span>
                          <strong>#{assignResult.blockNumber}</strong>
                        </div>
                      )}
                    </div>
                    <p className="blauth-manager-wallet-note">
                      The asset is now visible in the user's Wallet under{" "}
                      <strong>Digital Assets</strong>.
                    </p>
                  </div>
                )}
              </section>
            </div>
          )}

          {/* ══════════════════════════════════════════════════════════════════
              TAB 2 — TOKEN LOOKUP
          ══════════════════════════════════════════════════════════════════ */}
          {activeTab === "lookup" && (
            <div className="blauth-admin-tab-content">
              <section className="blauth-admin-card-section">
                <div className="blauth-admin-section-header">
                  <h3>Token Ownership Lookup</h3>
                  <p className="blauth-admin-help-text">
                    Query the{" "}
                    <code className="blauth-manager-code">PehchanAssetRegistry</code>{" "}
                    contract to confirm who currently owns a specific token.
                  </p>
                </div>

                <form onSubmit={handleLookup} className="blauth-form-grid" noValidate>
                  <div className="blauth-input-group is-wide">
                    <label htmlFor="mgr-lookup-token">Token ID</label>
                    <input
                      id="mgr-lookup-token"
                      type="text"
                      value={lookupTokenId}
                      onChange={(e) => setLookupTokenId(e.target.value)}
                      placeholder="e.g. 1"
                      inputMode="numeric"
                      required
                    />
                  </div>
                  <div className="blauth-input-group is-wide">
                    <button
                      type="submit"
                      className="blauth-continue-button"
                      disabled={lookupLoading}
                    >
                      {lookupLoading ? "Querying blockchain…" : "Look Up Token →"}
                    </button>
                  </div>
                </form>

                {lookupError && (
                  <p className="blauth-field-error" role="alert">
                    {lookupError}
                  </p>
                )}

                {lookupResult && (
                  <div className="blauth-manager-lookup-result">
                    <h4>Token #{lookupResult.tokenId}</h4>
                    <div className="blauth-manager-result-grid">
                      <div className="blauth-manager-result-row">
                        <span>Owner Address</span>
                        <code>{lookupResult.ownerAddress}</code>
                      </div>
                      <div className="blauth-manager-result-row">
                        <span>Owner DID</span>
                        <code>{lookupResult.targetDID || "—"}</code>
                      </div>
                    </div>
                  </div>
                )}
              </section>
            </div>
          )}

          {/* ══════════════════════════════════════════════════════════════════
              TAB 3 — SESSION TRANSACTION LOG
          ══════════════════════════════════════════════════════════════════ */}
          {activeTab === "txlog" && (
            <div className="blauth-admin-tab-content">
              <section className="blauth-admin-card-section">
                <h3>Transaction Log (This Session)</h3>
                {txLogs.length === 0 ? (
                  <p className="blauth-admin-help-text" style={{ marginTop: "14px" }}>
                    No transactions submitted in this session yet. Assign an asset to
                    see its transaction details here.
                  </p>
                ) : (
                  <div className="blauth-admin-tx-table">
                    {txLogs.map((log) => (
                      <div className="blauth-admin-tx-row" key={log.id}>
                        <div>
                          <span className="blauth-asset-category-pill">{log.type}</span>
                          <strong>Token #{log.tokenId} → {log.targetDID}</strong>
                        </div>
                        <div>
                          <code>{log.transactionHash}</code>
                          <small>
                            Block #{log.blockNumber} &bull; {log.timestamp}
                          </small>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </section>
            </div>
          )}

          <div className="blauth-consent-actions" style={{ marginTop: "30px" }}>
            <button className="blauth-back-button" type="button" onClick={() => navigate(-1)}>
              Back
            </button>
          </div>
        </article>
      </section>
    </main>
  );
}

export default ManagerPanel;
