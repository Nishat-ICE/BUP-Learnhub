import React, { useEffect, useState } from "react";
import { X } from "lucide-react";
import Sidebar from "./Sidebar.jsx";
import Topbar from "./Topbar.jsx";

function detectMobileDevice() {
  if (typeof window === "undefined") return false;
  const ua = navigator.userAgent || "";
  const isPhoneUA = /Android|iPhone|iPad|iPod|Mobile|BlackBerry|IEMobile|Opera Mini/i.test(
    ua
  );
  const isTouchSmall =
    navigator.maxTouchPoints > 1 && Math.min(window.screen.width, window.innerWidth) <= 1024;
  return window.innerWidth <= 1024 || isPhoneUA || isTouchSmall;
}

const Layout = ({ title, children }) => {
  const [isMobileView, setIsMobileView] = useState(detectMobileDevice);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  useEffect(() => {
    const handleResize = () => {
      const mobile = detectMobileDevice();
      setIsMobileView(mobile);
      if (!mobile) setMobileMenuOpen(false);
    };
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  return (
    <div className="app-layout" style={{ position: "relative" }}>
      {/* Desktop Sidebar */}
      {!isMobileView && <Sidebar />}

      {/* Mobile Slide-Out Drawer + Backdrop */}
      {isMobileView && mobileMenuOpen && (
        <>
          <div
            onClick={() => setMobileMenuOpen(false)}
            style={{
              position: "fixed",
              inset: 0,
              zIndex: 3000,
              background: "rgba(7, 29, 43, 0.62)",
              backdropFilter: "blur(3px)"
            }}
          />

          <div
            onClick={(e) => {
              if (e.target.closest("a")) {
                setMobileMenuOpen(false);
              }
            }}
            style={{
              position: "fixed",
              top: 0,
              left: 0,
              bottom: 0,
              width: "280px",
              maxWidth: "84vw",
              zIndex: 3100,
              boxShadow: "20px 0 50px rgba(0, 0, 0, 0.45)"
            }}
          >
            <button
              type="button"
              aria-label="Close menu"
              onClick={() => setMobileMenuOpen(false)}
              style={{
                position: "absolute",
                top: "18px",
                right: "14px",
                zIndex: 3200,
                width: "36px",
                height: "36px",
                padding: 0,
                borderRadius: "10px",
                background: "rgba(255, 255, 255, 0.16)",
                color: "#ffffff",
                border: "none",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                cursor: "pointer"
              }}
            >
              <X size={18} />
            </button>

            <div
              style={{
                height: "100vh",
                overflowY: "auto"
              }}
            >
              <style>{`
                .mobile-force-sidebar .sidebar {
                  display: flex !important;
                  position: relative !important;
                  width: 100% !important;
                  height: 100vh !important;
                }
              `}</style>
              <div className="mobile-force-sidebar">
                <Sidebar />
              </div>
            </div>
          </div>
        </>
      )}

      <main
        className="main-content"
        style={
          isMobileView
            ? { marginLeft: 0, width: "100%", padding: "18px 16px" }
            : undefined
        }
      >
        <Topbar
          title={title}
          isMobileView={isMobileView}
          mobileMenuOpen={mobileMenuOpen}
          onToggleMobileMenu={() => setMobileMenuOpen((prev) => !prev)}
        />
        {children}
      </main>
    </div>
  );
};

export default Layout;