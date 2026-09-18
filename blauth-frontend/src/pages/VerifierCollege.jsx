import { Link } from "react-router-dom";

function VerifierCollege() {
  return (
    <main className="blauth-consent">
      <div className="blauth-register-orb blauth-consent-orb-one" /><div className="blauth-register-orb blauth-consent-orb-two" />
      <nav className="blauth-register-nav" aria-label="College verifier navigation"><span className="blauth-nav-status"><i /> Consent required</span></nav>
      <section className="blauth-consent-shell" aria-labelledby="college-verifier-title">
        <header className="blauth-consent-intro"><p className="blauth-eyebrow"><span /> College verifier</p><h1 id="college-verifier-title">Confirm student<br /><em>access.</em></h1><p>College Portal requests only the details needed to confirm your student account for campus access.</p></header>
        <article className="blauth-consent-card">
          <header className="blauth-request-header"><span className="blauth-request-mark">↗</span><div><p>Verification request from</p><h2>College Portal</h2></div></header>
          <p className="blauth-request-purpose">Confirm your student account details for campus access.</p>
          <div className="blauth-consent-list"><div className="blauth-consent-field"><span>Name</span><strong>Requested</strong></div><div className="blauth-consent-field"><span>Student ID</span><strong>Requested</strong></div></div>
          <aside className="blauth-privacy-notice"><span aria-hidden="true">⌁</span><p><strong>Email, date of birth, phone, and biometric data are not requested.</strong> You will review and approve the request before anything is shared.</p></aside>
          <div className="blauth-consent-actions"><Link className="blauth-back-button" to="/wallet">← Back</Link><Link className="blauth-continue-button" to="/consent?verifier=college-portal">Review &amp; Approve <span>→</span></Link></div>
        </article>
      </section>
    </main>
  );
}

export default VerifierCollege;
