import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { verifyAgeOver18 } from "../services/api";

const WALLET_ID_KEY = "blauthWalletId";

function VerifierAge() {
  const navigate = useNavigate();
  const [walletId] = useState(() => localStorage.getItem(WALLET_ID_KEY));
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");
  const [verificationState, setVerificationState] = useState("idle");

  async function verifyAge() {
    if (!walletId) return;
    setVerificationState("checking");
    setError("");

    try {
      const disclosure = await verifyAgeOver18(walletId);
      setResult({ ageOver18: disclosure.ageOver18 });
      setVerificationState("complete");
    } catch (verificationError) {
      console.error("Unable to complete backend age verification:", verificationError);
      setError(verificationError.message || "Age verification could not be completed.");
      setVerificationState("error");
    }
  }

  if (!walletId) {
    return <main className="blauth-consent"><nav className="blauth-register-nav" aria-label="Age verifier navigation"><Link className="blauth-brand" to="/" aria-label="PehchanChain home"><span className="blauth-brand-mark">P</span><span>PehchanChain</span></Link></nav><section className="blauth-consent-empty" aria-labelledby="age-empty-title"><p className="blauth-eyebrow"><span /> Derived disclosure</p><h1 id="age-empty-title">No backend<br /><em>wallet found.</em></h1><p>Complete local face verification to register your backend wallet before checking age eligibility.</p><Link className="blauth-button blauth-button-primary" to="/register">Create Identity <span>→</span></Link></section></main>;
  }

  if (result) {
    const isEligible = result.ageOver18;
    return (
      <main className="blauth-consent">
        <nav className="blauth-register-nav" aria-label="Age verifier navigation"><Link className="blauth-brand" to="/" aria-label="PehchanChain home"><span className="blauth-brand-mark">P</span><span>PehchanChain</span></Link><span className="blauth-nav-status"><i /> Derived data only</span></nav>
        <section className="blauth-consent-shell" aria-labelledby="age-result-title">
          <header className="blauth-consent-intro"><p className="blauth-eyebrow"><span /> Age verification complete</p><h1 id="age-result-title">Age checked,<br /><em>privacy kept.</em></h1><p>The service received only an eligibility result, never your date of birth.</p></header>
          <article className="blauth-consent-card blauth-disclosure-result">
            <div className="blauth-result-mark">{isEligible ? "✓" : "×"}</div><h2>Age verification complete</h2><p className="blauth-result-verifier">{isEligible ? "✓ Age requirement satisfied" : "✕ Age requirement not satisfied"}</p>
            <div className="blauth-result-columns">
              <section><h3>Shared</h3><p className="is-shared">✓ Age over 18: {String(isEligible)}</p></section>
              <section><h3>Not shared</h3><p>○ Date of Birth</p><p>○ Name</p><p>○ Email</p><p>○ Phone</p><p>○ College</p><p>○ Student ID</p></section>
            </div>
            <button className="blauth-continue-button" type="button" onClick={() => navigate("/wallet")}>Return to Wallet <span>→</span></button>
          </article>
        </section>
      </main>
    );
  }

  return (
    <main className="blauth-consent">
      <div className="blauth-register-orb blauth-consent-orb-one" /><div className="blauth-register-orb blauth-consent-orb-two" />
      <nav className="blauth-register-nav" aria-label="Age verifier navigation"><Link className="blauth-brand" to="/" aria-label="PehchanChain home"><span className="blauth-brand-mark">P</span><span>PehchanChain</span></Link><span className="blauth-nav-status"><i /> Derived data only</span></nav>
      <section className="blauth-consent-shell" aria-labelledby="age-title">
          <header className="blauth-consent-intro"><p className="blauth-eyebrow"><span /> Derived disclosure</p><h1 id="age-title">Prove your age,<br /><em>not your birthday.</em></h1><p>PehchanChain derives this result from your identity wallet without sharing your date of birth or any other identity detail.</p></header>
        <article className="blauth-consent-card">
          <header className="blauth-request-header"><span className="blauth-request-mark">18+</span><div><p>Verification request from</p><h2>Age-Restricted Service</h2></div></header>
          <p className="blauth-request-purpose">Are you over 18?</p>
          <div className="blauth-consent-list"><div className="blauth-consent-field"><span>Age over 18</span><strong>Derived by wallet</strong></div></div>
          <aside className="blauth-privacy-notice"><span aria-hidden="true">⌁</span><p><strong>Your date of birth will not be shared.</strong> Only the true or false age-over-18 result is disclosed.</p></aside>
          {verificationState === "checking" && <p className="blauth-enrollment-message" role="status">Checking age eligibility…</p>}
          {error && <p className="blauth-field-error" role="alert">{error}</p>}
          <div className="blauth-consent-actions"><button className="blauth-back-button" type="button" onClick={() => navigate("/wallet")}>← Back</button><button className="blauth-continue-button" type="button" disabled={verificationState === "checking"} onClick={verifyAge}>{verificationState === "checking" ? "Checking…" : "Check age eligibility"} <span>→</span></button></div>
        </article>
      </section>
    </main>
  );
}

export default VerifierAge;
