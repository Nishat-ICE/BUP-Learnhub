import { MessageCircle as DiscussionsIcon } from "lucide-react";
import { ListChecks as QuizNavIcon } from "lucide-react";
import { FileText as MaterialsIcon } from "lucide-react";
import React from "react";
import { Link, NavLink } from "react-router-dom";
import {
  Home,
  LayoutDashboard,
  BookOpen,
  ClipboardCheck,
  Bell,
  BarChart3,
  CalendarDays,
  ShieldCheck,
  LogOut,
  Crown
} from "lucide-react";

export default function Sidebar() {
  const user = JSON.parse(localStorage.getItem("user") || "{}");
  const role = user.role;

  const logout = () => {
    localStorage.removeItem("token");
    localStorage.removeItem("user");
    window.location.assign("/");
  };

  return (
    <aside className="sidebar">
      <Link
        to="/"
        className="brand-row"
        style={{ textDecoration: "none", color: "inherit" }}
      >
        <div className="logo"><Crown size={24} /></div>
        <div>
          <h3>BUP LearnHub</h3>
          <span>{role || "portal"}</span>
        </div>
      </Link>

      <nav>
        <NavLink to="/" end>
          <Home size={18} /> Home
        </NavLink>

        <NavLink to="/dashboard">
          <LayoutDashboard size={18} /> Dashboard
        </NavLink>

        {["student", "faculty"].includes(role) && (
          <>
            <NavLink to="/courses">
              <BookOpen size={18} /> Courses
            </NavLink>
        {["student", "faculty"].includes(user.role) && (
          <NavLink to="/materials">
            <MaterialsIcon size={18} /> Materials
          </NavLink>
        )}
            <NavLink to="/assignments">
              <ClipboardCheck size={18} /> Assignments
            </NavLink>
            <NavLink to="/grades">
              <BarChart3 size={18} /> Grades & Progress
            </NavLink>
          </>
        )}

        {["student", "faculty", "staff", "authority"].includes(role) && (
          <>
            <NavLink to="/announcements">
              <Bell size={18} /> Announcements
            </NavLink>
            <NavLink to="/academic-updates">
              <CalendarDays size={18} /> Academic Updates
            </NavLink>
          </>
        )}

        {role === "admin" && (
          <NavLink to="/admin">
            <ShieldCheck size={18} /> Admin Console
          </NavLink>
        )}

        {role === "authority" && (
          <NavLink to="/authority">
            <BarChart3 size={18} /> Authority Reports
          </NavLink>
        )}
              {["student", "faculty", "staff", "admin", "authority"].includes(user.role) && (
          <NavLink to="/quizzes">
            <QuizNavIcon size={18} />
            {user.role === "staff"
              ? "Quiz Participation"
              : ["admin", "authority"].includes(user.role)
              ? "Quiz Reports"
              : "Quizzes"}
          </NavLink>
        )}
        {["student", "faculty"].includes(user.role) && (
          <NavLink to="/discussions">
            <DiscussionsIcon size={18} />
            Discussions
          </NavLink>
        )}
</nav>

      <button type="button" className="logout" onClick={logout}>
        <LogOut size={18} /> Logout
      </button>
    </aside>
  );
}