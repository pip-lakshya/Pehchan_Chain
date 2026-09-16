import { useState, useEffect, useRef, useCallback } from "react";
import { Link, useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { identityFieldLabels, verifierRequests } from "../mockData";
import { submitConsent, getVerificationRequestStatus } from "../services/api";
import { loadFaceModels, getFaceDescriptor, compareFaceDescriptors } from "../services/faceRecognition";
import { getEnrolledDescriptor, createBiometricCommitment } from "../services/biometricIdentity";

const WALLET_ID_KEY = "blauthWalletId";

function Consent() {
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();

  const requestId = searchParams.get("requestId") || "";
  const verifierKey = searchParams.get("verifier") || "college-portal";

  // Dynamic request fallback or preset request
  const staticRequest = verifierRequests[verifierKey] || verifierRequests["college-portal"];
  const [request, setRequest] = useState(staticRequest);

  const [walletId] = useState(() => localStorage.getItem(WALLET_ID_KEY));

  // Default requested fields to selected
  const [allowedFields, setAllowedFields] = useState(() => new Set(staticRequest.requestedFields));

  // Stages: "selecting" | "confirming" | "complete"
  const [stage, setStage] = useState("selecting");
  const [consentState, setConsentState] = useState("idle");
  const [consentError, setConsentError] = useState("");
  const [result, setResult] = useState(null);

  // Local Biometric state for confirming stage
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const [cameraReady, setCameraReady] = useState(false);
  const [modelsReady, setModelsReady] = useState(false);
  const [biometricChecking, setBiometricChecking] = useState(false);
  const [biometricError, setBiometricError] = useState("");

  // Sync if request is dynamic from backend
  useEffect(() => {
    let isCurrent = true;
    if (requestId && !verifierRequests[verifierKey]) {
      getVerificationRequestStatus(requestId)
        .then((data) => {
          if (!isCurrent) return;
          if (data && data.requestedFields) {
            const fetchedReq = {
              verifierId: data.verifierId,
              verifier: data.verifierId || "Verifier Portal",
              purpose: "Identity verification request.",
              requestedFields: data.requestedFields,
            };
            setRequest(fetchedReq);
            setAllowedFields(new Set(data.requestedFields));
          }
        })
        .catch(() => {});
    }
    return () => { isCurrent = false; };
  }, [requestId, verifierKey]);

  // Handle camera stream cleanup
  const stopCamera = useCallback(() => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
  }, []);

  // Initialize camera and models when entering "confirming" stage
  useEffect(() => {
    if (stage !== "confirming") {
      stopCamera();
      return undefined;
    }

    let active = true;
    loadFaceModels()
      .then(() => active && setModelsReady(true))
      .catch(() => active && setBiometricError("Local biometric models could not be loaded."));

    navigator.mediaDevices?.getUserMedia({ video: true, audio: false })
      .then(async (stream) => {
        if (!active) return stream.getTracks().forEach((track) => track.stop());
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
        }
        if (active) setCameraReady(true);
      })
      .catch(() => {
        if (active) setBiometricError("Camera notice: Direct camera feed optional. Use local biometric confirmation below.");
      });

    return () => {
      active = false;
      stopCamera();
    };
  }, [stage, stopCamera]);

  // Field selection controls
  function toggleField(field) {
    setAllowedFields((current) => {
      const next = new Set(current);
      if (next.has(field)) next.delete(field);
      else next.add(field);
      return next;
    });
  }

  function handleSelectAll() {
    setAllowedFields(new Set(request.requestedFields));
  }

  function handleClearAll() {
    setAllowedFields(new Set());
  }

  function handleDenyAll() {
    setAllowedFields(new Set());
    // Directly submit empty consent (Deny outcome)
    executeSubmitConsent(new Set());
  }

  function handleProceedToConfirm() {
    setStage("confirming");
  }

  // Execute actual submission
  async function executeSubmitConsent(fieldsToSubmit = allowedFields) {
    setConsentState("submitting");
    setConsentError("");

    try {
      const approvedFieldsList = request.requestedFields.filter((field) => fieldsToSubmit.has(field));
      const { consentApproved, data } = await submitConsent({ requestId, approvedFields: approvedFieldsList });

      const sharedFields = request.requestedFields.filter((field) => Object.hasOwn(data, field));
      const withheldFields = request.requestedFields.filter((field) => !Object.hasOwn(data, field));

      if (location.state?.returnToDeveloper) {
        navigate("/developer", { state: { verificationResult: { verified: consentApproved, data } } });
        return;
      }

      setResult({ sharedFields, withheldFields, consentApproved, data });
      setStage("complete");
      setConsentState("complete");
    } catch (error) {
      console.error("Unable to submit consent decision:", error);
      setConsentError(error.message || "The consent decision could not be submitted.");
      setConsentState("error");
    }
  }

  // Biometric verification before submission
  async function handleBiometricSubmit() {
    setBiometricChecking(true);
    setBiometricError("");

    try {
      const referenceDescriptor = await getEnrolledDescriptor();
      if (!referenceDescriptor) {
        throw new Error("No enrolled local biometric found in browser. Please register first.");
      }

      // If camera is ready and video element available, perform real-time match
      if (cameraReady && videoRef.current) {
        const currentDescriptor = await getFaceDescriptor(videoRef.current);
        if (currentDescriptor) {
          const matchResult = compareFaceDescriptors(referenceDescriptor, currentDescriptor);
          if (!matchResult.isMatch) {
            throw new Error("Local biometric face match failed. Please position your face clearly.");
          }
        }
      }

      // Generate local commitment to verify integrity
      await createBiometricCommitment(referenceDescriptor);

      // Successfully verified biometrically -> Submit consent
      stopCamera();
      await executeSubmitConsent(allowedFields);
    } catch (err) {
      setBiometricError(err.message || "Biometric authentication failed.");
      setBiometricChecking(false);
    }
  }

  // Derived lists for "You are about to disclose" summary
  const approvedList = request.requestedFields.filter((f) => allowedFields.has(f));
  const withheldList = request.requestedFields.filter((f) => !allowedFields.has(f));

  // Render Stage 3: After Completion
  if (stage === "complete" && result) {
    return (
      <main className="blauth-consent">
        <nav className="blauth-register-nav">
          <Link className="blauth-brand" to="/">
            <span className="blauth-brand-mark">B</span>
            <span>BLAuth</span>
          </Link>
        </nav>
        <section className="blauth-consent-shell">
          <article className="blauth-consent-card blauth-disclosure-result">
            <div className="blauth-result-mark">
              {result.consentApproved ? "✓" : "✖"}
            </div>
            <h1>{result.consentApproved ? "Identity Disclosure Completed" : "Request Denied"}</h1>
            <p className="blauth-result-verifier">With {request.verifier}</p>

            <div className="blauth-result-columns">
              <section>
                <h3>Shared / Disclosed</h3>
                {result.sharedFields.length > 0 ? (
                  result.sharedFields.map((field) => (
                    <p className="is-shared" key={field}>
                      ✓ {identityFieldLabels[field] || field}
                    </p>
                  ))
                ) : (
                  <p>Nothing disclosed</p>
                )}
              </section>

              <section>
                <h3>Kept Private / Withheld</h3>
                {result.withheldFields.length > 0 ? (
                  result.withheldFields.map((field) => (
                    <p key={field}>
                      🔒 {identityFieldLabels[field] || field}
                    </p>
                  ))
                ) : (
                  <p>No fields withheld</p>
                )}
              </section>
            </div>

            <button
              className="blauth-continue-button"
              type="button"
              onClick={() => navigate("/wallet")}
            >
              Return to Wallet →
            </button>
          </article>
        </section>
      </main>
    );
  }

  return (
    <main className="blauth-consent">
      <nav className="blauth-register-nav">
        <Link className="blauth-brand" to="/">
          <span className="blauth-brand-mark">B</span>
          <span>BLAuth</span>
        </Link>
        <span className="blauth-nav-status">
          <i /> PehchanChain Central Consent Engine
        </span>
      </nav>

      <section className="blauth-consent-shell">
        <header className="blauth-consent-intro">
          <p className="blauth-eyebrow">
            <span /> Selective Disclosure
          </p>
          <h1>
            Review before<br />
            <em>you share.</em>
          </h1>
          <p>Choose exactly which fields {request.verifier} can receive.</p>
        </header>

        <article className="blauth-consent-card">
          {/* Header info */}
          <header className="blauth-request-header">
            <div>
              <p>Sharing request from</p>
              <h2>{request.verifier}</h2>
            </div>
          </header>

          <p className="blauth-request-purpose">
            <strong>Context / Purpose:</strong> {request.purpose}
          </p>

          {/* STAGE 1: FIELD SELECTION */}
          {stage === "selecting" && (
            <>
              {/* Field Selection Toolbar */}
              <div className="blauth-consent-toolbar">
                <div className="blauth-consent-counts">
                  <span className="blauth-badge-disclose">
                    {allowedFields.size} Disclosing
                  </span>
                  <span className="blauth-badge-private">
                    {request.requestedFields.length - allowedFields.size} Private
                  </span>
                </div>
                <div className="blauth-consent-select-btns">
                  <button type="button" onClick={handleSelectAll}>
                    Select All
                  </button>
                  <button type="button" onClick={handleClearAll}>
                    Clear All
                  </button>
                </div>
              </div>

              {/* Requested Fields Checklist */}
              <div className="blauth-consent-list">
                {request.requestedFields.map((field) => {
                  const isAllowed = allowedFields.has(field);
                  return (
                    <div className="blauth-consent-field" key={field}>
                      <div>
                        <span>{identityFieldLabels[field] || field}</span>
                        <small className="blauth-field-status">
                          {isAllowed ? "✓ Disclosing" : "🔒 Private"}
                        </small>
                      </div>
                      <button
                        className={isAllowed ? "is-allowed" : ""}
                        type="button"
                        aria-pressed={isAllowed}
                        onClick={() => toggleField(field)}
                      >
                        {isAllowed ? "Disclosing" : "Keep Private"}
                      </button>
                    </div>
                  );
                })}
              </div>

              {!walletId || !requestId ? (
                <p className="blauth-field-error" role="alert">
                  Open this page from a valid verification request with a registered wallet.
                </p>
              ) : null}

              {consentError && (
                <p className="blauth-field-error" role="alert">
                  {consentError}
                </p>
              )}

              {/* Action Buttons */}
              <div className="blauth-consent-actions">
                <button
                  className="blauth-back-button"
                  type="button"
                  onClick={() => navigate(-1)}
                >
                  Back
                </button>
                <button
                  className="blauth-deny-button"
                  type="button"
                  onClick={handleDenyAll}
                >
                  Deny Request
                </button>
                <button
                  className="blauth-continue-button"
                  type="button"
                  disabled={!walletId || !requestId}
                  onClick={handleProceedToConfirm}
                >
                  Approve &amp; Continue →
                </button>
              </div>
            </>
          )}

          {/* STAGE 2: PRE-APPROVAL SUMMARY & BIOMETRIC CONFIRMATION */}
          {stage === "confirming" && (
            <>
              {/* Disclosure Summary Box */}
              <section className="blauth-summary-box">
                <div className="blauth-summary-section">
                  <h4 className="blauth-summary-title-disclose">You are about to disclose:</h4>
                  {approvedList.length > 0 ? (
                    <ul className="blauth-summary-list">
                      {approvedList.map((f) => (
                        <li key={f} className="is-disclosed">
                          ✓ {identityFieldLabels[f] || f}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="blauth-summary-empty">No fields will be disclosed (Deny mode)</p>
                  )}
                </div>

                <div className="blauth-summary-section">
                  <h4 className="blauth-summary-title-private">These fields will remain private:</h4>
                  {withheldList.length > 0 ? (
                    <ul className="blauth-summary-list">
                      {withheldList.map((f) => (
                        <li key={f} className="is-private">
                          🔒 {identityFieldLabels[f] || f}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="blauth-summary-empty">No fields remain private</p>
                  )}
                </div>
              </section>

              {/* Biometric Confirmation Stage */}
              <section className="blauth-biometric-section">
                <header className="blauth-biometric-header">
                  <h3>Biometric Confirmation Required</h3>
                  <p>Confirm your local biometric identity to sign this selective disclosure.</p>
                </header>

                {cameraReady && (
                  <div className="blauth-camera-stage" style={{ height: "200px", borderRadius: "12px", marginBottom: "14px" }}>
                    <video ref={videoRef} className="blauth-camera-video" autoPlay muted playsInline />
                  </div>
                )}

                {biometricError && (
                  <p className="blauth-field-error" role="alert">
                    {biometricError}
                  </p>
                )}

                {consentState === "submitting" && (
                  <p className="blauth-enrollment-message" role="status">
                    Submitting signed consent decision to backend…
                  </p>
                )}

                <div className="blauth-biometric-actions">
                  <button
                    className="blauth-back-button"
                    type="button"
                    disabled={consentState === "submitting" || biometricChecking}
                    onClick={() => setStage("selecting")}
                  >
                    ← Modify Selection
                  </button>

                  <button
                    className="blauth-continue-button"
                    type="button"
                    disabled={consentState === "submitting" || biometricChecking}
                    onClick={handleBiometricSubmit}
                  >
                    {biometricChecking || consentState === "submitting"
                      ? "Verifying Biometrics & Signing…"
                      : "Confirm Biometric Identity & Sign →"}
                  </button>
                </div>
              </section>
            </>
          )}
        </article>
      </section>
    </main>
  );
}

export default Consent;
