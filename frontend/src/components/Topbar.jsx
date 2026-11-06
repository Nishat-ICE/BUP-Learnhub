import React from "react";
import { Menu, X } from "lucide-react";
import NotificationBell from "./NotificationBell.jsx";

const Topbar = ({ title, isMobileView, mobileMenuOpen, onToggleMobileMenu }) => {
  const user = JSON.parse(localStorage.getItem("user") || "{}");

  return (
    <header className="topbar">
      <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
        {isMobileView && (
          <button
            type="button"
            onClick={onToggleMobileMenu}
            aria-label="Open navigation menu"
            style={{
              width: "44px",
              height: "44px",
              minWidth: "44px",
              padding: 0,
              margin: 0,
              borderRadius: "12px",
              background: "linear-gradient(135deg, #071d2b, #0f766e)",
              color: "#ffffff",
              border: "none",
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              boxShadow: "0 8px 20px rgba(7, 29, 43, 0.25)",
              cursor: "pointer",
              flexShrink: 0
            }}
          >
            {mobileMenuOpen ? <X size={22} /> : <Menu size={22} />}
          </button>
        )}

        <div>
          <h2>{title}</h2>
          <p>Welcome back, {user.name || "User"}</p>
        </div>
      </div>

      <NotificationBell />
      <div className="profile">
        <div className="avatar">{user.name?.charAt(0) || "U"}</div>
        <div>
          <strong>{user.name || "User"}</strong>
          <span>
            {user.department
              ? `${user.department} Department`
              : "Department not set"}
          </span>
        </div>
      </div>
    </header>
  );
};

export default Topbar;