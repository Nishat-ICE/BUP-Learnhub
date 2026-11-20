import React from "react";
import { Calendar, Shield } from "lucide-react";
import NotificationBell from "./NotificationBell.jsx";

const Topbar = ({ title }) => {
  const user = JSON.parse(localStorage.getItem("user") || "{}");
  const todayStr = new Date().toLocaleDateString("en-GB", {
    weekday: "short",
    day: "2-digit",
    month: "short",
    year: "numeric"
  });

  return (
    <header className="topbar">
      <div className="tb-left">
        <div className="tb-breadcrumb">
          <span className="tb-live-dot" />
          <span>BUP LEARNHUB PORTAL</span>
          <span className="tb-sep">/</span>
          <span className="tb-role-chip">{user.role || "member"}</span>
        </div>
        <h2>{title}</h2>
      </div>

      <div className="tb-right">
        <div className="tb-date-pill">
          <Calendar size={15} />
          <span>{todayStr}</span>
        </div>

        <NotificationBell />

        <div className="profile">
          <div className="avatar">{user.name?.charAt(0) || "U"}</div>
          <div className="profile-meta">
            <strong>{user.name || "User"}</strong>
            <span>
              <Shield size={11} />{" "}
              {user.department
                ? `${user.department} Dept.`
                : "BUP Academic"}
            </span>
          </div>
        </div>
      </div>
    </header>
  );
};

export default Topbar;