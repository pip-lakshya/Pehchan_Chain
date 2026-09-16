import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { compareFaceDescriptors, getFaceDescriptor, loadFaceModels } from "../services/faceRecognition";
import { createBiometricCommitment, getEnrolledDescriptor } from "../services/biometricIdentity";
import { authenticateBiometricCommitment, getWallet, registerIdentity } from "../services/api";

const WALLET_ID_KEY = "blauthWalletId";

function getCameraFailure(error) {
  if (error?.name === "NotAllowedError" || error?.name === "SecurityError") {
    return { status: "denied", message: "Camera access was blocked. Allow camera access in your browser settings, then try again." };
  }
  if (error?.name === "NotFoundError" || error?.name === "OverconstrainedError") {
    return { status: "unavailable", message: "We could not find an available camera on this device." };
  }
  return { status: "error", message: "We could not start your camera. Please check it is available and try again." };
}

function FaceVerify() {
  const navigate = useNavigate();
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const mountedRef = useRef(true);
  const requestIdRef = useRef(0);
  const [cameraState, setCameraState] = useState("requesting");
  const [cameraError, setCameraError] = useState("");
  const [modelsState, setModelsState] = useState("loading");
  const [modelsError, setModelsError] = useState("");
  const [verificationState, setVerificationState] = useState("idle");
  const [verificationError, setVerificationError] = useState("");
  const [backendStatus, setBackendStatus] = useState("");

  const stopCamera = useCallback(() => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
  }, []);

  const startCamera = useCallback(async () => {
    const requestId = ++requestIdRef.current;
    if (!navigator.mediaDevices?.getUserMedia) {
      setCameraState("unavailable");
      setCameraError("Camera access is not supported by this browser.");
      return;
    }

    stopCamera();
    setCameraState("requesting");
    setCameraError("");
    const timeoutId = window.setTimeout(() => {
      if (mountedRef.current && requestId === requestIdRef.current) {
        setCameraState("error");
        setCameraError("The camera request is taking too long. Please try again.");
      }
    }, 15000);

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
      if (!mountedRef.current || requestId !== requestIdRef.current) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.play().catch((error) => console.error("Unable to play the camera stream:", error));
      }
      if (mountedRef.current) setCameraState("ready");
    } catch (error) {
      console.error("Unable to access the camera:", error);
      if (mountedRef.current) {
        const failure = getCameraFailure(error);
        setCameraState(failure.status);
        setCameraError(failure.message);
      }
    } finally {
      window.clearTimeout(timeoutId);
    }
  }, [stopCamera]);

  useEffect(() => {
    mountedRef.current = true;
    const cameraStartTimeout = window.setTimeout(startCamera, 0);
    return () => {
      window.clearTimeout(cameraStartTimeout);
      mountedRef.current = false;
      requestIdRef.current += 1;
      streamRef.current?.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    };
  }, [startCamera]);

  useEffect(() => {
    let isCurrent = true;
    loadFaceModels()
      .then(() => { if (isCurrent) setModelsState("ready"); })
      .catch((error) => {
        console.error("Unable to load local face-recognition models:", error);
        if (isCurrent) {
          setModelsState("error");
          setModelsError("Local face-recognition models could not be loaded. Check your connection and try again.");
        }
      });
    return () => { isCurrent = false; };
  }, []);

  async function captureFace() {
    const video = videoRef.current;
    if (!video || !video.videoWidth || !video.videoHeight || modelsState !== "ready") return;
    setVerificationState("checking");
    setVerificationError("");
    try {
      const currentDescriptor = await getFaceDescriptor(video);
      const referenceDescriptor = await getEnrolledDescriptor();
      if (!referenceDescriptor) throw new Error("Your enrolled local face descriptor is missing. Return to registration to enroll again.");
      const { isMatch } = compareFaceDescriptors(referenceDescriptor, currentDescriptor);
      if (!mountedRef.current) return;
      if (isMatch) {
        try {
          const biometricCommitment = await createBiometricCommitment(referenceDescriptor);
          const savedWalletId = localStorage.getItem(WALLET_ID_KEY);
          let hasCurrentBackendWallet = false;

          if (savedWalletId) {
            try {
              await getWallet(savedWalletId);
              hasCurrentBackendWallet = true;
            } catch {
              // The browser can retain an ID after local data is reset. Do not
              // let that stale value bypass the idempotent registration flow.
              localStorage.removeItem(WALLET_ID_KEY);
            }
          }

          if (hasCurrentBackendWallet) {
            const proof = await authenticateBiometricCommitment(biometricCommitment);
            if (!proof.registered || proof.revoked) throw new Error("Blockchain biometric identity verification failed.");
            if (mountedRef.current) setBackendStatus("Local biometric and blockchain identity verified successfully.");
          } else {
            const savedIdentity = localStorage.getItem("blauthIdentity");
            const identity = savedIdentity ? JSON.parse(savedIdentity) : null;
            if (!identity) throw new Error("Local identity details are unavailable for backend registration.");
            const { walletId } = await registerIdentity({
              verified: true,
              credentials: { name: identity.name, studentId: identity.studentId, email: identity.email, phone: identity.phone, dob: identity.dob },
              biometricCommitment,
            });
            localStorage.setItem(WALLET_ID_KEY, walletId);
            if (mountedRef.current) setBackendStatus("Backend wallet and blockchain biometric commitment registered successfully.");
          }
          if (mountedRef.current) setVerificationState("verified");
        } catch (error) {
          console.error("Backend identity registration failed:", error);
          if (mountedRef.current) {
            setVerificationState("failed");
            setVerificationError("Local biometric matched, but blockchain identity verification could not be completed.");
          }
        }
      } else {
        setVerificationState("failed");
        setVerificationError("The captured face does not match your enrolled local identity. Please try again.");
      }
    } catch (error) {
      console.error("Local face verification failed:", error);
      if (mountedRef.current) {
        setVerificationState("failed");
        setVerificationError(error.message || "We could not verify your face locally. Please try again.");
      }
    }
  }

  const canCapture = cameraState === "ready" && modelsState === "ready" && ["idle", "failed"].includes(verificationState);

  return (
    <main className="blauth-verify">
      <div className="blauth-register-orb blauth-verify-orb-one" />
      <div className="blauth-register-orb blauth-verify-orb-two" />
      <nav className="blauth-register-nav" aria-label="Face verification navigation">
        <Link className="blauth-brand" to="/" aria-label="PehchanChain home"><span className="blauth-brand-mark">P</span><span>PehchanChain</span></Link>
        <span className="blauth-nav-status"><i /> Local-only verification</span>
      </nav>

      <section className="blauth-verify-shell" aria-labelledby="verify-title">
        <header className="blauth-register-intro blauth-verify-intro">
          <p className="blauth-eyebrow"><span /> Step 2 of 3</p>
          <h1 id="verify-title">Verify your<br /><em>identity.</em></h1>
          <p>Use your camera to complete a local verification step. Nothing is sent to a server.</p>
        </header>

        <div className="blauth-verify-card">
          <ol className="blauth-register-progress" aria-label="Registration progress">
            <li className="is-complete"><span>✓</span><strong>Registration</strong></li><li className="is-active"><span>2</span><strong>Face Verification</strong></li><li><span>3</span><strong>Wallet</strong></li>
          </ol>
          <div className="blauth-camera-stage">
            <video ref={videoRef} className="blauth-camera-video" autoPlay muted playsInline aria-label="Live camera preview" />
            <div className="blauth-camera-guide" aria-hidden="true"><span /><span /><span /><span /></div>
            {cameraState === "requesting" && <div className="blauth-camera-overlay"><span className="blauth-loader" /><p>Requesting camera access…</p></div>}
            {["denied", "unavailable", "error"].includes(cameraState) && <div className="blauth-camera-overlay blauth-camera-error"><span>!</span><h2>Camera unavailable</h2><p>{cameraError}</p><button type="button" onClick={startCamera}>Try camera again</button></div>}
            {cameraState === "ready" && modelsState === "loading" && <div className="blauth-camera-overlay"><span className="blauth-loader" /><p>Loading local face-recognition models…</p></div>}
            {modelsState === "error" && <div className="blauth-camera-overlay blauth-camera-error"><span>!</span><h2>Models unavailable</h2><p>{modelsError}</p><button type="button" onClick={() => window.location.reload()}>Try again</button></div>}
            {verificationState === "checking" && <div className="blauth-camera-overlay"><span className="blauth-loader" /><p>Checking locally…</p></div>}
            {verificationState === "failed" && <div className="blauth-camera-overlay blauth-camera-error"><span>!</span><h2>Local verification unsuccessful</h2><p>{verificationError}</p><button type="button" onClick={() => { setVerificationState("idle"); startCamera(); }}>Refresh camera</button></div>}
            {verificationState === "verified" && <div className="blauth-camera-overlay blauth-camera-success"><span>✓</span><h2>Identity verified locally</h2><p>Your camera frame was never uploaded.</p></div>}
          </div>
          <div className="blauth-verify-content">
            <aside className="blauth-privacy-notice"><span aria-hidden="true">⌁</span><p><strong>Your biometric data never leaves this device.</strong> The camera frame is only used for this local demo check.</p></aside>
            {verificationState === "verified" ? (
              <><p className="blauth-enrollment-message" role="status">{backendStatus || "Registering your backend wallet…"}</p>
              <div className="blauth-register-actions"><button className="blauth-back-button" type="button" onClick={() => navigate("/register")}>← Back</button><button className="blauth-continue-button" type="button" onClick={() => navigate("/wallet")}>Continue to Wallet <span>→</span></button></div>
              </>
            ) : (
              <div className="blauth-register-actions"><button className="blauth-back-button" type="button" onClick={() => navigate("/register")}>← Back</button><button className="blauth-continue-button" type="button" disabled={!canCapture} onClick={captureFace}>{verificationState === "checking" ? "Verifying…" : "Capture Face"} <span>→</span></button></div>
            )}
          </div>
        </div>
      </section>
    </main>
  );
}

export default FaceVerify;
