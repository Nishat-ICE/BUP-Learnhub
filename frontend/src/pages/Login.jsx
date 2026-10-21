import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { GraduationCap, ShieldCheck, BookOpen, BarChart3, Eye, EyeOff, Mail } from "lucide-react";
import api from "../api/api";
import "../styles/reset-flow.css";
import "../styles/auth.css";

const departments = [
  "ICT", "CSE", "ES", "Economics", "English", "Law", "Business Administration",
  "Public Administration", "International Relations", "Sociology", "Development Studies",
  "Mass Communication and Journalism", "Disaster and Human Security Management",
  "Peace, Conflict and Human Rights Studies", "University Administration"
];

// Wave: top tucks inward (left), bottom bulges outward (right)
const WAVE = "M100,0 C20,130 20,290 130,420 C236,560 238,800 60,1000";
const d = 26; // secondary layer offset
const BAND = `M100,0 C20,130 20,290 130,420 C236,560 238,800 60,1000 L${60+d},1000 C${238+d},800 ${236+d},560 ${130+d},420 C${20+d},290 ${20+d},130 ${100+d},0 Z`;

const Login = () => {
  const navigate = useNavigate();
  const [mode, setMode] = useState("login");
  const [resetCode, setResetCode] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");

  const [form, setForm] = useState({
    name: "", email: "", password: "", role: "student",
    studentId: "", department: "", section: "B"
  });

  const change = (e) => setForm({ ...form, [e.target.name]: e.target.value });
  const switchMode = (m) => { setMode(m); setError(""); setInfo(""); };

  const submit = async (e) => {
    e.preventDefault();
    setError(""); setInfo("");

    if (mode === "forgot") {
      try {
        await api.post("/password-reset/request", {
          email: form.email.trim()
        });

        setInfo(
          "If an active account matches this email, the request is waiting for Admin review. After identity verification, ask Admin for your one-time code."
        );
      } catch (err) {
        setError(
          err.response?.data?.message || "Could not send reset request."
        );
      }
      return;
    }

    if (mode === "reset") {
      if (!resetCode.trim()) {
        setError("Enter the one-time code provided by Admin.");
        return;
      }

      if (form.password.length < 8) {
        setError("New password must have at least 8 characters.");
        return;
      }

      if (form.password !== confirmPassword) {
        setError("The passwords do not match.");
        return;
      }

      try {
        await api.post("/password-reset/complete", {
          email: form.email.trim(),
          code: resetCode.trim(),
          newPassword: form.password
        });

        setMode("login");
        setResetCode("");
        setConfirmPassword("");
        setForm((current) => ({ ...current, password: "" }));
        setInfo("Password updated. Sign in using your new password.");
      } catch (err) {
        setError(
          err.response?.data?.message ||
            "Invalid or expired reset code."
        );
      }
      return;
    }

    try {
      const endpoint = mode === "login" ? "/auth/login" : "/auth/register";
      const res = await api.post(endpoint, form);
      localStorage.setItem("token", res.data.token);
      localStorage.setItem("user", JSON.stringify(res.data.user));
      navigate("/dashboard");
    } catch (err) {
      setError(err.response?.data?.message || "Something went wrong");
    }
  };

  return (
    <div id="authPage" className="auth-page">
      <div className="auth-left">
        <div className="left-content">
          <div className="brand-icon"><GraduationCap size={44} /></div>
          <h1>BUP LearnHub</h1>
          <p>A professional Learning Management System for courses, assignments, announcements, grades and academic progress.</p>
          <div className="features">
            <div><ShieldCheck size={22} /><span>Role Based Access</span></div>
            <div><BookOpen size={22} /><span>Course Management</span></div>
            <div><BarChart3 size={22} /><span>Progress Tracking</span></div>
          </div>
        </div>

        <svg className="wave-edge" viewBox="0 0 240 1000" preserveAspectRatio="none" aria-hidden="true">
          <defs>
            <filter id="softShadow" x="-80%" y="-10%" width="260%" height="120%">
              <feGaussianBlur stdDeviation="22" />
            </filter>
            <filter id="tightShadow" x="-40%" y="-5%" width="180%" height="110%">
              <feGaussianBlur stdDeviation="5" />
            </filter>
            <filter id="innerBlur" x="-40%" y="-5%" width="180%" height="110%">
              <feGaussianBlur stdDeviation="9" />
            </filter>
            <clipPath id="panelClip">
              <path d={WAVE + " L0,1000 L0,0 Z"} />
            </clipPath>
            <linearGradient id="bandGrad" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0" stopColor="#5eead4" stopOpacity="0.75" />
              <stop offset="1" stopColor="#5eead4" stopOpacity="0.05" />
            </linearGradient>
            <linearGradient id="rimGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="#ffffff" stopOpacity="0.95" />
              <stop offset="0.45" stopColor="#ffffff" stopOpacity="0.35" />
              <stop offset="1" stopColor="#ffffff" stopOpacity="0.85" />
            </linearGradient>
          </defs>

          {/* 1. cutout = right side background */}
          <path d={WAVE + " L240,1000 L240,0 Z"} fill="#f3f5f9" />

          {/* 2. secondary teal layer (depth) */}
          <path d={BAND} fill="url(#bandGrad)" />

          {/* 3. soft wide shadow into light side */}
          <path d={WAVE + " L0,1000 L0,0 Z"} fill="#06263a" opacity="0.55" filter="url(#softShadow)" />

          {/* 4. tight contact shadow */}
          <path d={WAVE} fill="none" stroke="#06263a" strokeOpacity="0.55" strokeWidth="10" filter="url(#tightShadow)" />

          {/* 5. inner shadow on panel side (bevel) */}
          <g clipPath="url(#panelClip)">
            <path d={WAVE} fill="none" stroke="#031821" strokeOpacity="0.7" strokeWidth="26" filter="url(#innerBlur)" />
            <path d={WAVE} fill="none" stroke="#99f6e4" strokeOpacity="0.35" strokeWidth="5" transform="translate(-4,0)" filter="url(#tightShadow)" />
          </g>

          {/* 6. glossy rim */}
          <path d={WAVE} fill="none" stroke="#7fe0d0" strokeOpacity="0.4" strokeWidth="7" vectorEffect="non-scaling-stroke" />
          <path d={WAVE} fill="none" stroke="url(#rimGrad)" strokeWidth="2.6" vectorEffect="non-scaling-stroke" />
        </svg>
      </div>

      <div className="auth-right">
        <form className="auth-card" onSubmit={submit}>
          <span className="tag">BUP Learning Portal</span>
          <h2>{mode === "login" ? "Welcome Back" : mode === "register" ? "Create Account" : mode === "forgot" ? "Forgot Password" : "Set New Password"}</h2>
          <p className="muted">
            {mode === "login" ? "Login to continue your academic journey"
              : mode === "register" ? "Register to access LearnHub"
              : mode === "forgot" ? "Enter your email to request password recovery" : "Enter the code provided by Admin and choose a new password"}
          </p>

          {error && <div className="error">{error}</div>}
          {info && <div className="success-msg">{info}</div>}

          {mode === "register" && (
            <>
              <label>Full Name</label>
              <input name="name" value={form.name} onChange={change} placeholder="Enter full name" required />

              

              <label>Role</label>
<select name="role" value={form.role} onChange={change} required>
  <option value="student">Student</option>
  <option value="faculty">Faculty</option>
  <option value="staff">Academic Staff</option>
</select>
              <label>Department</label>
              <select name="department" value={form.department} onChange={change} required>
                <option value="">Select department</option>
                {departments.map((x) => <option key={x} value={x}>{x}</option>)}
              </select>

              <label>Student ID</label>
              <input name="studentId" value={form.studentId} onChange={change} placeholder="Optional" />
            </>
          )}

          <label>Email Address</label>
          <div className="input-with-icon">
            <input type="email" name="email" value={form.email} onChange={change} placeholder="abc@gmail.com" required />
            <Mail size={18} />
          </div>

          {mode === "reset" && (
            <>
              <label>One-time reset code</label>
              <input
                className="reset-code-input"
                type="text"
                value={resetCode}
                onChange={(event) => setResetCode(event.target.value)}
                placeholder="Paste the code provided by Admin"
                autoComplete="one-time-code"
                required
              />
            </>
          )}

          {mode !== "forgot" && (
            <>
              <label>{mode === "reset" ? "New Password" : "Password"}</label>
              <div className="password-field">
                <input
                  type={showPassword ? "text" : "password"}
                  name="password" value={form.password} onChange={change}
                  placeholder={mode === "reset" ? "New password (8+ characters)" : "Enter password"} required
                />
                <button type="button" className="eye-btn" onClick={() => setShowPassword(!showPassword)}>
                  {showPassword ? <EyeOff size={19} /> : <Eye size={19} />}
                </button>
              </div>

              {mode === "reset" && (
                <>
                  <label>Confirm new password</label>
                  <div className="password-field">
                    <input
                      type={showPassword ? "text" : "password"}
                      value={confirmPassword}
                      onChange={(event) =>
                        setConfirmPassword(event.target.value)
                      }
                      placeholder="Type the new password again"
                      autoComplete="new-password"
                      required
                    />
                  </div>
                </>
              )}

              {mode === "login" && (
                <div className="forgot-row">
                  <button type="button" onClick={() => switchMode("forgot")}>Forgot Password?</button>
                </div>
              )}
            </>
          )}

          <button type="submit" className="main-auth-btn">
            {mode === "login" ? "Sign In" : mode === "register" ? "Create Account" : mode === "forgot" ? "Send Reset Request" : "Set New Password"}
          </button>

          <p className="switch">
            {mode === "login" && (<>No account?<span onClick={() => switchMode("register")}> Register</span></>)}
            {mode === "register" && (<>Already have account?<span onClick={() => switchMode("login")}> Login</span></>)}
            {mode === "forgot" && (
              <>
                Have a code?
                <button
                  type="button"
                  className="reset-flow-link"
                  onClick={() => switchMode("reset")}
                >
                  Enter reset code
                </button>
                <span onClick={() => switchMode("login")}>
                  Back to Login
                </span>
              </>
            )}
            {mode === "reset" && (
              <>
                Need a code?
                <span onClick={() => switchMode("forgot")}>
                  Request a reset
                </span>
                <span onClick={() => switchMode("login")}>
                  Back to Login
                </span>
              </>
            )}
          </p>
        </form>
      </div>
    </div>
  );
};

export default Login;