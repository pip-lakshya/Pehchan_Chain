/**
 * Login.jsx — Biometric Login to Existing DID
 *
 * Flow:
 *   Stage 1 — User enters their Wallet ID / DID
 *   Stage 2 — Live face scan; getFaceDescriptor must return non-null;
 *             compared against locally enrolled descriptor in IndexedDB
 *   Stage 3 — Role-aware welcome screen with smart redirect buttons
 *
 * Privacy: no biometric data leaves the browser.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { loadFaceModels, getFaceDescriptor, compareFaceDescriptors } from "../services/faceRecognition";
import { getEnrolledDescriptor } from "../services/biometricIdentity";
import { getWallet, getRolesForDID } from "../services/api";

const WALLET_ID_KEY = "blauthWalletId";

function extractWalletId(input) {
  const trimmed = input.trim();
  if (trimmed.startsWith("did:pehchan:")) return trimmed.slice("did:pehchan:".length);
  return trimmed;
}

function buildDID(walletId) {
  return walletId.startsWith("did:") ? walletId : `did:pehchan:${walletId}`;
}

function RoleBadge({ label, active }) {
  if (!active) return null;
  return (
    <span className="blauth-admin-badge" style={{ marginRight: "6px", display: "inline-block" }}>
      {label}
    </span>
  );
}

function Login() {
  const navigate = useNavigate();
  const [stage, setStage] = useState("did"); // "did" | "face" | "success"

  // Stage 1
  const [didInput, setDidInput]       = useState("");
  const [walletId, setWalletId]       = useState("");
  const [didError, setDidError]       = useState("");
  const [didChecking, setDidChecking] = useState(false);

  // Stage 2
  const videoRef   = useRef(null);
  const streamRef  = useRef(null);
  const mountedRef = useRef(true);
  const [modelsReady, setModelsReady]   = useState(false);
  const [cameraReady, setCameraReady]   = useState(false);
  const [faceChecking, setFaceChecking] = useState(false);
  const [faceError, setFaceError]       = useState("");

  // Stage 3
  const [roleInfo, setRoleInfo] = useState(null);

  const stopCamera = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; stopCamera(); };
  }, [stopCamera]);

  useEffect(() => {
    if (stage !== "face") { stopCamera(); return undefined; }
    let active = true;

    loadFaceModels()
      .then(() => { if (active) setModelsReady(true); })
      .catch(() => { if (active) setFaceError("Face recognition models could not be loaded. Refresh and try again."); });

    navigator.mediaDevices?.getUserMedia({ video: true, audio: false })
      .then(async (stream) => {
        if (!active) { stream.getTracks().forEach((t) => t.stop()); return; }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play().catch(() => {});
        }
        if (active) setCameraReady(true);
      })
      .catch(() => {
        if (active) setFaceError("Camera access was denied. Please allow camera access and try again.");
      });

    return () => { active = false; stopCamera(); };
  }, [stage, stopCamera]);

  async function handleDIDSubmit(e) {
    e.preventDefault();
    setDidError("");
    const raw = didInput.trim();
    if (!raw) { setDidError("Please enter your Wallet ID or DID."); return; }
    const wId = extractWalletId(raw);
    if (wId.length < 3) { setDidError("That doesn't look like a valid Wallet ID or DID."); return; }

    setDidChecking(true);
    try {
      await getWallet(wId);
      setWalletId(wId);
      setStage("face");
    } catch {
      setDidError("No wallet found for that ID. Check the DID and try again.");
    } finally {
      setDidChecking(false);
    }
  }

  async function handleFaceLogin() {
    setFaceError("");
    setFaceChecking(true);
    try {
      if (!cameraReady || !videoRef.current)
        throw new Error("Camera is not ready. Please allow camera access and try again.");
      if (!modelsReady)
        throw new Error("Face recognition models are still loading. Please wait a moment.");

      const liveDescriptor = await getFaceDescriptor(videoRef.current);
      if (!liveDescriptor)
        throw new Error("No face detected. Please position your face clearly in front of the camera.");

      const enrolledDescriptor = await getEnrolledDescriptor();
      if (!enrolledDescriptor)
        throw new Error("No enrolled face found on this device. Please register first, or use the device where you originally enrolled.");

      const { isMatch } = compareFaceDescriptors(enrolledDescriptor, liveDescriptor);
      if (!isMatch)
        throw new Error("Face does not match the enrolled identity on this device. Please try again.");

      localStorage.setItem(WALLET_ID_KEY, walletId);

      const did = buildDID(walletId);
      const roles = await getRolesForDID(did).catch(() => null);

      stopCamera();
      setRoleInfo(roles);
      setStage("success");
    } catch (err) {
      setFaceError(err.message || "Biometric login failed. Please try again.");
    } finally {
      setFaceChecking(false);
    }
  }

  function getSmartDestination() {
    if (!roleInfo) return "/wallet";
    if (roleInfo.isAdmin)   return "/admin";
    if (roleInfo.isManager) return "/manager";
    if (roleInfo.isAuditor) return "/verifier";
    return "/wallet";
  }

  return (
    <main className="blauth-register">
      <div className="blauth-register-orb blauth-register-orb-one" />
      <div className="blauth-register-orb blauth-register-orb-two" />

      <nav className="blauth-register-nav" aria-label="Login navigation">
        <span className="blauth-nav-status"><i /> Biometric Login — PehchanChain</span>
      </nav>

      <section className="blauth-register-shell" aria-label="Biometric login">
        <header className="blauth-register-intro">
          <p className="blauth-eyebrow">
            <span />{" "}
            {stage === "did" && "Step 1 of 2"}
            {stage === "face" && "Step 2 of 2"}
            {stage === "success" && "Access Granted"}
          </p>
          <h1>
            {stage === "did"     && <><span>Login to your</span><br /><em>identity.</em></>}
            {stage === "face"    && <><span>Verify</span><br /><em>your face.</em></>}
            {stage === "success" && <><span>Welcome</span><br /><em>back.</em></>}
          </h1>
          <p>
            {stage === "did"     && "Enter your existing Wallet ID or DID to get started."}
            {stage === "face"    && "Look into the camera. Your face never leaves this device."}
            {stage === "success" && "Biometric identity confirmed. Choose where to go."}
          </p>
        </header>

        <div className="blauth-register-card">

          {/* ── STAGE 1: DID INPUT ──────────────────────────────────────────── */}
          {stage === "did" && (
            <form className="blauth-register-form" noValidate onSubmit={handleDIDSubmit}>
              <div className="blauth-form-heading">
                <div>
                  <h2>Your Wallet ID</h2>
                  <p>Enter the DID you registered with.</p>
                </div>
                <button
                  type="button"
                  className="blauth-did-copy-btn"
                  style={{ padding: "6px 12px", fontSize: "11px" }}
                  onClick={() => setDidInput("did:pehchan:wallet_384afd2d-70a9-41c4-8b5c-0d2c837a3280")}
                >
                  ⚡ Auto-Fill Demo DID
                </button>
              </div>

              <div className="blauth-form-grid">
                <div className="blauth-input-group is-wide">
                  <label htmlFor="login-did">
                    Wallet ID / DID
                    <span className="blauth-manager-step-hint">
                      e.g. <code>did:pehchan:wallet_abc123</code> or just <code>wallet_abc123</code>
                    </span>
                  </label>
                  <input
                    id="login-did"
                    type="text"
                    value={didInput}
                    onChange={(e) => { setDidInput(e.target.value); setDidError(""); }}
                    placeholder="did:pehchan:wallet_… or wallet_…"
                    autoComplete="off"
                    spellCheck={false}
                    required
                  />
                  {didError && <p className="blauth-field-error" role="alert">{didError}</p>}
                </div>
              </div>

              <aside className="blauth-privacy-notice">
                <span aria-hidden="true">⌁</span>
                <p>
                  <strong>Your biometric stays on this device.</strong> We only verify the
                  wallet ID exists — no identity data is returned until you consent.
                </p>
              </aside>

              <div className="blauth-register-actions">
                <button type="button" className="blauth-back-button" onClick={() => navigate("/")}>
                  ← Back
                </button>
                <button
                  type="submit"
                  className="blauth-continue-button"
                  disabled={didChecking || !didInput.trim()}
                >
                  {didChecking ? "Checking…" : "Continue →"}
                </button>
              </div>

              <p style={{ textAlign: "center", marginTop: "20px", fontSize: "13px", color: "var(--blauth-muted, #888)" }}>
                Don&apos;t have an identity yet?{" "}
                <a
                  href="/register"
                  style={{ color: "inherit", textDecoration: "underline", cursor: "pointer" }}
                  onClick={(e) => { e.preventDefault(); navigate("/register"); }}
                >
                  Create one →
                </a>
              </p>
            </form>
          )}

          {/* ── STAGE 2: FACE SCAN ──────────────────────────────────────────── */}
          {stage === "face" && (
            <div className="blauth-register-form">
              <div className="blauth-form-heading">
                <div>
                  <h2>Face Verification</h2>
                  <p>
                    Logging in as{" "}
                    <code className="blauth-manager-code" style={{ fontSize: "11px" }}>
                      {buildDID(walletId)}
                    </code>
                  </p>
                </div>
              </div>

              <div className="blauth-camera-stage blauth-enrollment-camera" style={{ marginBottom: "16px" }}>
                <video
                  ref={videoRef}
                  className="blauth-camera-video"
                  autoPlay
                  muted
                  playsInline
                  aria-label="Login face scan camera"
                />
                <div className="blauth-camera-guide" aria-hidden="true">
                  <span /><span /><span /><span />
                </div>
                {!modelsReady && !faceError && (
                  <div className="blauth-camera-overlay">
                    <span className="blauth-loader" />
                    <p>Loading face recognition models…</p>
                  </div>
                )}
                {modelsReady && !cameraReady && !faceError && (
                  <div className="blauth-camera-overlay">
                    <span className="blauth-loader" />
                    <p>Starting camera…</p>
                  </div>
                )}
              </div>

              {faceError && (
                <p className="blauth-field-error" role="alert" style={{ marginBottom: "12px" }}>
                  {faceError}
                </p>
              )}
              {faceChecking && (
                <p className="blauth-enrollment-message" role="status">
                  Verifying biometric identity…
                </p>
              )}

              <aside className="blauth-privacy-notice" style={{ marginBottom: "16px" }}>
                <span aria-hidden="true">⌁</span>
                <p>
                  <strong>Comparison is 100% local.</strong> Your face embedding is matched
                  against what was enrolled on this device. Nothing is uploaded.
                </p>
              </aside>

              <div className="blauth-register-actions">
                <button
                  type="button"
                  className="blauth-back-button"
                  disabled={faceChecking}
                  onClick={() => {
                    setStage("did");
                    setFaceError("");
                    setCameraReady(false);
                    setModelsReady(false);
                  }}
                >
                  ← Back
                </button>
                <button
                  type="button"
                  className="blauth-continue-button"
                  disabled={faceChecking || !cameraReady || !modelsReady}
                  onClick={handleFaceLogin}
                >
                  {faceChecking ? "Verifying…" : "Verify Face & Login →"}
                </button>
              </div>
            </div>
          )}

          {/* ── STAGE 3: SUCCESS + ROLE REDIRECT ────────────────────────────── */}
          {stage === "success" && (
            <div className="blauth-register-form">
              <div style={{ textAlign: "center", padding: "8px 0 24px" }}>
                <div
                  className="blauth-result-mark"
                  style={{ color: "var(--blauth-success, #27ae60)", fontSize: "48px" }}
                >
                  ✓
                </div>
                <h2 style={{ marginTop: "12px" }}>Identity Confirmed</h2>
                <p style={{ marginTop: "6px", fontSize: "13px", color: "var(--blauth-muted, #888)" }}>
                  Logged in as
                </p>
                <code
                  className="blauth-manager-code"
                  style={{ display: "block", marginTop: "4px", fontSize: "11px", wordBreak: "break-all" }}
                >
                  {buildDID(walletId)}
                </code>

                {roleInfo && (
                  <div style={{ marginTop: "14px", display: "flex", gap: "6px", justifyContent: "center", flexWrap: "wrap" }}>
                    <RoleBadge label="ADMIN"   active={roleInfo.isAdmin} />
                    <RoleBadge label="MANAGER" active={roleInfo.isManager} />
                    <RoleBadge label="AUDITOR" active={roleInfo.isAuditor} />
                    <RoleBadge label="USER"    active={roleInfo.isUser} />
                    {!roleInfo.isAdmin && !roleInfo.isManager && !roleInfo.isAuditor && !roleInfo.isUser && (
                      <span className="blauth-admin-badge">NO ROLE ASSIGNED</span>
                    )}
                  </div>
                )}
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                <button
                  type="button"
                  className="blauth-continue-button"
                  onClick={() => navigate(getSmartDestination())}
                >
                  {roleInfo?.isAdmin && "Go to Admin Console →"}
                  {!roleInfo?.isAdmin && roleInfo?.isManager && "Go to Manager Panel →"}
                  {!roleInfo?.isAdmin && !roleInfo?.isManager && roleInfo?.isAuditor && "Go to Verifier Portal →"}
                  {(!roleInfo || (!roleInfo.isAdmin && !roleInfo.isManager && !roleInfo.isAuditor)) && "Open My Wallet →"}
                </button>

                {getSmartDestination() !== "/wallet" && (
                  <button
                    type="button"
                    className="blauth-back-button"
                    onClick={() => navigate("/wallet")}
                  >
                    Open Wallet instead
                  </button>
                )}
              </div>
            </div>
          )}

        </div>
      </section>
    </main>
  );
}

export default Login;
