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
  Crown,
  FileText as MaterialsIcon,
  ListChecks as QuizNavIcon,
  MessageCircle as DiscussionsIcon,
  CalendarDays as RoutineIcon,
  Sparkles
} from "lucide-react";

const roleBadgeLabel = {
  student: "Student Workspace",
  faculty: "Faculty Suite",
  staff: "Academic Staff Desk",
  admin: "System Control",
  authority: "Executive Oversight"
};

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
        <div className="logo">
          <Crown size={24} />
        </div>
        <div>
          <h3>BUP LearnHub</h3>
          <span>{roleBadgeLabel[role] || "Academic Portal"}</span>
        </div>
      </Link>

      <div className="sb-identity-card">
        <div className="sb-id-top">
          <Sparkles size={14} />
          <span>{user.department || "BUP Academic"}</span>
        </div>
        <strong>{user.name || "Authorized User"}</strong>
        <small>
          Role: {(role || "member").toUpperCase()}
          {user.section && role === "student" ? ` | Sec ${user.section}` : ""}
        </small>
      </div>

      <div className="sb-section-label">NAVIGATION MENU</div>

      <nav>
        <NavLink to="/" end>
          <Home size={18} /> Home
        </NavLink>

        <NavLink to="/dashboard">
          <LayoutDashboard size={18} /> Dashboard
        </NavLink>

        {role === "staff" && (
          <NavLink to="/courses">
            <BookOpen size={18} /> Courses
          </NavLink>
        )}

        {["student", "faculty"].includes(role) && (
          <>
            <NavLink to="/courses">
              <BookOpen size={18} /> Courses
            </NavLink>
            <NavLink to="/materials">
              <MaterialsIcon size={18} /> Materials
            </NavLink>
            <NavLink to="/assignments">
              <ClipboardCheck size={18} /> Assignments
            </NavLink>
            {role === "student" && (
              <NavLink to="/weekly-schedule">
                <CalendarDays size={18} /> Weekly Schedule
              </NavLink>
            )}
            <NavLink to="/grades">
              <BarChart3 size={18} /> Grades &amp; Progress
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

        {["student", "faculty", "staff", "admin", "authority"].includes(
          role
        ) && (
          <NavLink to="/quizzes">
            <QuizNavIcon size={18} />
            {role === "staff"
              ? "Quiz Participation"
              : ["admin", "authority"].includes(role)
              ? "Quiz Reports"
              : "Quizzes"}
          </NavLink>
        )}

        {["student", "faculty"].includes(role) && (
          <NavLink to="/discussions">
            <DiscussionsIcon size={18} /> Discussions
          </NavLink>
        )}

        <NavLink to="/policies">
          <span aria-hidden="true">#</span> Policies &amp; Guidelines
        </NavLink>

        {["staff", "student", "faculty"].includes(role) && (
          <NavLink to="/routines">
            <RoutineIcon size={18} /> Routines
          </NavLink>
        )}
      </nav>

      <button type="button" className="logout" onClick={logout}>
        <LogOut size={18} /> Sign Out
      </button>
    </aside>
  );
}