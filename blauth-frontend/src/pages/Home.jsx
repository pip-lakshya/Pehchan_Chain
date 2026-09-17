import { Link } from "react-router-dom";

const features = [
  {
    title: "Local Biometric Verification",
    description:
      "Face verification runs in your browser. Your raw biometric data and face embeddings stay on your device.",
    icon: "face",
  },
  {
    title: "Selective Disclosure",
    description:
      "Share only the identity fields a verifier requests and you choose to approve.",
    icon: "sliders",
  },
  {
    title: "Explicit User Consent",
    description:
      "Every disclosure is reviewed by you first. Nothing is shared without clear approval.",
    icon: "check",
  },
];

function FeatureIcon({ type }) {
  const paths = {
    face: <><rect x="4" y="3" width="16" height="18" rx="6" /><path d="M8 11h.01M16 11h.01M9 15c1.8 1.3 4.2 1.3 6 0" /></>,
    sliders: <><path d="M4 7h16M4 17h16M9 4v6M15 14v6" /></>,
    check: <><path d="M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Z" /><path d="m8.5 12 2.3 2.3 4.7-5" /></>,
  };

  return <svg viewBox="0 0 24 24" aria-hidden="true">{paths[type]}</svg>;
}

function ArrowIcon() {
  return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 4v15M6.5 13.5 12 19l5.5-5.5" /></svg>;
}

function Home() {
  return (
    <main className="blauth-home">
      <section className="blauth-hero">
        <div className="blauth-orb blauth-orb-one" />
        <div className="blauth-orb blauth-orb-two" />
        <nav className="blauth-nav" aria-label="Primary navigation">
          <Link className="blauth-brand" to="/" aria-label="PehchanChain home">
            <span className="blauth-brand-mark">P</span>
            <span>PehchanChain</span>
          </Link>
          <span className="blauth-nav-status"><i /> Privacy-first identity</span>
        </nav>

        <div className="blauth-hero-content">
          <p className="blauth-eyebrow"><span /> Private identity, by design</p>
          <h1>Your Identity.<br /><em>Your Control.</em></h1>
          <p className="blauth-hero-copy">Verify locally. Share selectively. Stay in control.</p>
          <div className="blauth-actions">
            <Link className="blauth-button blauth-button-primary" to="/register">Create Identity <span>→</span></Link>
            <Link className="blauth-button blauth-button-secondary" to="/wallet">Open Wallet</Link>
            <Link className="blauth-button blauth-button-secondary" to="/developer">Developer Console</Link>
          </div>
          <p className="blauth-trust"><span>✓</span> Your biometric data never leaves your device.</p>
        </div>

        <div className="blauth-identity-preview" aria-label="Local verification is active">
          <div className="blauth-preview-top"><span className="blauth-live-dot" /> Local verification</div>
          <div className="blauth-face-scan"><div className="blauth-scan-line" /><div className="blauth-face-outline" /></div>
          <div className="blauth-preview-bottom"><span>BIOMETRIC</span><strong>ON DEVICE</strong></div>
        </div>
      </section>

      <section className="blauth-features" aria-labelledby="blauth-features-title">
        <div className="blauth-section-heading">
          <p className="blauth-kicker">Built around you</p>
          <h2 id="blauth-features-title">Identity should be private<br />by default.</h2>
        </div>
        <div className="blauth-feature-grid">
          {features.map((feature, index) => (
            <article className="blauth-feature-card" key={feature.title}>
              <span className="blauth-card-number">0{index + 1}</span>
              <span className="blauth-feature-icon"><FeatureIcon type={feature.icon} /></span>
              <h3>{feature.title}</h3>
              <p>{feature.description}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="blauth-flow-section" aria-labelledby="blauth-flow-title">
        <div className="blauth-flow-intro">
          <p className="blauth-kicker">A clear path</p>
          <h2 id="blauth-flow-title">You decide what<br />moves forward.</h2>
          <p>PehchanChain keeps each identity interaction simple, visible, and in your hands.</p>
        </div>
        <ol className="blauth-flow">
          {["Face Verification", "Identity Wallet", "Consent", "Only Approved Data", "Verifier"].map((step, index) => (
            <li key={step}>
              <span className="blauth-flow-step">{String(index + 1).padStart(2, "0")}</span>
              <strong>{step}</strong>
              {index < 4 && <span className="blauth-flow-arrow"><ArrowIcon /></span>}
            </li>
          ))}
        </ol>
      </section>
    </main>
  );
}

export default Home;
