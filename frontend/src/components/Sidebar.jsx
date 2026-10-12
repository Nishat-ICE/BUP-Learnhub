import React from "react";
import {
  LayoutDashboard,
  BookOpen,
  ClipboardCheck,
  Bell,
  BarChart3,
  LogOut,
  Crown
} from "lucide-react";
import { NavLink, useNavigate } from "react-router-dom";

const Sidebar = () => {
  const navigate = useNavigate();
  const user = JSON.parse(localStorage.getItem("user") || "{}");

  const logout = () => {
    localStorage.removeItem("token");
    localStorage.removeItem("user");
    window.location.href = "/";
  };

  return (
    <aside className="sidebar">
      <div className="brand-row">
        <div className="logo">
          <Crown size={24} />
        </div>
        <div>
          <h3>BUP LearnHub</h3>
          <span>{user.role || "portal"}</span>
        </div>
      </div>

      <nav>
        <NavLink to="/dashboard"><LayoutDashboard size={18} /> Dashboard</NavLink>
        <NavLink to="/courses"><BookOpen size={18} /> Courses</NavLink>
        <NavLink to="/assignments"><ClipboardCheck size={18} /> Assignments</NavLink>
        <NavLink to="/announcements"><Bell size={18} /> Announcements</NavLink>
        <NavLink to="/grades"><BarChart3 size={18} /> Grades & Progress</NavLink>
      </nav>

      <button className="logout" onClick={logout}>
        <LogOut size={18} /> Logout
      </button>
    </aside>
  );
};

export default Sidebar;