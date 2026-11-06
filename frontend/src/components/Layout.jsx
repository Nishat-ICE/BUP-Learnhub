import React, { useState } from "react";
import { Menu, X } from "lucide-react";
import Sidebar from "./Sidebar.jsx";
import Topbar from "./Topbar.jsx";
import "../styles/mobile-nav.css";

const Layout = ({ title, children }) => {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  return (
    <div className={mobileMenuOpen ? "app-layout mobile-nav-open" : "app-layout"}>
      <button
        type="button"
        className="mobile-hamburger-btn"
        aria-label="Toggle navigation menu"
        onClick={() => setMobileMenuOpen((prev) => !prev)}
      >
        {mobileMenuOpen ? <X size={22} /> : <Menu size={22} />}
      </button>

      {mobileMenuOpen && (
        <div
          className="mobile-sidebar-backdrop"
          onClick={() => setMobileMenuOpen(false)}
        />
      )}

      <div
        className="sidebar-drawer-holder"
        onClick={(e) => {
          if (e.target.closest("a")) {
            setMobileMenuOpen(false);
          }
        }}
      >
        <Sidebar />
      </div>

      <main className="main-content">
        <Topbar title={title} />
        {children}
      </main>
    </div>
  );
};

export default Layout;