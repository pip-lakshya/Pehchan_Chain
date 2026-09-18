import { useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { createDeveloperApp, createDeveloperVerificationRequest } from "../services/api";
import { identityFieldLabels } from "../mockData";

const WALLET_ID_KEY = "blauthWalletId";

const verifierOptions = {
  "college-portal": {
    verifier: "Campus Access & College Portal",
    requestedFields: ["name", "studentId"],
    fieldLabels: ["Name", "Student ID"],
  },
  "student-services": {
    verifier: "BEL Student & Defense Services",
    requestedFields: ["name", "studentId", "phone"],
    fieldLabels: ["Name", "Student ID", "Phone Number"],
  },
  "age-restricted-service": {
    verifier: "Age-Restricted Verification",
    requestedFields: ["ageOver18"],
    fieldLabels: ["Age Over 18 (Derived)"],
  },
  "full-verification": {
    verifier: "Comprehensive Identity Verification",
    requestedFields: ["name", "studentId", "email", "phone"],
    fieldLabels: ["Name", "Student ID", "Email", "Phone Number"],
  },
};

const sdkSnippet = `// PehchanChain SDK (Mode 2 Integration)
import { PehchanChain } from "@pehchan/sdk";

const result = await PehchanChain.authenticate({
  apiKey: "blauth_pk_live_...",
  requestedFields: ["name", "studentId"]
});

// Returns ONLY user-approved fields after biometric consent
console.log(result.data);`;

function DeveloperDashboard() {
  const navigate = useNavigate();
  const location = useLocation();

  const [walletId] = useState(() => localStorage.getItem(WALLET_ID_KEY));
  const [developerApp, setDeveloperApp] = useState(null);
  const [appState, setAppState] = useState("idle");
  const [appError, setAppError] = useState("");

  const [verifierId, setVerifierId] = useState("college-portal");
  const [requestState, setRequestState] = useState("idle");
  const [requestError, setRequestError] = useState("");
  const [createdRequest, setCreatedRequest] = useState(null);
  const [verificationResult] = useState(() => location.state?.verificationResult || null);

  const selectedVerifier = verifierOptions[verifierId];

  // Developer Registration via API
  async function handleConnectDeveloperApp() {
    if (appState === "creating") return;
    setAppState("creating");
    setAppError("");
    try {
      const app = await createDeveloperApp({ name: "BEL Defense Partner Application" });
      setDeveloperApp(app);
      setAppState("ready");
    } catch (error) {
      setAppError(error.message || "The developer application could not be created.");
      setAppState("error");
    }
  }

  // SDK Request Creation via API credentials
  async function handleCreateRequest() {
    if (!walletId || !developerApp || requestState === "creating") return;
    setRequestState("creating");
    setRequestError("");
    setCreatedRequest(null);

    try {
      const { requestId } = await createDeveloperVerificationRequest({
        walletId,
        requestedFields: selectedVerifier.requestedFields,
        apiKey: developerApp.apiKey,
        apiSecret: developerApp.apiSecret,
      });

      setCreatedRequest({ requestId, ...selectedVerifier });
      setRequestState("created");
    } catch (error) {
      setRequestError(error.message || "The verification request could not be created.");
      setRequestState("error");
    }
  }

  function handleVerifierChange(event) {
    setVerifierId(event.target.value);
    setCreatedRequest(null);
    setRequestError("");
    setRequestState("idle");
  }

  function openCentralConsentSurface() {
    if (!createdRequest) return;
    navigate(`/consent?requestId=${encodeURIComponent(createdRequest.requestId)}&verifier=${encodeURIComponent(verifierId)}`, {
      state: {
        returnToDeveloper: true,
        request: {
          verifier: createdRequest.verifier,
          requestedFields: createdRequest.requestedFields,
        },
      },
    });
  }

  return (
    <main className="blauth-consent">
      <nav className="blauth-register-nav" aria-label="Developer navigation">
        <span className="blauth-nav-status">
          <i /> PehchanChain SDK &amp; Developer Console (Mode 2)
        </span>
      </nav>

      <section className="blauth-consent-shell">
        <header className="blauth-consent-intro">
          <p className="blauth-eyebrow">
            <span /> PehchanChain SDK (Mode 2)
          </p>
          <h1>
            Developer<br />
            <em>Console.</em>
          </h1>
          <p>
            Integrate PehchanChain zero-trust authentication. Your app creates requests
            via API credentials; PehchanChain owns user consent and biometric authentication.
          </p>
        </header>

        <article className="blauth-consent-card">
          <header className="blauth-request-header">
            <div>
              <p>SDK Mode 2 Application Testbed</p>
              <h2>{selectedVerifier.verifier}</h2>
            </div>
            <span className="blauth-admin-badge blauth-admin-badge-blue">
              SDK MODE 2
            </span>
          </header>

          <p className="blauth-request-purpose">
            Test SDK authentication. Developer credentials create a signed request on the backend;
            the user is handed off to the central PehchanChain Consent surface for biometric sign-off.
          </p>

          {/* Preset Verifier Selector */}
          <div className="blauth-input-group is-wide">
            <label htmlFor="developer-verifier">Demo SDK Integration Profile</label>
            <select
              id="developer-verifier"
              value={verifierId}
              onChange={handleVerifierChange}
              disabled={requestState === "creating"}
            >
              {Object.entries(verifierOptions).map(([id, option]) => (
                <option key={id} value={id}>
                  {option.verifier}
                </option>
              ))}
            </select>
          </div>

          {/* Attribute List */}
          <div className="blauth-consent-list">
            {selectedVerifier.requestedFields.map((field) => (
              <div className="blauth-consent-field" key={field}>
                <span>{identityFieldLabels[field] || field}</span>
                <span className="blauth-asset-category-pill">REQUESTED</span>
              </div>
            ))}
          </div>

          {/* Developer Registration Status */}
          {!developerApp && (
            <div className="blauth-developer-setup-box">
              <p>Step 1: Register Developer App &amp; Obtain API Credentials</p>
              <button
                className="blauth-continue-button"
                type="button"
                disabled={appState === "creating"}
                onClick={handleConnectDeveloperApp}
              >
                {appState === "creating" ? "Provisioning App Credentials..." : "Register Demo SDK App →"}
              </button>
            </div>
          )}

          {developerApp && (
            <div className="blauth-admin-success-box">
              <h4>✔ SDK Application Credentials Active</h4>
              <p>App ID: <code>{developerApp.appId}</code></p>
              <p>API Key: <code>{developerApp.apiKey}</code></p>
              <p>API Secret: <code>{developerApp.apiSecret.slice(0, 14)}••••••••</code></p>
              <small>Secrets are hashed on backend and never exposed to the end user.</small>
            </div>
          )}

          {appError && <p className="blauth-field-error" role="alert">{appError}</p>}
          {!walletId && <p className="blauth-field-error" role="alert">Please create a user wallet identity first to test verification.</p>}
          {requestError && <p className="blauth-field-error" role="alert">{requestError}</p>}

          {/* Action Buttons */}
          <div className="blauth-consent-actions" style={{ marginTop: "20px" }}>
            <button className="blauth-back-button" type="button" onClick={() => navigate(-1)}>
              Back
            </button>
            <button
              className="blauth-continue-button"
              type="button"
              disabled={!walletId || !developerApp || requestState === "creating"}
              onClick={handleCreateRequest}
            >
              {requestState === "creating" ? "Initiating SDK Request..." : "Initiate PehchanChain SDK Auth →"}
            </button>
          </div>

          {/* Created Request Ready */}
          {createdRequest && (
            <section className="blauth-disclosure-result" style={{ marginTop: "24px" }} aria-live="polite">
              <h3>✔ SDK Request Generated</h3>
              <p className="blauth-result-verifier">Request ID: <code>{createdRequest.requestId}</code></p>
              <p style={{ fontSize: "12px", color: "#546482", marginBottom: "16px" }}>
                Handing user off to central PehchanChain consent engine. The developer cannot bypass consent or access biometric data.
              </p>
              <button className="blauth-continue-button" type="button" onClick={openCentralConsentSurface}>
                Open Central Consent Surface →
              </button>
            </section>
          )}

          {/* Verification Result Callback */}
          {verificationResult && (
            <section className="blauth-admin-card-section" style={{ marginTop: "24px" }} aria-live="polite">
              <h3>Returned SDK Verification Payload</h3>
              <p className="blauth-admin-help-text" style={{ marginBottom: "12px" }}>
                The application receives ONLY fields approved by the user during selective disclosure:
              </p>

              {verificationResult.verified ? (
                <div className="blauth-admin-success-box">
                  <h4>Status: APPROVED</h4>
                  {Object.entries(verificationResult.data).map(([field, value]) => (
                    <div key={field} className="blauth-asset-meta-row" style={{ marginTop: "4px" }}>
                      <span>{identityFieldLabels[field] || field}:</span>
                      <strong>{String(value)}</strong>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="blauth-field-error">
                  Status: DENIED — User refused disclosure or withholding applied.
                </div>
              )}
            </section>
          )}

          {/* Conceptual Code Snippet */}
          <section className="blauth-integration-example" aria-label="PehchanChain SDK Integration Code Example">
            <p>PehchanChain.authenticate() Integration Code</p>
            <pre><code>{sdkSnippet}</code></pre>
            <small>PehchanChain SDK enforces selective disclosure and user consent prior to assertion delivery.</small>
          </section>
        </article>
      </section>
    </main>
  );
}

export default DeveloperDashboard;
