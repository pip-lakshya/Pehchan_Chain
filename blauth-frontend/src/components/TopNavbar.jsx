import { useState, useEffect } from "react";
import { Link, useLocation } from "react-router-dom";

const links = [
  { to: "/", label: "Home" },
  { to: "/register", label: "Create Identity" },
  { to: "/login", label: "Login" },
  { to: "/wallet", label: "Wallet" },
  { to: "/admin", label: "Admin Console" },
  { to: "/manager", label: "Manager Panel" },
  { to: "/verifier", label: "Verifier Portal" },
  { to: "/audit", label: "Audit Trail" },
  { to: "/developer", label: "Developer Console" },
];

function TopNavbar() {
  const { pathname } = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);

  // Close mobile navigation drawer on route change
  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  // The authentication overlay intentionally has its own minimal header
  if (pathname === "/authenticate") return null;

  return (
    <header className="blauth-app-nav">
      <div className="blauth-nav-inner">
        <Link className="blauth-brand" to="/" aria-label="PehchanChain home">
          <span className="blauth-brand-mark">P</span>
          <span className="blauth-brand-title">PehchanChain</span>
        </Link>

        <button
          className="blauth-nav-toggle"
          onClick={() => setMobileOpen(!mobileOpen)}
          aria-label="Toggle Navigation"
          aria-expanded={mobileOpen}
        >
          {mobileOpen ? (
            <svg viewBox="0 0 24 24" width="22" height="22" stroke="currentColor" strokeWidth="2" fill="none">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          ) : (
            <svg viewBox="0 0 24 24" width="22" height="22" stroke="currentColor" strokeWidth="2" fill="none">
              <line x1="3" y1="12" x2="21" y2="12" />
              <line x1="3" y1="6" x2="21" y2="6" />
              <line x1="3" y1="18" x2="21" y2="18" />
            </svg>
          )}
        </button>

        <nav className={`blauth-nav-links ${mobileOpen ? "is-open" : ""}`} aria-label="Application navigation">
          {links.map((link) => (
            <Link
              className={pathname === link.to ? "is-active" : ""}
              key={link.to}
              to={link.to}
              onClick={() => setMobileOpen(false)}
            >
              {link.label}
            </Link>
          ))}
        </nav>
      </div>
    </header>
  );
}

export default TopNavbar;
