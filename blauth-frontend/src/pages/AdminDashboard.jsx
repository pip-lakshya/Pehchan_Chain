import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  mintAsset,
  transferAsset,
  assignRole,
  revokeRole,
  getRolesForDID,
} from "../services/api";

const WALLET_ID_KEY = "blauthWalletId";

function AdminDashboard() {
  const navigate = useNavigate();
  const [walletId, setWalletId] = useState(() => localStorage.getItem(WALLET_ID_KEY));
  const adminDID = walletId ? (walletId.startsWith("did:") ? walletId : `did:pehchan:${walletId}`) : "did:pehchan:admin_workspace";

  const [activeTab, setActiveTab] = useState("assets"); // "assets" | "roles" | "audit"

  // Mint Form State
  const [mintForm, setMintForm] = useState({
    recipient: "0x1111111111111111111111111111111111111111",
    targetDID: "did:pehchan:student_001",
    name: "Defence Project Clearance ID",
    category: "SECURITY_CLEARANCE",
    ipfsHash: "ipfs://QmPehchanClearance001",
    payloadHash: "0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef",
  });
  const [mintStatus, setMintStatus] = useState("idle");
  const [mintResult, setMintResult] = useState(null);
  const [mintError, setMintError] = useState("");

  // Assign/Transfer Form State
  const [assignForm, setAssignForm] = useState({
    tokenId: "1",
    recipient: "0x2222222222222222222222222222222222222222",
    targetDID: "did:pehchan:student_002",
  });
  const [assignStatus, setAssignStatus] = useState("idle");
  const [assignResult, setAssignResult] = useState(null);
  const [assignError, setAssignError] = useState("");

  // Role Form State
  const [roleForm, setRoleForm] = useState({
    targetDID: "did:pehchan:manager_wallet",
    role: "MANAGER",
  });
  const [roleStatus, setRoleStatus] = useState("idle");
  const [roleResult, setRoleResult] = useState(null);
  const [roleError, setRoleError] = useState("");

  // Role Inspector State
  const [inspectDID, setInspectDID] = useState("did:pehchan:manager_wallet");
  const [inspectedRoles, setInspectedRoles] = useState(null);
  const [inspectError, setInspectError] = useState("");

  // Live Transaction Log Feed
  const [txLogs, setTxLogs] = useState([]);

  function addTxLog(type, details) {
    setTxLogs((prev) => [
      {
        id: Date.now(),
        type,
        timestamp: new Date().toLocaleTimeString(),
        ...details,
      },
      ...prev,
    ]);
  }

  // Handle Mint (Admin Only)
  async function handleMintSubmit(e) {
    e.preventDefault();
    setMintStatus("submitting");
    setMintError("");
    setMintResult(null);

    try {
      const res = await mintAsset({
        requesterDID: adminDID,
        recipient: mintForm.recipient,
        targetDID: mintForm.targetDID,
        name: mintForm.name,
        category: mintForm.category,
        ipfsHash: mintForm.ipfsHash,
        payloadHash: mintForm.payloadHash,
      });

      setMintResult(res);
      setMintStatus("success");
      addTxLog("MINT_NFT", {
        tokenId: res.tokenId,
        targetDID: res.targetDID,
        transactionHash: res.transactionHash,
        blockNumber: res.blockNumber,
      });
    } catch (err) {
      setMintError(err.message || "Failed to mint digital asset.");
      setMintStatus("error");
    }
  }

  // Handle Assign (Manager / Admin)
  async function handleAssignSubmit(e) {
    e.preventDefault();
    setAssignStatus("submitting");
    setAssignError("");
    setAssignResult(null);

    try {
      const res = await transferAsset({
        requesterDID: adminDID,
        tokenId: assignForm.tokenId,
        recipient: assignForm.recipient,
        targetDID: assignForm.targetDID,
      });

      setAssignResult(res);
      setAssignStatus("success");
      addTxLog("ASSIGN_NFT", {
        tokenId: res.tokenId,
        targetDID: res.targetDID,
        transactionHash: res.transactionHash,
        blockNumber: res.blockNumber,
      });
    } catch (err) {
      setAssignError(err.message || "Failed to assign digital asset.");
      setAssignStatus("error");
    }
  }

  // Handle Assign Role (Admin Only)
  async function handleAssignRole(e) {
    e.preventDefault();
    setRoleStatus("submitting");
    setRoleError("");
    setRoleResult(null);

    try {
      const res = await assignRole({
        targetDID: roleForm.targetDID,
        role: roleForm.role,
      });

      setRoleResult({ action: "ASSIGNED", ...res });
      setRoleStatus("success");
      addTxLog("ROLE_ASSIGN", {
        role: res.role,
        targetDID: res.targetDID,
        transactionHash: res.transactionHash,
        blockNumber: res.blockNumber,
      });

      // Auto-refresh inspector for target DID and update active session DID
      setInspectDID(res.targetDID);
      if (res.role === "ADMIN" || res.role === "MANAGER") {
        localStorage.setItem(WALLET_ID_KEY, res.targetDID);
        setWalletId(res.targetDID);
      }
      getRolesForDID(res.targetDID).then(setInspectedRoles).catch(() => {});
    } catch (err) {
      setRoleError(err.message || "Failed to assign role.");
      setRoleStatus("error");
    }
  }

  // Handle Revoke Role (Admin Only)
  async function handleRevokeRole(e) {
    e.preventDefault();
    setRoleStatus("submitting");
    setRoleError("");
    setRoleResult(null);

    try {
      const res = await revokeRole({
        targetDID: roleForm.targetDID,
        role: roleForm.role,
      });

      setRoleResult({ action: "REVOKED", ...res });
      setRoleStatus("success");
      addTxLog("ROLE_REVOKE", {
        role: res.role,
        targetDID: res.targetDID,
        transactionHash: res.transactionHash,
        blockNumber: res.blockNumber,
      });

      // Auto-refresh inspector for target DID
      setInspectDID(res.targetDID);
      getRolesForDID(res.targetDID).then(setInspectedRoles).catch(() => {});
    } catch (err) {
      setRoleError(err.message || "Failed to revoke role.");
      setRoleStatus("error");
    }
  }

  // Handle Role Inspector
  async function handleInspectRoles(e) {
    e.preventDefault();
    setInspectError("");
    setInspectedRoles(null);

    try {
      const res = await getRolesForDID(inspectDID);
      setInspectedRoles(res);
    } catch (err) {
      setInspectError(err.message || "Failed to query roles for target DID.");
    }
  }

  return (
    <main className="blauth-consent">
      <nav className="blauth-register-nav" aria-label="Admin navigation">
        <span className="blauth-nav-status">
          <i /> Admin & Governance Console
        </span>
      </nav>

      <section className="blauth-consent-shell">
        <header className="blauth-consent-intro">
          <p className="blauth-eyebrow">
            <span /> Bharat Electronics Limited (BEL)
          </p>
          <h1>
            PehchanChain<br />
            <em>Admin Console.</em>
          </h1>
          <p>
            Mint digital assets, manage RBAC roles, inspect transaction logs, and review blockchain audit metadata.
          </p>
        </header>

        <article className="blauth-consent-card">
          <header className="blauth-request-header">
            <div>
              <p>System Administration</p>
              <h2>PehchanChain Control Panel</h2>
            </div>
          </header>

          {/* Navigation Tabs */}
          <div className="blauth-admin-tabs">
            <button
              type="button"
              className={activeTab === "assets" ? "is-active" : ""}
              onClick={() => setActiveTab("assets")}
            >
              NFT Digital Assets
            </button>
            <button
              type="button"
              className={activeTab === "roles" ? "is-active" : ""}
              onClick={() => setActiveTab("roles")}
            >
              RBAC Role Management
            </button>
            <button
              type="button"
              className={activeTab === "audit" ? "is-active" : ""}
              onClick={() => setActiveTab("audit")}
            >
              Audit & Tx Logs
            </button>
          </div>

          {/* ════════════════ TAB 1: NFT DIGITAL ASSETS (MINT VS ASSIGN) ════════════════ */}
          {activeTab === "assets" && (
            <div className="blauth-admin-tab-content">
              {/* Card 1: MINT NEW NFT */}
              <section className="blauth-admin-card-section">
                <div className="blauth-admin-section-header">
                  <div>
                    <h3>1. MINT New Digital Asset (NFT)</h3>
                    <span className="blauth-admin-badge blauth-admin-badge-gold">ADMIN ONLY</span>
                  </div>
                  <button
                    type="button"
                    className="blauth-did-copy-btn"
                    onClick={() => setMintForm({
                      recipient: "0x3333333333333333333333333333333333333333",
                      targetDID: "did:pehchan:wallet_demo_student",
                      name: "Defence Project Clearance ID",
                      category: "SECURITY_CLEARANCE",
                      ipfsHash: "ipfs://QmPehchanClearance001",
                      payloadHash: "0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef"
                    })}
                    style={{ padding: "6px 12px", fontSize: "11px" }}
                  >
                    ⚡ Auto-Fill Demo Mint
                  </button>
                  <p className="blauth-admin-help-text">
                    <strong>MINT</strong> creates a brand new NFT on the blockchain. Managers do <em>NOT</em> have permission to mint new asset types.
                  </p>
                </div>

                <form onSubmit={handleMintSubmit} className="blauth-form-grid">
                  <div className="blauth-input-group">
                    <label htmlFor="mint-name">Asset Name</label>
                    <input
                      id="mint-name"
                      type="text"
                      value={mintForm.name}
                      onChange={(e) => setMintForm({ ...mintForm, name: e.target.value })}
                      required
                    />
                  </div>

                  <div className="blauth-input-group">
                    <label htmlFor="mint-category">Asset Category</label>
                    <select
                      id="mint-category"
                      value={mintForm.category}
                      onChange={(e) => setMintForm({ ...mintForm, category: e.target.value })}
                    >
                      <option value="SECURITY_CLEARANCE">SECURITY_CLEARANCE</option>
                      <option value="CERTIFICATE">CERTIFICATE</option>
                      <option value="ACCESS_CARD">ACCESS_CARD</option>
                      <option value="LICENSE">LICENSE</option>
                    </select>
                  </div>

                  <div className="blauth-input-group is-wide">
                    <label htmlFor="mint-recipient">Recipient Wallet Address</label>
                    <input
                      id="mint-recipient"
                      type="text"
                      value={mintForm.recipient}
                      onChange={(e) => setMintForm({ ...mintForm, recipient: e.target.value })}
                      placeholder="0x..."
                      required
                    />
                  </div>

                  <div className="blauth-input-group is-wide">
                    <label htmlFor="mint-targetDid">Target User DID</label>
                    <input
                      id="mint-targetDid"
                      type="text"
                      value={mintForm.targetDID}
                      onChange={(e) => setMintForm({ ...mintForm, targetDID: e.target.value })}
                      placeholder="did:pehchan:..."
                      required
                    />
                  </div>

                  <div className="blauth-input-group is-wide">
                    <label htmlFor="mint-ipfs">IPFS Metadata URI (Optional)</label>
                    <input
                      id="mint-ipfs"
                      type="text"
                      value={mintForm.ipfsHash}
                      onChange={(e) => setMintForm({ ...mintForm, ipfsHash: e.target.value })}
                      placeholder="ipfs://..."
                    />
                  </div>

                  <div className="blauth-input-group is-wide">
                    <label htmlFor="mint-payload">Payload Hash (Bytes32 Hex)</label>
                    <input
                      id="mint-payload"
                      type="text"
                      value={mintForm.payloadHash}
                      onChange={(e) => setMintForm({ ...mintForm, payloadHash: e.target.value })}
                      placeholder="0x..."
                    />
                  </div>

                  <div className="blauth-input-group is-wide">
                    <button
                      type="submit"
                      className="blauth-continue-button"
                      disabled={mintStatus === "submitting"}
                    >
                      {mintStatus === "submitting" ? "Minting NFT on-chain..." : "Mint New NFT Asset →"}
                    </button>
                  </div>
                </form>

                {mintError && <p className="blauth-field-error" role="alert">{mintError}</p>}
                {mintResult && (
                  <div className="blauth-admin-success-box">
                    <h4>✔ NFT Asset Minted Successfully</h4>
                    <p>Token ID: <strong>#{mintResult.tokenId}</strong></p>
                    <p>Target DID: <code>{mintResult.targetDID}</code></p>
                    <p>Tx Hash: <code>{mintResult.transactionHash}</code></p>
                  </div>
                )}
              </section>

              {/* Card 2: ASSIGN / TRANSFER EXISTING NFT */}
              <section className="blauth-admin-card-section" style={{ marginTop: "32px" }}>
                <div className="blauth-admin-section-header">
                  <div>
                    <h3>2. ASSIGN / Transfer Existing Asset</h3>
                    <span className="blauth-admin-badge blauth-admin-badge-blue">MANAGER & ADMIN</span>
                  </div>
                  <p className="blauth-admin-help-text">
                    <strong>ASSIGN</strong> transfers an already-existing token ID to a target user's DID & wallet address.
                  </p>
                </div>

                <form onSubmit={handleAssignSubmit} className="blauth-form-grid">
                  <div className="blauth-input-group">
                    <label htmlFor="assign-tokenId">Token ID to Assign</label>
                    <input
                      id="assign-tokenId"
                      type="text"
                      value={assignForm.tokenId}
                      onChange={(e) => setAssignForm({ ...assignForm, tokenId: e.target.value })}
                      required
                    />
                  </div>

                  <div className="blauth-input-group">
                    <label htmlFor="assign-recipient">New Owner Wallet Address</label>
                    <input
                      id="assign-recipient"
                      type="text"
                      value={assignForm.recipient}
                      onChange={(e) => setAssignForm({ ...assignForm, recipient: e.target.value })}
                      required
                    />
                  </div>

                  <div className="blauth-input-group is-wide">
                    <label htmlFor="assign-targetDid">New Target User DID</label>
                    <input
                      id="assign-targetDid"
                      type="text"
                      value={assignForm.targetDID}
                      onChange={(e) => setAssignForm({ ...assignForm, targetDID: e.target.value })}
                      required
                    />
                  </div>

                  <div className="blauth-input-group is-wide">
                    <button
                      type="submit"
                      className="blauth-continue-button"
                      disabled={assignStatus === "submitting"}
                    >
                      {assignStatus === "submitting" ? "Assigning asset on-chain..." : "Assign Existing Asset →"}
                    </button>
                  </div>
                </form>

                {assignError && <p className="blauth-field-error" role="alert">{assignError}</p>}
                {assignResult && (
                  <div className="blauth-admin-success-box">
                    <h4>✔ Asset Assigned Successfully</h4>
                    <p>Token ID: <strong>#{assignResult.tokenId}</strong></p>
                    <p>New Target DID: <code>{assignResult.targetDID}</code></p>
                    <p>Tx Hash: <code>{assignResult.transactionHash}</code></p>
                  </div>
                )}
              </section>
            </div>
          )}

          {/* ════════════════ TAB 2: RBAC ROLE MANAGEMENT ════════════════ */}
          {activeTab === "roles" && (
            <div className="blauth-admin-tab-content">
              {/* Role Assignment Form */}
              <section className="blauth-admin-card-section">
                <div className="blauth-admin-section-header">
                  <div>
                    <h3>Role Administration (Assign / Revoke)</h3>
                    <span className="blauth-admin-badge blauth-admin-badge-gold">ADMIN ONLY</span>
                  </div>
                  <div style={{ display: "flex", gap: "8px" }}>
                    {walletId && (
                      <button
                        type="button"
                        className="blauth-did-copy-btn"
                        onClick={() => {
                          const userDid = walletId.startsWith("did:") ? walletId : `did:pehchan:${walletId}`;
                          setRoleForm({ targetDID: userDid, role: "ADMIN" });
                          setInspectDID(userDid);
                        }}
                        style={{ padding: "6px 12px", fontSize: "11px" }}
                      >
                        ⚡ Auto-Fill My Identity
                      </button>
                    )}
                    <button
                      type="button"
                      className="blauth-did-copy-btn"
                      onClick={() => setRoleForm({ targetDID: "did:pehchan:wallet_manager_01", role: "MANAGER" })}
                      style={{ padding: "6px 12px", fontSize: "11px" }}
                    >
                      ⚡ Auto-Fill Demo Manager
                    </button>
                  </div>
                  <p className="blauth-admin-help-text">
                    Grant or revoke smart-contract roles on the <code>PehchanAccessControl</code> hub.
                  </p>
                </div>

                <form className="blauth-form-grid">
                  <div className="blauth-input-group is-wide">
                    <label htmlFor="role-targetDid">Target DID or Wallet Address</label>
                    <input
                      id="role-targetDid"
                      type="text"
                      value={roleForm.targetDID}
                      onChange={(e) => setRoleForm({ ...roleForm, targetDID: e.target.value })}
                      required
                    />
                  </div>

                  <div className="blauth-input-group is-wide">
                    <label htmlFor="role-select">Select Role</label>
                    <select
                      id="role-select"
                      value={roleForm.role}
                      onChange={(e) => setRoleForm({ ...roleForm, role: e.target.value })}
                    >
                      <option value="MANAGER">MANAGER (Can assign assets)</option>
                      <option value="AUDITOR">AUDITOR (Can verify credentials)</option>
                      <option value="USER">USER (Standard wallet holder)</option>
                      <option value="ADMIN">ADMIN (Full administrative access)</option>
                    </select>
                  </div>

                  <div className="blauth-admin-role-buttons is-wide">
                    <button
                      type="button"
                      className="blauth-continue-button"
                      disabled={roleStatus === "submitting"}
                      onClick={handleAssignRole}
                    >
                      Assign Role
                    </button>
                    <button
                      type="button"
                      className="blauth-deny-button"
                      disabled={roleStatus === "submitting"}
                      onClick={handleRevokeRole}
                    >
                      Revoke Role
                    </button>
                  </div>
                </form>

                {roleError && <p className="blauth-field-error" role="alert">{roleError}</p>}
                {roleResult && (
                  <div className="blauth-admin-success-box">
                    <h4>✔ Role {roleResult.action} Successfully</h4>
                    <p>Role: <strong>{roleResult.role}</strong></p>
                    <p>Target DID: <code>{roleResult.targetDID}</code></p>
                    <p>Tx Hash: <code>{roleResult.transactionHash}</code></p>
                  </div>
                )}
              </section>

              {/* Role Inspector */}
              <section className="blauth-admin-card-section" style={{ marginTop: "32px" }}>
                <div className="blauth-admin-section-header">
                  <h3>On-Chain Role Inspector</h3>
                  <p className="blauth-admin-help-text">
                    Query the <code>PehchanAccessControl</code> contract directly for active assigned roles.
                  </p>
                </div>

                <form onSubmit={handleInspectRoles} className="blauth-form-grid">
                  <div className="blauth-input-group is-wide">
                    <label htmlFor="inspect-targetDid">Query Target DID</label>
                    <input
                      id="inspect-targetDid"
                      type="text"
                      value={inspectDID}
                      onChange={(e) => setInspectDID(e.target.value)}
                      required
                    />
                  </div>
                  <div className="blauth-input-group is-wide">
                    <button type="submit" className="blauth-continue-button">
                      Inspect On-Chain Roles →
                    </button>
                  </div>
                </form>

                {inspectError && <p className="blauth-field-error" role="alert">{inspectError}</p>}
                {inspectedRoles && (
                  <div className="blauth-admin-roles-result">
                    <h4>Roles for <code>{inspectedRoles.targetDID}</code></h4>
                    <div className="blauth-admin-role-pills">
                      <span className={inspectedRoles.isAdmin ? "is-active" : ""}>ADMIN: {inspectedRoles.isAdmin ? "YES" : "NO"}</span>
                      <span className={inspectedRoles.isManager ? "is-active" : ""}>MANAGER: {inspectedRoles.isManager ? "YES" : "NO"}</span>
                      <span className={inspectedRoles.isAuditor ? "is-active" : ""}>AUDITOR: {inspectedRoles.isAuditor ? "YES" : "NO"}</span>
                      <span className={inspectedRoles.isUser ? "is-active" : ""}>USER: {inspectedRoles.isUser ? "YES" : "NO"}</span>
                    </div>
                  </div>
                )}
              </section>
            </div>
          )}

          {/* ════════════════ TAB 3: TRANSACTION LOGS & AUDIT METADATA ════════════════ */}
          {activeTab === "audit" && (
            <div className="blauth-admin-tab-content">
              <section className="blauth-admin-card-section">
                <h3>Live Transaction Logs (This Session)</h3>
                {txLogs.length === 0 ? (
                  <p className="blauth-admin-help-text">No transactions executed in this session yet.</p>
                ) : (
                  <div className="blauth-admin-tx-table">
                    {txLogs.map((log) => (
                      <div className="blauth-admin-tx-row" key={log.id}>
                        <div>
                          <span className="blauth-asset-category-pill">{log.type}</span>
                          <strong>Target: {log.targetDID}</strong>
                        </div>
                        <div>
                          <code>{log.transactionHash}</code>
                          <small>Block #{log.blockNumber} • {log.timestamp}</small>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </section>

              <section className="blauth-admin-card-section" style={{ marginTop: "32px" }}>
                <h3>Smart Contract Audit Metadata</h3>
                <div className="blauth-admin-audit-grid">
                  <div className="blauth-admin-audit-item">
                    <span>Target Blockchain:</span>
                    <strong>Polygon Amoy Testnet (Chain ID 80002)</strong>
                  </div>
                  <div className="blauth-admin-audit-item">
                    <span>Access Control Hub:</span>
                    <code>PehchanAccessControl.sol</code>
                  </div>
                  <div className="blauth-admin-audit-item">
                    <span>Credential Registry:</span>
                    <code>CredentialRegistry.sol</code>
                  </div>
                  <div className="blauth-admin-audit-item">
                    <span>Asset Registry:</span>
                    <code>PehchanAssetRegistry.sol (ERC-721)</code>
                  </div>
                  <div className="blauth-admin-audit-item">
                    <span>Organization:</span>
                    <strong>Bharat Electronics Limited (BEL)</strong>
                  </div>
                  <div className="blauth-admin-audit-item">
                    <span>SIH Problem Statement:</span>
                    <strong>SIH26125 — Identity, Access & Asset Management</strong>
                  </div>
                </div>
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

export default AdminDashboard;
