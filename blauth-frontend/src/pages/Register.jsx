import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { getFaceDescriptor, loadFaceModels } from "../services/faceRecognition";
import { saveEnrolledDescriptor } from "../services/biometricIdentity";

const initialFormData = { name: "", email: "", college: "", studentId: "", dob: "", phone: "" };
const fields = [
  { name: "name", label: "Full Name", type: "text", placeholder: "Enter your full name", autoComplete: "name", wide: true },
  { name: "email", label: "Email", type: "email", placeholder: "you@example.com", autoComplete: "email", wide: true },
  { name: "college", label: "College", type: "text", placeholder: "Your college or university", autoComplete: "organization" },
  { name: "studentId", label: "Student ID", type: "text", placeholder: "e.g. STU-2026-041", autoComplete: "off" },
  { name: "dob", label: "Date of Birth", type: "date", autoComplete: "bday" },
  { name: "phone", label: "Phone Number", type: "tel", placeholder: "10-digit phone number", autoComplete: "tel", inputMode: "tel" },
];

function validate(formData) {
  const errors = {};
  const phoneDigits = formData.phone.replace(/\D/g, "");
  Object.entries(formData).forEach(([name, value]) => { if (!value.trim()) errors[name] = "This field is required."; });
  if (formData.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) errors.email = "Enter a valid email address.";
  if (formData.phone && (phoneDigits.length < 10 || phoneDigits.length > 15)) errors.phone = "Enter a valid phone number.";
  return errors;
}

function Register() {
  const navigate = useNavigate();
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const mountedRef = useRef(true);
  const [formData, setFormData] = useState(initialFormData);
  const [errors, setErrors] = useState({});
  const [modelsState, setModelsState] = useState("loading");
  const [cameraState, setCameraState] = useState("idle");
  const [enrollmentState, setEnrollmentState] = useState("idle");
  const [enrollmentMessage, setEnrollmentMessage] = useState("Enroll one face locally before continuing.");

  const stopCamera = useCallback(() => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
  }, []);

  const startEnrollmentCamera = useCallback(async () => {
    if (!navigator.mediaDevices?.getUserMedia) {
      setCameraState("error");
      setEnrollmentMessage("Camera access is not supported by this browser.");
      return;
    }
    stopCamera();
    setCameraState("requesting");
    setEnrollmentMessage("Requesting camera access…");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
      if (!mountedRef.current) { stream.getTracks().forEach((track) => track.stop()); return; }
      streamRef.current = stream;
      videoRef.current.srcObject = stream;
      await videoRef.current.play();
      if (mountedRef.current) {
        setCameraState("ready");
        setEnrollmentMessage("Center only your face in the guide, then capture it.");
      }
    } catch (error) {
      console.error("Unable to access enrollment camera:", error);
      if (mountedRef.current) {
        setCameraState("error");
        setEnrollmentMessage(error.name === "NotAllowedError" ? "Camera access was blocked. Allow it in your browser settings and try again." : "We could not start your camera. Please try again.");
      }
    }
  }, [stopCamera]);

  useEffect(() => {
    mountedRef.current = true;
    loadFaceModels()
      .then(() => { if (mountedRef.current) setModelsState("ready"); })
      .catch((error) => {
        console.error("Unable to load local face-recognition models:", error);
        if (mountedRef.current) {
          setModelsState("error");
          setEnrollmentMessage("Local face-recognition models could not be loaded. Refresh and try again.");
        }
      });
    return () => {
      mountedRef.current = false;
      stopCamera();
    };
  }, [stopCamera]);

  function handleChange(event) {
    const { name, value } = event.target;
    setFormData((current) => ({ ...current, [name]: value }));
    if (errors[name]) setErrors((current) => ({ ...current, [name]: undefined }));
  }

  async function captureEnrollmentFace() {
    if (!videoRef.current || cameraState !== "ready" || modelsState !== "ready") return;
    setEnrollmentState("capturing");
    setEnrollmentMessage("Creating your local face descriptor…");
    try {
      const descriptor = await getFaceDescriptor(videoRef.current);
      await saveEnrolledDescriptor(descriptor);
      if (mountedRef.current) {
        setEnrollmentState("enrolled");
        setEnrollmentMessage("Face enrolled locally. No image was saved.");
      }
    } catch (error) {
      console.error("Local face enrollment failed:", error);
      if (mountedRef.current) {
        setEnrollmentState("error");
        setEnrollmentMessage(error.message || "We could not enroll your face. Please try again.");
      }
    }
  }

  function handleSubmit(event) {
    event.preventDefault();
    const nextErrors = validate(formData);
    if (Object.keys(nextErrors).length) { setErrors(nextErrors); return; }
    if (enrollmentState !== "enrolled") {
      setEnrollmentMessage("Please enroll one face locally before continuing.");
      return;
    }
    localStorage.setItem("blauthIdentity", JSON.stringify(formData));
    navigate("/verify");
  }

  const canEnroll = modelsState === "ready" && cameraState === "ready" && !["capturing", "enrolled"].includes(enrollmentState);

  function handleFillDemo() {
    setFormData({
      name: "Rajesh Kumar",
      email: "rajesh.kumar@bel.co.in",
      college: "Bharat Electronics Training Institute",
      studentId: "BEL-2026-001",
      dob: "2002-05-15",
      phone: "+919876543210",
    });
    setErrors({});
  }

  return (
    <main className="blauth-register">
      <div className="blauth-register-orb blauth-register-orb-one" /><div className="blauth-register-orb blauth-register-orb-two" />
      <nav className="blauth-register-nav" aria-label="Registration navigation">
        <span className="blauth-nav-status"><i /> Privacy-first identity</span>
      </nav>
      <section className="blauth-register-shell" aria-labelledby="register-title">
        <header className="blauth-register-intro"><p className="blauth-eyebrow"><span /> Step 1 of 3</p><h1 id="register-title">Create your<br /><em>identity.</em></h1><p>Start with the details you choose to keep in your private identity wallet.</p></header>
        <div className="blauth-register-card">
          <ol className="blauth-register-progress" aria-label="Registration progress"><li className="is-active"><span>1</span><strong>Registration</strong></li><li><span>2</span><strong>Face Verification</strong></li><li><span>3</span><strong>Wallet</strong></li></ol>
          <form className="blauth-register-form" noValidate onSubmit={handleSubmit}>
            <div className="blauth-form-heading">
              <div>
                <h2>Your details</h2>
                <p>All fields are required.</p>
              </div>
              <button type="button" className="blauth-did-copy-btn" onClick={handleFillDemo} style={{ padding: "6px 12px", fontSize: "11px" }}>
                ⚡ Auto-Fill Demo Profile
              </button>
            </div>
            <div className="blauth-form-grid">{fields.map((field) => { const error = errors[field.name]; return <div className={`blauth-input-group${field.wide ? " is-wide" : ""}`} key={field.name}><label htmlFor={field.name}>{field.label}</label><input {...field} id={field.name} value={formData[field.name]} onChange={handleChange} aria-invalid={Boolean(error)} aria-describedby={error ? `${field.name}-error` : undefined} />{error && <p className="blauth-field-error" id={`${field.name}-error`} role="alert">{error}</p>}</div>; })}</div>
            <section className="blauth-enrollment-block" aria-labelledby="enrollment-title">
              <div className="blauth-form-heading"><h2 id="enrollment-title">Enroll your face</h2><p>Stored on this device only.</p></div>
              <div className="blauth-camera-stage blauth-enrollment-camera">
                <video ref={videoRef} className="blauth-camera-video" autoPlay muted playsInline aria-label="Enrollment camera preview" />
                <div className="blauth-camera-guide" aria-hidden="true"><span /><span /><span /><span /></div>
                {modelsState === "loading" && <div className="blauth-camera-overlay"><span className="blauth-loader" /><p>Loading local face-recognition models…</p></div>}
                {modelsState === "error" && <div className="blauth-camera-overlay blauth-camera-error"><span>!</span><h2>Models unavailable</h2><p>{enrollmentMessage}</p></div>}
                {modelsState === "ready" && cameraState !== "ready" && <div className="blauth-camera-overlay blauth-camera-error"><span>!</span><h2>{cameraState === "error" ? "Camera unavailable" : "Camera is off"}</h2><p>{enrollmentMessage}</p><button type="button" onClick={startEnrollmentCamera}>{cameraState === "requesting" ? "Requesting…" : "Start camera"}</button></div>}
                {enrollmentState === "capturing" && <div className="blauth-camera-overlay"><span className="blauth-loader" /><p>Creating your local face descriptor…</p></div>}
                {enrollmentState === "enrolled" && <div className="blauth-camera-overlay blauth-camera-success"><span>✓</span><h2>Face enrolled locally</h2><p>No photo was saved or uploaded.</p></div>}
              </div>
              <p className={`blauth-enrollment-message${enrollmentState === "error" ? " is-error" : ""}`} role={enrollmentState === "error" ? "alert" : undefined}>{enrollmentMessage}</p>
              {enrollmentState !== "enrolled" && <button className="blauth-enroll-button" type="button" disabled={!canEnroll} onClick={captureEnrollmentFace}>{enrollmentState === "capturing" ? "Enrolling…" : "Capture enrollment face"}</button>}
            </section>
            <aside className="blauth-privacy-notice"><span aria-hidden="true">⌁</span><p><strong>Your biometric data stays on your device.</strong> PehchanChain only moves forward with details you approve.</p></aside>
            <div className="blauth-register-actions"><button className="blauth-back-button" type="button" onClick={() => navigate("/")}>← Back</button><button className="blauth-continue-button" type="submit">Continue <span>→</span></button></div>
          </form>
        </div>
      </section>
    </main>
  );
}

export default Register;
