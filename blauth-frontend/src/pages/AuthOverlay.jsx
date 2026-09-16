import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { compareFaceDescriptors, getFaceDescriptor, loadFaceModels } from "../services/faceRecognition";
import { createBiometricCommitment, getEnrolledDescriptor } from "../services/biometricIdentity";
import { authenticateBiometricCommitment, submitConsent } from "../services/api";

const fieldLabels = { name: "Name", studentId: "Student ID", email: "Email", phone: "Phone", dob: "Date of Birth", ageOver18: "Age over 18" };

function AuthOverlay() {
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const requestId = searchParams.get("requestId") || "";
  const request = location.state?.request;
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const [cameraReady, setCameraReady] = useState(false);
  const [modelsReady, setModelsReady] = useState(false);
  const [stage, setStage] = useState("authenticating");
  const [error, setError] = useState("");

  const stopCamera = useCallback(() => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
  }, []);

  async function refreshCamera() {
    setCameraReady(false);
    setError("");
    stopCamera();
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
      streamRef.current = stream;
      videoRef.current.srcObject = stream;
      await videoRef.current.play();
      setCameraReady(true);
    } catch {
      setError("Camera access is required for BLAuth authentication.");
    }
  }

  useEffect(() => {
    let active = true;
    loadFaceModels().then(() => active && setModelsReady(true)).catch(() => active && setError("Local biometric models could not be loaded."));
    navigator.mediaDevices?.getUserMedia({ video: true, audio: false })
      .then(async (stream) => {
        if (!active) return stream.getTracks().forEach((track) => track.stop());
        streamRef.current = stream;
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
        if (active) setCameraReady(true);
      })
      .catch(() => active && setError("Camera access is required for BLAuth authentication."));
    return () => { active = false; stopCamera(); };
  }, [stopCamera]);

  async function authenticate() {
    if (!requestId || !request || !cameraReady || !modelsReady) return;
    setStage("checking");
    setError("");
    try {
      const referenceDescriptor = await getEnrolledDescriptor();
      const currentDescriptor = await getFaceDescriptor(videoRef.current);
      if (!referenceDescriptor || !compareFaceDescriptors(referenceDescriptor, currentDescriptor).isMatch) {
        throw new Error("Your local biometric did not match the enrolled identity.");
      }
      const biometricCommitment = await createBiometricCommitment(referenceDescriptor);
      const proof = await authenticateBiometricCommitment(biometricCommitment);
      if (!proof.registered || proof.revoked) throw new Error("Your blockchain biometric identity is unavailable or revoked.");
      stopCamera();
      setStage("consent");
    } catch (authenticationError) {
      setStage("authenticating");
      setError(authenticationError.message || "BLAuth authentication failed.");
    }
  }

  async function completeConsent(approvedFields) {
    setStage("submitting");
    setError("");
    try {
      const { consentApproved, data } = await submitConsent({ requestId, approvedFields });
      navigate("/developer", { state: { verificationResult: { verified: consentApproved, data } } });
    } catch (consentError) {
      setStage("consent");
      setError(consentError.message || "BLAuth could not submit your consent decision.");
    }
  }

  if (!requestId || !request) {
    return <main className="blauth-consent"><section className="blauth-consent-shell"><article className="blauth-consent-card"><h1>Invalid BLAuth request</h1><p>Start authentication from the Developer Console.</p><Link className="blauth-continue-button" to="/developer">Return to Developer Console</Link></article></section></main>;
  }

  return (
    <main className="blauth-verify">
      <nav className="blauth-register-nav"><Link className="blauth-brand" to="/"><span className="blauth-brand-mark">P</span><span>PehchanChain</span></Link><span className="blauth-nav-status"><i /> User authentication surface</span></nav>
      <section className="blauth-verify-shell">
        <header className="blauth-register-intro"><p className="blauth-eyebrow"><span /> PehchanChain-controlled surface</p><h1>Authenticate<br /><em>with PehchanChain.</em></h1><p><strong>{request.verifier}</strong> wants to verify your identity. It cannot access biometric data, API credentials, or fields you do not approve.</p></header>
        <article className="blauth-verify-card">
          {stage === "authenticating" || stage === "checking" ? <><div className="blauth-camera-stage"><video ref={videoRef} className="blauth-camera-video" autoPlay muted playsInline /><div className="blauth-camera-guide" aria-hidden="true"><span /><span /><span /><span /></div></div><p className="blauth-enrollment-message">{stage === "checking" ? "Checking local biometric and Polygon Amoy identity…" : "Authenticate locally before reviewing the request."}</p><div className="blauth-auth-actions"><button className="blauth-camera-refresh" type="button" onClick={refreshCamera} disabled={stage === "checking"} title="Refresh camera" aria-label="Refresh camera">↻</button><button className="blauth-continue-button" type="button" disabled={!cameraReady || !modelsReady || stage === "checking"} onClick={authenticate}>{stage === "checking" ? "Authenticating…" : "Verify with PehchanChain"}</button></div></> : null}
          {stage === "consent" || stage === "submitting" ? <><header className="blauth-request-header"><div><p>{request.verifier} wants to verify:</p><h2>Only these fields</h2></div></header><div className="blauth-consent-list">{request.requestedFields.map((field) => <div className="blauth-consent-field" key={field}><span>✓ {fieldLabels[field] || field}</span><strong>Requested</strong></div>)}</div><aside className="blauth-privacy-notice"><p><strong>PehchanChain will not share:</strong> date of birth unless requested, phone unless requested, or any biometric data.</p></aside><div className="blauth-consent-actions"><button className="blauth-deny-button" type="button" disabled={stage === "submitting"} onClick={() => completeConsent([])}>Deny</button><button className="blauth-continue-button" type="button" disabled={stage === "submitting"} onClick={() => completeConsent(request.requestedFields)}>{stage === "submitting" ? "Submitting…" : "Approve"}</button></div></> : null}
          {error && <p className="blauth-field-error" role="alert">{error}</p>}
        </article>
      </section>
    </main>
  );
}

export default AuthOverlay;
