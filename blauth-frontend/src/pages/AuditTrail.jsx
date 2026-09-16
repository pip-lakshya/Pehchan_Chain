import { useEffect, useState, useCallback } from "react";
import { Link } from "react-router-dom";
import { getAuditLogsForDID } from "../services/api";

const WALLET_ID_KEY = "blauthWalletId";

function formatTimestamp(ts) {
  if (!ts) return "N/A";
  const date = new Date(ts);
  return Number.isNaN(date.getTime()) ? String(ts) : date.toLocaleString();
}

/** Determines if an event is an authoritative on-chain blockchain event */
function isOnChainEvent(item) {
  const chainTypes = ["IDENTITY_CREATED", "ASSET_MINTED", "ASSET_ASSIGNED", "ROLE_ASSIGNED", "ROLE_REVOKED"];
  return chainTypes.includes(item.eventType) && Boolean(item.transactionHash);
}

/** Human-readable title mapping */
function getEventTitle(eventType) {
  const map = {
    IDENTITY_CREATED: "Identity Wallet Registered",
    ROLE_ASSIGNED: "Smart-Contract Role Granted",
    ROLE_REVOKED: "Smart-Contract Role Revoked",
    ASSET_MINTED: "Digital Asset Minted (NFT)",
    ASSET_ASSIGNED: "Digital Asset Transferred / Assigned",
    VERIFICATION_REQUESTED: "Verification Request Received",
    ACCESS_GRANTED: "Selective Disclosure Approved",
    ACCESS_DENIED: "Selective Disclosure Denied",
  };
  return map[eventType] || eventType;
}

/** Icon mapping */
function getEventIcon(eventType) {
  const map = {
    IDENTITY_CREATED: "🪪",
    ROLE_ASSIGNED: "👑",
    ROLE_REVOKED: "🚫",
    ASSET_MINTED: "🪙",
    ASSET_ASSIGNED: "📦",
    VERIFICATION_REQUESTED: "🔔",
    ACCESS_GRANTED: "✔",
    ACCESS_DENIED: "✖",
  };
  return map[eventType] || "📋";
}

function AuditTrail() {
  const [walletId] = useState(() => localStorage.getItem(WALLET_ID_KEY));
  const defaultDID = walletId
    ? walletId.startsWith("did:") ? walletId : `did:pehchan:${walletId}`
    : "did:pehchan:student_001";

  const [queryDID, setQueryDID] = useState(defaultDID);
  const [activeDID, setActiveDID] = useState(defaultDID);
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [filterMode, setFilterMode] = useState("all"); // "all" | "onchain" | "offchain"

  const fetchLogs = useCallback(async (didToFetch) => {
    setLoading(true);
    setError("");
    try {
      const data = await getAuditLogsForDID(didToFetch);
      setLogs(data || []);
    } catch (err) {
      setError(err.message || "Could not retrieve audit trail for the requested DID.");
      setLogs([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchLogs(activeDID);
  }, [activeDID, fetchLogs]);

  function handleSearch(e) {
    e.preventDefault();
    if (!queryDID.trim()) return;
    const formatted = queryDID.trim().startsWith("did:")
      ? queryDID.trim()
      : `did:pehchan:${queryDID.trim()}`;
    setActiveDID(formatted);
  }

  // Filter logs based on selection
  const filteredLogs = logs.filter((item) => {
    if (filterMode === "onchain") return isOnChainEvent(item);
    if (filterMode === "offchain") return !isOnChainEvent(item);
    return true;
  });

  const onChainCount = logs.filter(isOnChainEvent).length;
  const offChainCount = logs.length - onChainCount;

  return (
    <main className="blauth-history">
      <div className="blauth-register-orb blauth-history-orb-one" />
      <div className="blauth-register-orb blauth-history-orb-two" />

      <nav className="blauth-register-nav" aria-label="Audit navigation">
        <Link className="blauth-brand" to="/">
          <span className="blauth-brand-mark">P</span>
          <span>PehchanChain</span>
        </Link>
        <span className="blauth-nav-status">
          <i /> PehchanChain Immutable Audit Log
        </span>
      </nav>

      <section className="blauth-history-shell">
        <header className="blauth-history-intro">
          <p className="blauth-eyebrow">
            <span /> Audit &amp; Traceability
          </p>
          <h1>
            PehchanChain<br />
            <em>Audit Trail.</em>
          </h1>
          <p>
            Complete immutable ledger of identity lifecycle, digital asset transfers,
            RBAC role changes, and selective-disclosure access decisions.
          </p>
        </header>

        <article className="blauth-history-card">
          <header>
            <h2>Audit Trail</h2>
            <span>
              {logs.length} Total Event{logs.length !== 1 ? "s" : ""}
            </span>
          </header>

          {/* Search Bar */}
          <div className="blauth-audit-search-bar">
            <form onSubmit={handleSearch} className="blauth-audit-search-form">
              <label htmlFor="audit-did-input" className="blauth-did-label">
                Target DID Query
              </label>
              <div className="blauth-audit-search-input-row">
                <input
                  id="audit-did-input"
                  type="text"
                  value={queryDID}
                  onChange={(e) => setQueryDID(e.target.value)}
                  placeholder="did:pehchan:..."
                  spellCheck={false}
                  required
                />
                <button type="submit" className="blauth-continue-button">
                  Fetch Log →
                </button>
              </div>
            </form>
          </div>

          {/* Ledger Type Explanation Legend */}
          <div className="blauth-audit-legend-card">
            <div className="blauth-audit-legend-item">
              <span className="blauth-audit-pill blauth-audit-pill-onchain">
                ⛓️ ON-CHAIN IMMUTABLE
              </span>
              <p>
                Recorded on the <strong>Polygon Amoy blockchain ledger</strong>. Cannot be altered or deleted.
              </p>
            </div>
            <div className="blauth-audit-legend-item">
              <span className="blauth-audit-pill blauth-audit-pill-offchain">
                🛡️ OFF-CHAIN CONSENT LOG
              </span>
              <p>
                Selective disclosure decision recorded locally in wallet history upon user biometric sign-off.
              </p>
            </div>
          </div>

          {/* Filter Bar */}
          <div className="blauth-admin-tabs" style={{ padding: "0 27px", margin: "16px 0" }}>
            <button
              type="button"
              className={filterMode === "all" ? "is-active" : ""}
              onClick={() => setFilterMode("all")}
            >
              All Events ({logs.length})
            </button>
            <button
              type="button"
              className={filterMode === "onchain" ? "is-active" : ""}
              onClick={() => setFilterMode("onchain")}
            >
              ⛓️ Immutable On-Chain ({onChainCount})
            </button>
            <button
              type="button"
              className={filterMode === "offchain" ? "is-active" : ""}
              onClick={() => setFilterMode("offchain")}
            >
              🛡️ Off-Chain Disclosures ({offChainCount})
            </button>
          </div>

          {/* Content States */}
          {loading && (
            <div className="blauth-history-empty">
              <span>◦</span>
              <h3>Retrieving Audit Log</h3>
              <p>Querying Polygon Amoy contracts and wallet event history for <code>{activeDID}</code>…</p>
            </div>
          )}

          {error && (
            <div className="blauth-history-empty">
              <span>!</span>
              <h3>Audit Trail Error</h3>
              <p>{error}</p>
            </div>
          )}

          {!loading && !error && filteredLogs.length === 0 && (
            <div className="blauth-history-empty">
              <span>◦</span>
              <h3>No Audit Events Found</h3>
              <p>No lifecycle or disclosure records found for DID <code>{activeDID}</code>.</p>
            </div>
          )}

          {/* Timeline View */}
          {!loading && !error && filteredLogs.length > 0 && (
            <div className="blauth-audit-timeline-shell">
              <ol className="blauth-audit-timeline">
                {filteredLogs.map((item, index) => {
                  const isOnChain = isOnChainEvent(item);
                  return (
                    <li className="blauth-audit-timeline-item" key={`${item.eventType}-${item.timestamp}-${index}`}>
                      <div className="blauth-audit-node-icon">
                        {getEventIcon(item.eventType)}
                      </div>

                      <div className="blauth-audit-card-body">
                        <header className="blauth-audit-item-header">
                          <div>
                            <h3>{getEventTitle(item.eventType)}</h3>
                            <time className="blauth-audit-time">{formatTimestamp(item.timestamp)}</time>
                          </div>
                          {isOnChain ? (
                            <span className="blauth-audit-pill blauth-audit-pill-onchain">
                              ⛓️ ON-CHAIN IMMUTABLE
                            </span>
                          ) : (
                            <span className="blauth-audit-pill blauth-audit-pill-offchain">
                              🛡️ OFF-CHAIN CONSENT
                            </span>
                          )}
                        </header>

                        <p className="blauth-audit-details">{item.details}</p>

                        <div className="blauth-audit-metadata-grid">
                          <div className="blauth-audit-meta-row">
                            <span>Involved DID:</span>
                            <code>{item.did}</code>
                          </div>

                          {item.tokenId && (
                            <div className="blauth-audit-meta-row">
                              <span>Asset Token ID:</span>
                              <strong>#{item.tokenId}</strong>
                            </div>
                          )}

                          {item.verifier && (
                            <div className="blauth-audit-meta-row">
                              <span>Verifier Entity:</span>
                              <strong>{item.verifier}</strong>
                            </div>
                          )}

                          {item.transactionHash && (
                            <div className="blauth-audit-meta-row">
                              <span>Transaction Hash:</span>
                              <code className="blauth-did-value" title={item.transactionHash}>
                                {item.transactionHash}
                              </code>
                            </div>
                          )}
                        </div>

                        {/* Immutability disclaimer for on-chain events */}
                        {isOnChain && (
                          <div className="blauth-audit-blockchain-note">
                            <span aria-hidden="true">🔒</span>
                            <small>
                              Verified immutable record on <strong>Polygon Amoy Testnet</strong>.
                              Tx: <code>{item.transactionHash?.slice(0, 14)}…</code>
                            </small>
                          </div>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ol>
            </div>
          )}

          <footer>
            <Link to="/wallet">← Return to Wallet</Link>
          </footer>
        </article>
      </section>
    </main>
  );
}

export default AuditTrail;
