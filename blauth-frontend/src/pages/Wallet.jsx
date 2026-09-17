import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { getWallet, getAssetsByIdentity } from "../services/api";
import { clearEnrolledDescriptor } from "../services/biometricIdentity";

const WALLET_ID_KEY = "blauthWalletId";

function maskPhone(phone) {
  const visibleDigits = phone.replace(/\D/g, "").slice(-4);
  return visibleDigits ? `••••••${visibleDigits}` : "••••••••••";
}

function formatDate(timestamp) {
  if (!timestamp) return "N/A";
  const ts = Number(timestamp);
  const date = ts > 1e11 ? new Date(ts) : new Date(ts * 1000);
  return date.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

function Wallet() {
  const navigate = useNavigate();
  const [walletId] = useState(() => localStorage.getItem(WALLET_ID_KEY));
  const [identity, setIdentity] = useState(null);
  const [walletState, setWalletState] = useState(() => (walletId ? "loading" : "missing"));
  const [walletError, setWalletError] = useState("");
  const [showDob, setShowDob] = useState(false);
  const [showPhone, setShowPhone] = useState(false);
  const [resetError, setResetError] = useState("");

  const [assets, setAssets] = useState([]);
  const [assetsLoading, setAssetsLoading] = useState(true);
  const [copiedDid, setCopiedDid] = useState(false);

  const userDID = walletId ? (walletId.startsWith("did:") ? walletId : `did:pehchan:${walletId}`) : "";

  useEffect(() => {
    let isCurrent = true;
    if (!walletId) return undefined;

    getWallet(walletId)
      .then(({ credentials }) => {
        if (!isCurrent) return;
        setIdentity(credentials);
        setWalletState("ready");
      })
      .catch((error) => {
        if (!isCurrent) return;
        setWalletError(error.message || "The backend wallet could not be loaded.");
        setWalletState("error");
      });

    return () => { isCurrent = false; };
  }, [walletId]);

  useEffect(() => {
    let isCurrent = true;
    if (!userDID || walletState !== "ready") return undefined;

    setAssetsLoading(true);
    getAssetsByIdentity(userDID)
      .then((data) => {
        if (!isCurrent) return;
        setAssets(data?.assets || []);
        setAssetsLoading(false);
      })
      .catch(() => {
        if (!isCurrent) return;
        setAssets([]);
        setAssetsLoading(false);
      });

    return () => { isCurrent = false; };
  }, [userDID, walletState]);

  function copyDid() {
    if (!userDID) return;
    navigator.clipboard.writeText(userDID);
    setCopiedDid(true);
    setTimeout(() => setCopiedDid(false), 2000);
  }

  async function resetLocalDemo() {
    if (!window.confirm("Reset this browser's local BLAuth identity? This removes the local wallet ID, profile, and enrolled biometric descriptor from this browser only.")) return;

    try {
      await clearEnrolledDescriptor();
      localStorage.removeItem("blauthIdentity");
      localStorage.removeItem(WALLET_ID_KEY);
      navigate("/register", { replace: true });
    } catch (error) {
      setResetError(error.message || "Could not reset local browser data.");
    }
  }

  if (walletState !== "ready" || !identity) {
    return (
      <main className="blauth-wallet">
        <nav className="blauth-register-nav" aria-label="Wallet navigation"><Link className="blauth-brand" to="/"><span className="blauth-brand-mark">P</span><span>PehchanChain</span></Link><span className="blauth-nav-status"><i /> Privacy-first identity</span></nav>
        <section className="blauth-wallet-empty"><span className="blauth-wallet-empty-mark" aria-hidden="true">B</span><p className="blauth-eyebrow"><span /> Your private wallet</p><h1>{walletState === "loading" ? <>Loading your<br /><em>identity.</em></> : <>No backend<br /><em>wallet found.</em></>}</h1><p>{walletState === "loading" ? "Retrieving your identity wallet." : walletState === "error" ? walletError : "Complete local face verification to register your backend wallet."}</p><Link className="blauth-button blauth-button-primary" to="/register">Create Identity <span>→</span></Link></section>
      </main>
    );
  }

  const fields = [
    { label: "Name", value: identity.name },
    { label: "Email", value: identity.email },
    { label: "Student ID", value: identity.studentId },
    { label: "Date of Birth", value: showDob ? identity.dob : "•• / •• / ••••", toggle: () => setShowDob((value) => !value), shown: showDob },
    { label: "Phone", value: showPhone ? identity.phone : maskPhone(identity.phone || ""), toggle: () => setShowPhone((value) => !value), shown: showPhone },
  ];

  return (
    <main className="blauth-wallet">
      <div className="blauth-register-orb blauth-wallet-orb-one" /><div className="blauth-register-orb blauth-wallet-orb-two" />
      <nav className="blauth-register-nav" aria-label="Wallet navigation"><Link className="blauth-brand" to="/"><span className="blauth-brand-mark">P</span><span>PehchanChain</span></Link><span className="blauth-nav-status"><i /> Private identity wallet</span></nav>
      <section className="blauth-wallet-shell">
        <header className="blauth-wallet-intro"><p className="blauth-eyebrow"><span /> Step 3 of 3</p><h1>Your identity,<br /><em>in your hands.</em></h1><p>These details stay in your local PehchanChain wallet until you choose what to share.</p></header>
        
        <article className="blauth-wallet-card">
          <header className="blauth-wallet-card-header">
            <div>
              <span className="blauth-wallet-card-mark">P</span>
              <div>
                <p>PehchanChain Identity</p>
                <h2>{identity.name || "Your identity"}</h2>
              </div>
            </div>
            <span className="blauth-wallet-status"><i /> Identity verified locally</span>
          </header>

          {/* Decentralized Identifier (DID) Banner */}
          <div className="blauth-did-banner">
            <div className="blauth-did-info">
              <span className="blauth-did-label">Decentralized Identifier (DID)</span>
              <code className="blauth-did-value">{userDID}</code>
            </div>
            <button type="button" className="blauth-did-copy-btn" onClick={copyDid}>
              {copiedDid ? "Copied!" : "Copy DID"}
            </button>
          </div>

          {/* Identity Credentials List */}
          <div className="blauth-wallet-details" aria-label="Registered identity details">
            {fields.map((field) => (
              <div className="blauth-wallet-field" key={field.label}>
                <span>{field.label}</span>
                <div>
                  <strong>{field.value || "Not provided"}</strong>
                  {field.toggle && (
                    <button type="button" onClick={field.toggle}>
                      {field.shown ? "Hide" : "Show"}
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>

          {/* PehchanChain Digital Assets / NFT Section */}
          <section className="blauth-assets-section">
            <header className="blauth-assets-header">
              <h3>Assigned Digital Assets & NFTs</h3>
              <span className="blauth-assets-badge">{assets.length} Assets</span>
            </header>

            {assetsLoading ? (
              <div className="blauth-assets-loading">Loading assigned digital assets from blockchain…</div>
            ) : assets.length === 0 ? (
              <div className="blauth-assets-empty">
                <span aria-hidden="true">⬡</span>
                <p>No digital assets assigned to this identity yet.</p>
                <small>Assets assigned by an authorized Manager will appear here automatically.</small>
              </div>
            ) : (
              <div className="blauth-assets-grid">
                {assets.map((asset) => (
                  <article className="blauth-asset-item" key={asset.tokenId || asset.id}>
                    <header className="blauth-asset-item-header">
                      <div>
                        <span className="blauth-asset-category-pill">{asset.category || "NFT"}</span>
                        <h4>{asset.name}</h4>
                      </div>
                      <span className="blauth-asset-token-chip">Token #{asset.tokenId || asset.id}</span>
                    </header>
                    <div className="blauth-asset-item-details">
                      <div className="blauth-asset-meta-row">
                        <span>Target DID:</span>
                        <code>{asset.targetDID}</code>
                      </div>
                      {asset.ownerAddress && (
                        <div className="blauth-asset-meta-row">
                          <span>Owner Wallet:</span>
                          <code>{asset.ownerAddress}</code>
                        </div>
                      )}
                      {asset.ipfsHash && (
                        <div className="blauth-asset-meta-row">
                          <span>IPFS URI:</span>
                          <a href={asset.ipfsHash.startsWith("ipfs://") ? asset.ipfsHash.replace("ipfs://", "https://ipfs.io/ipfs/") : asset.ipfsHash} target="_blank" rel="noopener noreferrer">
                            {asset.ipfsHash}
                          </a>
                        </div>
                      )}
                      {asset.payloadHash && asset.payloadHash !== "0x0000000000000000000000000000000000000000000000000000000000000000" && (
                        <div className="blauth-asset-meta-row">
                          <span>Payload Hash:</span>
                          <code>{asset.payloadHash.slice(0, 10)}…{asset.payloadHash.slice(-8)}</code>
                        </div>
                      )}
                      {asset.mintedAt && (
                        <div className="blauth-asset-meta-row">
                          <span>Minted Date:</span>
                          <span>{formatDate(asset.mintedAt)}</span>
                        </div>
                      )}
                    </div>
                  </article>
                ))}
              </div>
            )}
          </section>

          <footer className="blauth-wallet-footer">
            <span aria-hidden="true">⌁</span>
            <p>Your identity &amp; on-chain digital assets are loaded from your PehchanChain wallet.</p>
          </footer>

          <div className="blauth-wallet-history-link">
            <Link to="/audit">View full PehchanChain audit trail (on-chain &amp; disclosures) <span>→</span></Link>
          </div>

          <div className="blauth-wallet-history-link" style={{ borderTop: "0", paddingTop: "0" }}>
            <Link to="/history">View disclosure history <span>→</span></Link>
          </div>

          <div className="blauth-wallet-reset">
            <button type="button" onClick={resetLocalDemo}>Reset local demo identity</button>
            <p>Use this before enrolling a different person on this browser.</p>
            {resetError && <p className="blauth-field-error" role="alert">{resetError}</p>}
          </div>
        </article>
      </section>
    </main>
  );
}

export default Wallet;
