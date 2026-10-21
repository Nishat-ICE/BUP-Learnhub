import AdminPanel from "./pages/AdminPanel.jsx";
import AuthorityPanel from "./pages/AuthorityPanel.jsx";
import AcademicUpdates from "./pages/AcademicUpdates.jsx";
import React from "react";
import { Routes, Route, Navigate } from "react-router-dom";
import Home from "./pages/Home.jsx";
import Login from "./pages/Login.jsx";
import Dashboard from "./pages/Dashboard.jsx";
import Courses from "./pages/Courses.jsx";
import Assignments from "./pages/Assignments.jsx";
import Announcements from "./pages/Announcements.jsx";
import Grades from "./pages/Grades.jsx";

function PrivateRoute({ children }) {
  const token = localStorage.getItem("token");
  return token ? children : <Navigate to="/login" replace />;
}

function LeadershipGate() {
  let role = "";

  try {
    role = JSON.parse(
      localStorage.getItem("user") || "{}"
    ).role;
  } catch {
    role = "";
  }

  if (role === "admin") {
    return <Navigate to="/admin" replace />;
  }

  if (role === "authority") {
    return <Navigate to="/authority" replace />;
  }

  return <Dashboard />;
}

function LeadershipOnly({ role, children }) {
  let current = "";

  try {
    current = JSON.parse(
      localStorage.getItem("user") || "{}"
    ).role;
  } catch {
    current = "";
  }

  return current === role
    ? children
    : <Navigate to="/dashboard" replace />;
}
function AcademicAccess({ allowed, children }) {
  let role = "";

  try {
    role = JSON.parse(
      localStorage.getItem("user") || "{}"
    ).role;
  } catch {
    role = "";
  }

  return allowed.includes(role)
    ? children
    : <Navigate to="/dashboard" replace />;
}
function App() {
  const token = localStorage.getItem("token");

  return (
    <Routes>
      <Route path="/" element={<Home />} />
      <Route path="/login" element={token ? <Navigate to="/dashboard" replace /> : <Login />} />
      <Route path="/dashboard" element={<PrivateRoute><LeadershipGate /></PrivateRoute>} />
      <Route path="/courses" element={<PrivateRoute><Courses /></PrivateRoute>} />
      <Route path="/assignments" element={<PrivateRoute><AcademicAccess allowed={["student", "faculty"]}><Assignments /></AcademicAccess></PrivateRoute>} />
      <Route path="/announcements" element={<PrivateRoute><AcademicAccess allowed={["student", "faculty", "staff", "authority"]}><Announcements /></AcademicAccess></PrivateRoute>} />
      <Route path="/grades" element={<PrivateRoute><AcademicAccess allowed={["student", "faculty"]}><Grades /></AcademicAccess></PrivateRoute>} />
      <Route path="*" element={<Navigate to="/" replace />} />
          <Route
        path="/academic-updates"
        element={<PrivateRoute><AcademicAccess allowed={["student", "faculty", "staff", "authority"]}><AcademicUpdates /></AcademicAccess></PrivateRoute>}
      />
          <Route
        path="/admin"
        element={
          <PrivateRoute>
            <LeadershipOnly role="admin">
              <AdminPanel />
            </LeadershipOnly>
          </PrivateRoute>
        }
      />
      <Route
        path="/authority"
        element={
          <PrivateRoute>
            <LeadershipOnly role="authority">
              <AuthorityPanel />
            </LeadershipOnly>
          </PrivateRoute>
        }
      />
    </Routes>
  );
}

export default App;