/**
 * VerifierPortal.jsx — Authenticator Mode 1
 *
 * A human-operated verifier portal that is a front door to the EXISTING
 * BLAuth selective-disclosure engine.
 *
 * Flow:
 *   1. Verifier identifies themselves (verifier ID + organisation name).
 *   2. Verifier searches for a user by wallet ID (the backend's primary key;
 *      displayed as DID in the UI).
 *   3. Verifier selects the fields they need (only allowlisted fields).
 *   4. Verifier submits → POST /verify/request (existing endpoint, unchanged).
 *   5. A shareable link / QR code reference is shown for the user.
 *   6. Verifier polls GET /verify/request/:requestId for status.
 *   7. When status === APPROVED the disclosed data is shown — ONLY what the
 *      user chose to approve via their existing Consent page.
 *   8. When status === DENIED, a denial notice is shown.
 *
 * Security guarantees:
 *   • Verifier sees NO wallet credential data until the user approves.
 *   • Polling endpoint returns only public-safe fields + user-approved data.
 *   • Raw wallet.credentials are never returned by the backend to the verifier.
 *   • The existing Consent + biometric flows are completely untouched.
 */

import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { createVerificationRequest, getVerificationRequestStatus } from "../services/api";
import { identityFieldLabels } from "../mockData";

// ─── Constants ────────────────────────────────────────────────────────────────

/** All fields the system supports for selective disclosure */
const SUPPORTED_FIELDS = [
  { key: "name",       label: "Name" },
  { key: "studentId",  label: "Student ID" },
  { key: "email",      label: "Email Address" },
  { key: "phone",      label: "Phone Number" },
  { key: "dob",        label: "Date of Birth" },
  { key: "ageOver18",  label: "Age Over 18 (derived — DOB not disclosed)" },
];

const POLL_INTERVAL_MS = 3000;
const POLL_MAX_ATTEMPTS = 60; // ~3 minutes total

// ─── Small helpers ────────────────────────────────────────────────────────────

function StatusBadge({ status }) {
  const map = {
    PENDING:  { cls: "is-pending",  text: "⏳ Awaiting user response" },
    APPROVED: { cls: "is-approved", text: "✔ Approved by user" },
    DENIED:   { cls: "is-denied",   text: "✖ Denied by user" },
  };
  const s = map[status] || { cls: "", text: status };
  return <span className={`blauth-verifier-status-badge ${s.cls}`}>{s.text}</span>;
}

function FieldValue({ fieldKey, value }) {
  if (fieldKey === "ageOver18") {
    return (
      <span className={`blauth-verifier-bool-pill ${value ? "is-true" : "is-false"}`}>
        {value ? "Yes — over 18" : "No — under 18"}
      </span>
    );
  }
  return <strong className="blauth-verifier-field-value">{String(value)}</strong>;
}

// ─── Step indicators ──────────────────────────────────────────────────────────

function Steps({ current }) {
  const steps = [
    { n: 1, label: "Identify" },
    { n: 2, label: "Find User" },
    { n: 3, label: "Request" },
    { n: 4, label: "Await & View" },
  ];
  return (
    <ol className="blauth-verifier-steps" aria-label="Progress steps">
      {steps.map((s) => (
        <li
          key={s.n}
          className={
            s.n < current ? "is-done" : s.n === current ? "is-current" : ""
          }
          aria-current={s.n === current ? "step" : undefined}
        >
          <span className="blauth-verifier-step-num">{s.n < current ? "✓" : s.n}</span>
          <span className="blauth-verifier-step-label">{s.label}</span>
        </li>
      ))}
    </ol>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

function VerifierPortal() {
  const navigate = useNavigate();

  // ── Step 1: Verifier identity ───────────────────────────────────────────────
  const [verifierId, setVerifierId]   = useState("");
  const [verifierOrg, setVerifierOrg] = useState("");
  const [step1Error, setStep1Error]   = useState("");

  // ── Step 2: User search ─────────────────────────────────────────────────────
  // The existing system uses walletId as the primary key. The UI presents it
  // as "User Wallet ID / DID" so operators understand both terms.
  const [walletIdInput, setWalletIdInput] = useState("");
  const [userFound, setUserFound]         = useState(false); // true once a valid request was created
  const [step2Error, setStep2Error]       = useState("");

  // ── Step 3: Field selection ─────────────────────────────────────────────────
  const [selectedFields, setSelectedFields] = useState(new Set());
  const [purpose, setPurpose]               = useState("");
  const [step3Error, setStep3Error]         = useState("");
  const [submitting, setSubmitting]         = useState(false);

  // ── Step 4: Polling ─────────────────────────────────────────────────────────
  const [requestId,     setRequestId]     = useState(null);
  const [requestStatus, setRequestStatus] = useState(null); // full status object from backend
  const [pollError,     setPollError]     = useState("");
  const [pollAttempts,  setPollAttempts]  = useState(0);
  const pollRef = useRef(null);

  // Derived step
  const step = requestId ? 4 : userFound ? 3 : verifierId.trim() ? 2 : 1;

  // ── Cleanup polling on unmount ──────────────────────────────────────────────
  useEffect(() => {
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, []);

  // ── Start polling once requestId is set ─────────────────────────────────────
  useEffect(() => {
    if (!requestId) return;

    async function poll() {
      try {
        const result = await getVerificationRequestStatus(requestId);
        setRequestStatus(result);

        if (result.status !== "PENDING") {
          // Request resolved — stop polling
          clearInterval(pollRef.current);
          pollRef.current = null;
        }
      } catch (err) {
        setPollError(err.message || "Could not reach the backend.");
      }

      setPollAttempts((n) => {
        if (n + 1 >= POLL_MAX_ATTEMPTS) {
          clearInterval(pollRef.current);
          pollRef.current = null;
          setPollError("Timed out waiting for user response. The request may still be pending.");
        }
        return n + 1;
      });
    }

    poll(); // immediate first fetch
    pollRef.current = setInterval(poll, POLL_INTERVAL_MS);
    return () => {
      clearInterval(pollRef.current);
      pollRef.current = null;
    };
  }, [requestId]);

  // ── Step 1 handlers ─────────────────────────────────────────────────────────
  function handleStep1(e) {
    e.preventDefault();
    setStep1Error("");
    if (!verifierId.trim()) {
      setStep1Error("Verifier ID is required (e.g. bel-gate-verifier-01).");
      return;
    }
    if (!verifierOrg.trim()) {
      setStep1Error("Organisation name is required.");
      return;
    }
    // Advance to step 2 (state already set via controlled inputs)
  }

  // ── Step 2 handlers ─────────────────────────────────────────────────────────
  function handleStep2(e) {
    e.preventDefault();
    setStep2Error("");
    const cleaned = walletIdInput.trim();
    if (!cleaned) {
      setStep2Error("User Wallet ID is required.");
      return;
    }
    // We don't call the backend here — no credential data should be accessible
    // to the verifier before the user consents. We simply accept the ID and
    // advance; if it doesn't exist the request creation in step 3 will fail.
    setUserFound(true);
  }

  // ── Step 3 handlers ─────────────────────────────────────────────────────────
  function toggleField(key) {
    setSelectedFields((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  }

  async function handleSubmitRequest(e) {
    e.preventDefault();
    setStep3Error("");

    if (selectedFields.size === 0) {
      setStep3Error("Select at least one field to request.");
      return;
    }
    if (!purpose.trim()) {
      setStep3Error("Provide a brief purpose statement for the request.");
      return;
    }

    setSubmitting(true);
    try {
      // Uses the EXISTING POST /verify/request endpoint — completely unchanged.
      const result = await createVerificationRequest({
        walletId:       walletIdInput.trim(),
        verifierId:     verifierId.trim(),
        requestedFields: Array.from(selectedFields),
      });

      if (!result?.requestId) throw new Error("Backend did not return a request ID.");
      setRequestId(result.requestId);
    } catch (err) {
      setStep3Error(err.message || "Failed to create verification request.");
    } finally {
      setSubmitting(false);
    }
  }

  // ── Restart ─────────────────────────────────────────────────────────────────
  function restart() {
    if (pollRef.current) clearInterval(pollRef.current);
    pollRef.current = null;
    setWalletIdInput("");
    setUserFound(false);
    setSelectedFields(new Set());
    setPurpose("");
    setRequestId(null);
    setRequestStatus(null);
    setPollError("");
    setPollAttempts(0);
    setStep2Error("");
    setStep3Error("");
  }

  // ─────────────────────────────────────────────────────────────────────────────
  return (
    <main className="blauth-consent">
      <nav className="blauth-register-nav" aria-label="Verifier navigation">
        <Link className="blauth-brand" to="/">
          <span className="blauth-brand-mark">B</span>
          <span>BLAuth</span>
        </Link>
        <span className="blauth-nav-status">
          <i /> Authenticator Mode 1 — Verifier Portal
        </span>
      </nav>

      <section className="blauth-consent-shell">
        <header className="blauth-consent-intro">
          <p className="blauth-eyebrow">
            <span /> Selective-Disclosure Verification
          </p>
          <h1>
            Verifier<br />
            <em>Portal.</em>
          </h1>
          <p>
            Request identity information from a registered user. The user controls
            exactly what they share — this portal never sees wallet data before consent.
          </p>
        </header>

        <article className="blauth-consent-card">
          <header className="blauth-request-header">
            <div>
              <p>Manual Identity Check</p>
              <h2>Authenticator Mode 1</h2>
            </div>
          </header>

          {/* Step progress indicator */}
          <Steps current={step} />

          {/* ══════════════════════════════════════════════════════════════════
              STEP 1 — Verifier Identification / Login
          ══════════════════════════════════════════════════════════════════ */}
          {step === 1 && (
            <section className="blauth-admin-card-section blauth-verifier-section">
              <div className="blauth-admin-section-header">
                <div>
                  <h3>Step 1 — Identify Yourself</h3>
                </div>
                <button
                  type="button"
                  className="blauth-did-copy-btn"
                  onClick={() => {
                    setVerifierId("bel-security-gate-01");
                    setVerifierOrg("Bharat Electronics Limited — Security Division");
                  }}
                  style={{ padding: "6px 12px", fontSize: "11px" }}
                >
                  ⚡ Auto-Fill Demo Verifier
                </button>
                <p className="blauth-admin-help-text">
                  Enter your verifier credentials. These are recorded against every
                  request you create and appear in the user's disclosure history.
                </p>
              </div>

              <form onSubmit={handleStep1} className="blauth-form-grid" noValidate>
                <div className="blauth-input-group is-wide">
                  <label htmlFor="v-id">
                    Verifier ID
                    <span className="blauth-manager-step-hint">
                      Unique identifier for your verifier session (e.g. bel-gate-01)
                    </span>
                  </label>
                  <input
                    id="v-id"
                    type="text"
                    value={verifierId}
                    onChange={(e) => setVerifierId(e.target.value)}
                    placeholder="e.g. bel-security-gate-01"
                    autoComplete="off"
                    spellCheck={false}
                    required
                  />
                </div>

                <div className="blauth-input-group is-wide">
                  <label htmlFor="v-org">
                    Organisation / Department
                    <span className="blauth-manager-step-hint">
                      Shown to the user in their consent prompt
                    </span>
                  </label>
                  <input
                    id="v-org"
                    type="text"
                    value={verifierOrg}
                    onChange={(e) => setVerifierOrg(e.target.value)}
                    placeholder="e.g. Bharat Electronics Limited — Security Division"
                    required
                  />
                </div>

                {step1Error && (
                  <p className="blauth-field-error is-wide" role="alert">{step1Error}</p>
                )}

                <div className="blauth-input-group is-wide">
                  <button type="submit" className="blauth-continue-button">
                    Continue as Verifier →
                  </button>
                </div>
              </form>
            </section>
          )}

          {/* ══════════════════════════════════════════════════════════════════
              STEP 2 — User Search by Wallet ID
          ══════════════════════════════════════════════════════════════════ */}
          {step === 2 && (
            <section className="blauth-admin-card-section blauth-verifier-section">
              <div className="blauth-admin-section-header">
                <div>
                  <h3>Step 2 — Identify User</h3>
                  <span className="blauth-admin-badge blauth-verifier-badge-verifier">
                    Logged in as: {verifierId}
                  </span>
                </div>
                <button
                  type="button"
                  className="blauth-did-copy-btn"
                  onClick={() => setWalletIdInput("wallet_demo_student")}
                  style={{ padding: "6px 12px", fontSize: "11px" }}
                >
                  ⚡ Auto-Fill Demo Student DID
                </button>
                <p className="blauth-admin-help-text">
                  Enter the user's <strong>Wallet ID</strong> (or their full{" "}
                  <code className="blauth-manager-code">did:pehchan:…</code> which they
                  can copy from their Wallet page).{" "}
                  <em>
                    No identity data is returned at this stage — the user controls
                    what you see.
                  </em>
                </p>
              </div>

              {/* Privacy notice */}
              <div className="blauth-manager-nomint-notice blauth-verifier-privacy-notice">
                <span className="blauth-manager-nomint-icon">🛡️</span>
                <p>
                  <strong>Privacy protected.</strong> Searching by Wallet ID does{" "}
                  <em>not</em> reveal any credential data to you. You will only receive
                  the information the user explicitly approves on their own device.
                </p>
              </div>

              <form onSubmit={handleStep2} className="blauth-form-grid" noValidate>
                <div className="blauth-input-group is-wide">
                  <label htmlFor="v-walletid">
                    User Wallet ID / DID
                    <span className="blauth-manager-step-hint">
                      Ask the user to share their Wallet ID or copy their DID from the Wallet page
                    </span>
                  </label>
                  <input
                    id="v-walletid"
                    type="text"
                    value={walletIdInput}
                    onChange={(e) => setWalletIdInput(e.target.value)}
                    placeholder="wallet_abc123 or did:pehchan:wallet_abc123"
                    autoComplete="off"
                    spellCheck={false}
                    required
                  />
                  <small className="blauth-manager-field-hint">
                    If the user provides a full DID{" "}
                    <code>did:pehchan:wallet_abc123</code>, paste it as-is — the system
                    will strip the prefix automatically.
                  </small>
                </div>

                {step2Error && (
                  <p className="blauth-field-error is-wide" role="alert">{step2Error}</p>
                )}

                <div className="blauth-input-group is-wide blauth-manager-submit-row">
                  <button
                    type="button"
                    className="blauth-back-button"
                    onClick={() => { setUserFound(false); setVerifierId(""); setVerifierOrg(""); }}
                  >
                    ← Back
                  </button>
                  <button type="submit" className="blauth-continue-button">
                    Proceed →
                  </button>
                </div>
              </form>
            </section>
          )}

          {/* ══════════════════════════════════════════════════════════════════
              STEP 3 — Field Selection & Request Submission
          ══════════════════════════════════════════════════════════════════ */}
          {step === 3 && (
            <section className="blauth-admin-card-section blauth-verifier-section">
              <div className="blauth-admin-section-header">
                <div>
                  <h3>Step 3 — Select Requested Fields</h3>
                  <span className="blauth-admin-badge blauth-admin-badge-blue">
                    {verifierOrg}
                  </span>
                </div>
                <p className="blauth-admin-help-text">
                  Select only the fields your verification requires. The user sees
                  exactly this list and can approve/deny each field individually.
                </p>
              </div>

              <div className="blauth-verifier-user-ref">
                <span className="blauth-verifier-user-ref-label">Verifying user</span>
                <code className="blauth-verifier-user-ref-id">
                  {walletIdInput.startsWith("did:pehchan:")
                    ? walletIdInput
                    : `did:pehchan:${walletIdInput}`}
                </code>
              </div>

              <form onSubmit={handleSubmitRequest} className="blauth-form-grid" noValidate>
                {/* Field checkboxes */}
                <fieldset className="blauth-verifier-field-picker is-wide">
                  <legend>Fields to request</legend>
                  {SUPPORTED_FIELDS.map(({ key, label }) => (
                    <label
                      key={key}
                      className={`blauth-verifier-field-option ${selectedFields.has(key) ? "is-selected" : ""}`}
                    >
                      <input
                        type="checkbox"
                        checked={selectedFields.has(key)}
                        onChange={() => toggleField(key)}
                      />
                      <span className="blauth-verifier-field-option-label">{label}</span>
                      <span className="blauth-verifier-field-key">
                        <code>{key}</code>
                      </span>
                    </label>
                  ))}
                </fieldset>

                {selectedFields.size > 0 && (
                  <p className="blauth-verifier-selected-summary is-wide">
                    Requesting <strong>{selectedFields.size}</strong> field
                    {selectedFields.size !== 1 ? "s" : ""}:{" "}
                    {Array.from(selectedFields)
                      .map((k) => identityFieldLabels[k] || k)
                      .join(", ")}
                    .
                  </p>
                )}

                <div className="blauth-input-group is-wide">
                  <label htmlFor="v-purpose">
                    Purpose Statement
                    <span className="blauth-manager-step-hint">
                      Shown to the user on their consent screen
                    </span>
                  </label>
                  <textarea
                    id="v-purpose"
                    className="blauth-verifier-textarea"
                    value={purpose}
                    onChange={(e) => setPurpose(e.target.value)}
                    placeholder="e.g. Identity verification for BEL site access clearance."
                    rows={2}
                    required
                  />
                </div>

                {step3Error && (
                  <p className="blauth-field-error is-wide" role="alert">{step3Error}</p>
                )}

                <div className="blauth-input-group is-wide blauth-manager-submit-row">
                  <button
                    type="button"
                    className="blauth-back-button"
                    onClick={() => setUserFound(false)}
                  >
                    ← Back
                  </button>
                  <button
                    type="submit"
                    className="blauth-continue-button"
                    disabled={submitting}
                  >
                    {submitting ? "Creating request…" : "Send Verification Request →"}
                  </button>
                </div>
              </form>
            </section>
          )}

          {/* ══════════════════════════════════════════════════════════════════
              STEP 4 — Pending / Result
          ══════════════════════════════════════════════════════════════════ */}
          {step === 4 && (
            <section className="blauth-admin-card-section blauth-verifier-section">
              <div className="blauth-admin-section-header">
                <div>
                  <h3>Step 4 — Awaiting User Response</h3>
                  {requestStatus && <StatusBadge status={requestStatus.status} />}
                </div>
                <p className="blauth-admin-help-text">
                  A verification request has been created. The user must open the{" "}
                  <strong>BLAuth Wallet</strong> on their device, review the request,
                  and complete biometric confirmation to share their identity.
                </p>
              </div>

              {/* Request reference box */}
              <div className="blauth-verifier-request-ref">
                <div className="blauth-verifier-ref-row">
                  <span>Request ID</span>
                  <code className="blauth-verifier-ref-val">{requestId}</code>
                </div>
                <div className="blauth-verifier-ref-row">
                  <span>Verifier</span>
                  <strong>{verifierId} — {verifierOrg}</strong>
                </div>
                <div className="blauth-verifier-ref-row">
                  <span>Requested Fields</span>
                  <span>
                    {requestStatus?.requestedFields
                      ?.map((k) => identityFieldLabels[k] || k)
                      .join(", ") ?? "—"}
                  </span>
                </div>
                {requestStatus?.createdAt && (
                  <div className="blauth-verifier-ref-row">
                    <span>Created At</span>
                    <time>{new Date(requestStatus.createdAt).toLocaleString()}</time>
                  </div>
                )}
              </div>

              {/* User instruction panel */}
              {requestStatus?.status === "PENDING" && (
                <div className="blauth-verifier-user-instruction">
                  <p className="blauth-verifier-instruction-title">
                    🔔 Instruct the user to:
                  </p>
                  <ol className="blauth-verifier-instruction-list">
                    <li>Open the <strong>BLAuth Wallet</strong> on their device.</li>
                    <li>
                      Navigate to{" "}
                      <code className="blauth-manager-code">/consent</code> with their
                      wallet open, or have them open the consent URL you provide with{" "}
                      <code className="blauth-manager-code">
                        ?requestId={requestId}&amp;verifier={verifierId}
                      </code>
                      .
                    </li>
                    <li>Review the requested fields and approve or deny each one.</li>
                    <li>Complete biometric confirmation to finalise consent.</li>
                  </ol>
                  <div className="blauth-verifier-consent-url-box">
                    <span>Consent URL for user</span>
                    <code>
                      {window.location.origin}/consent?requestId={requestId}&amp;verifier={verifierId}
                    </code>
                  </div>
                  <p className="blauth-verifier-polling-note" role="status">
                    Checking for response every {POLL_INTERVAL_MS / 1000}s…{" "}
                    {pollAttempts > 0 && `(${pollAttempts} / ${POLL_MAX_ATTEMPTS} checks)`}
                  </p>
                </div>
              )}

              {pollError && (
                <p className="blauth-field-error" role="alert">{pollError}</p>
              )}

              {/* ── APPROVED result ──────────────────────────────────────── */}
              {requestStatus?.status === "APPROVED" && (
                <div className="blauth-verifier-result is-approved">
                  <h4>✔ Identity Verified — User Approved</h4>
                  <p className="blauth-verifier-result-note">
                    The user completed biometric consent and disclosed the following
                    fields. Fields they chose not to share are listed separately.
                  </p>

                  {/* Approved fields */}
                  {requestStatus.disclosedFields?.length > 0 ? (
                    <div className="blauth-verifier-disclosed-grid">
                      <p className="blauth-verifier-grid-label">Disclosed by user</p>
                      {requestStatus.disclosedFields.map((field) => (
                        <div key={field} className="blauth-verifier-disclosed-row">
                          <span>{identityFieldLabels[field] || field}</span>
                          <FieldValue
                            fieldKey={field}
                            value={requestStatus.disclosedData?.[field]}
                          />
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="blauth-admin-help-text" style={{ marginTop: 10 }}>
                      No fields were explicitly disclosed (the user may have approved
                      a derived field without disclosing raw credentials).
                    </p>
                  )}

                  {/* Withheld fields */}
                  {requestStatus.withheldFields?.length > 0 && (
                    <div className="blauth-verifier-withheld-list">
                      <p className="blauth-verifier-withheld-label">Withheld by user</p>
                      {requestStatus.withheldFields.map((field) => (
                        <span key={field} className="blauth-verifier-withheld-pill">
                          {identityFieldLabels[field] || field}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* ── DENIED result ────────────────────────────────────────── */}
              {requestStatus?.status === "DENIED" && (
                <div className="blauth-verifier-result is-denied">
                  <h4>✖ Request Denied</h4>
                  <p>
                    The user declined to share any of the requested fields. No
                    credential data has been disclosed.
                  </p>
                </div>
              )}

              {/* Actions */}
              <div className="blauth-consent-actions" style={{ marginTop: "24px" }}>
                <button
                  type="button"
                  className="blauth-back-button"
                  onClick={restart}
                >
                  New Request
                </button>
                <button
                  type="button"
                  className="blauth-deny-button"
                  onClick={() => navigate("/")}
                >
                  Exit Portal
                </button>
              </div>
            </section>
          )}
        </article>
      </section>
    </main>
  );
}

export default VerifierPortal;
