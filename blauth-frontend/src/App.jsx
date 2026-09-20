import { BrowserRouter, Routes, Route } from "react-router-dom";
import Home from "./pages/Home";
import "./App.css";
import Register from "./pages/Register";
import Login from "./pages/Login";
import FaceVerify from "./pages/FaceVerify";
import Wallet from "./pages/Wallet";
import DisclosureHistory from "./pages/DisclosureHistory";
import DeveloperDashboard from "./pages/DeveloperDashboard";
import AdminDashboard from "./pages/AdminDashboard";
import ManagerPanel from "./pages/ManagerPanel";
import VerifierPortal from "./pages/VerifierPortal";
import AuditTrail from "./pages/AuditTrail";
import AuthOverlay from "./pages/AuthOverlay";
import Consent from "./pages/Consent";
import TopNavbar from "./components/TopNavbar";

function App() {
  return (
    <BrowserRouter>
      <div className="blauth-app-shell">
        <TopNavbar />
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/register" element={<Register />} />
          <Route path="/login" element={<Login />} />
          <Route path="/verify" element={<FaceVerify />} />
          <Route path="/wallet" element={<Wallet />} />
          <Route path="/consent" element={<Consent />} />
          <Route path="/admin" element={<AdminDashboard />} />
          <Route path="/manager" element={<ManagerPanel />} />
          <Route path="/verifier" element={<VerifierPortal />} />
          <Route path="/audit" element={<AuditTrail />} />
          <Route path="/history" element={<DisclosureHistory />} />
          <Route path="/developer" element={<DeveloperDashboard />} />
          <Route path="/authenticate" element={<AuthOverlay />} />
        </Routes>
      </div>
    </BrowserRouter>
  );
}

export default App;
