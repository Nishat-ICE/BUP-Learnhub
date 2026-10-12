import React from "react";
import Sidebar from "./Sidebar.jsx";
import Topbar from "./Topbar.jsx";

const Layout = ({ title, children }) => {
  return (
    <div className="app-layout">
      <Sidebar />
      <main className="main-content">
        <Topbar title={title} />
        {children}
      </main>
    </div>
  );
};

export default Layout;