import React from "react";
const Topbar = ({ title }) => {
  const user = JSON.parse(localStorage.getItem("user") || "{}");

  return (
    <header className="topbar">
      <div>
        <h2>{title}</h2>
        <p>Welcome back, {user.name || "User"}</p>
      </div>

      <div className="profile">
        <div className="avatar">{user.name?.charAt(0) || "U"}</div>
        <div>
          <strong>{user.name || "User"}</strong>
          <span>{user.department ? `${user.department} Department` : "Department not set"}</span>
        </div>
      </div>
    </header>
  );
};

export default Topbar;