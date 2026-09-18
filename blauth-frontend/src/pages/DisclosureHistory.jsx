import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { getDisclosureHistory } from "../services/api";

const WALLET_ID_KEY = "blauthWalletId";

function formatField(field) {
  const labels = { name: "Name", email: "Email", college: "College", studentId: "Student ID", dob: "Date of Birth", phone: "Phone", ageOver18: "Age over 18" };
  return labels[field] || field;
}

function formatTimestamp(timestamp) {
  const date = new Date(timestamp);
  return Number.isNaN(date.getTime()) ? "Unknown date" : date.toLocaleString();
}

function DisclosureHistory() {
  const [walletId] = useState(() => localStorage.getItem(WALLET_ID_KEY));
  const [history, setHistory] = useState([]);
  const [historyState, setHistoryState] = useState(() => (walletId ? "loading" : "missing"));
  const [historyError, setHistoryError] = useState("");

  useEffect(() => {
    if (!walletId) return undefined;

    let isCurrent = true;
    getDisclosureHistory(walletId)
      .then((disclosures) => {
        if (!isCurrent) return;
        setHistory([...disclosures].reverse());
        setHistoryState("ready");
      })
      .catch((error) => {
        console.error("Unable to load backend disclosure history:", error);
        if (!isCurrent) return;
        setHistoryError(error.message || "The backend disclosure history could not be loaded.");
        setHistoryState("error");
      });

    return () => { isCurrent = false; };
  }, [walletId]);

  let historyContent;
  if (historyState === "loading") {
    historyContent = <div className="blauth-history-empty"><span>◦</span><h3>Loading disclosures</h3><p>Retrieving your backend disclosure history.</p></div>;
  } else if (historyState === "missing") {
    historyContent = <div className="blauth-history-empty"><span>◦</span><h3>No backend wallet</h3><p>Complete local face verification to register your backend wallet.</p><Link to="/register">Create Identity <span>→</span></Link></div>;
  } else if (historyState === "error") {
    historyContent = <div className="blauth-history-empty"><span>!</span><h3>History unavailable</h3><p>{historyError}</p><Link to="/wallet">Return to Wallet <span>→</span></Link></div>;
  } else if (history.length) {
    historyContent = <ol className="blauth-history-list">{history.map((record, index) => <li key={`${record.requestId || record.timestamp}-${index}`}><div className="blauth-history-record-header"><div><h3>{record.verifier || "Unknown verifier"}</h3><p>{formatTimestamp(record.timestamp)}</p></div><span className="blauth-history-local">Backend</span></div><div className="blauth-history-columns"><section><h4>Shared</h4>{record.sharedFields?.length ? record.sharedFields.map((field) => <p className="is-shared" key={field}>✓ {formatField(field)}</p>) : <p>Nothing shared</p>}</section><section><h4>Withheld</h4>{record.withheldFields?.length ? record.withheldFields.map((field) => <p key={field}>◦ {formatField(field)}</p>) : <p>None</p>}</section></div></li>)}</ol>;
  } else {
    historyContent = <div className="blauth-history-empty"><span>◦</span><h3>No disclosures yet</h3><p>When you approve a sharing request, the fields you chose will appear here.</p><Link to="/wallet">Return to Wallet <span>→</span></Link></div>;
  }

  return (
    <main className="blauth-history">
      <div className="blauth-register-orb blauth-history-orb-one" /><div className="blauth-register-orb blauth-history-orb-two" />
      <nav className="blauth-register-nav" aria-label="Disclosure history navigation"><span className="blauth-nav-status"><i /> Your disclosure record</span></nav>
      <section className="blauth-history-shell" aria-labelledby="history-title">
        <header className="blauth-history-intro"><p className="blauth-eyebrow"><span /> Your activity</p><h1 id="history-title">Disclosure<br /><em>history.</em></h1><p>Every backend disclosure decision is recorded here so you can see exactly what was approved.</p></header>
        <div className="blauth-history-card">
          <header><h2>Recent disclosures</h2><span>{history.length} {history.length === 1 ? "record" : "records"}</span></header>
          {historyContent}
          {historyState === "ready" && history.length > 0 && <footer><Link to="/wallet">← Return to Wallet</Link></footer>}
        </div>
      </section>
    </main>
  );
}

export default DisclosureHistory;
