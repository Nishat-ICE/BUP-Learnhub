import React from "react";
import { Link } from "react-router-dom";
import {
  GraduationCap,
  BookOpen,
  ClipboardCheck,
  Bell,
  BarChart3,
  Users,
  ShieldCheck,
  ArrowRight,
  Sparkles,
  Layers,
  CheckCircle2
} from "lucide-react";

const Home = () => {
  return (
    <div className="home-page">
      <nav className="home-nav">
        <div className="home-brand">
          <div className="home-logo">
            <GraduationCap size={26} />
          </div>
          <div>
            <h3>BUP LearnHub</h3>
            <span>Learning Management System</span>
          </div>
        </div>

        <div className="home-links">
          <a href="#features">Features</a>
          <a href="#roles">Users</a>
          <a href="#workflow">Workflow</a>
          <Link to="/login" className="nav-login">Login</Link>
        </div>
      </nav>

      <section className="home-hero">
        <div className="hero-left">
          <div className="hero-badge">
            <Sparkles size={16} />
            Centralized Digital Learning Platform
          </div>

          <h1>A Unified Digital Platform for University Learning Management</h1>

          <p>
            BUP LearnHub centralizes courses, learning materials, assignments, assessments, grades and announcements into one secure, role-based academic environment.
          </p>

          <div className="hero-actions">
            <Link to="/login" className="primary-action">
              Get Started <ArrowRight size={18} />
            </Link>

            <a href="#features" className="secondary-action">
              Explore Features
            </a>
          </div>

          <div className="hero-stats">
            <div>
              <strong>5+</strong>
              <span>User Roles</span>
            </div>
            <div>
              <strong>10+</strong>
              <span>Core Modules</span>
            </div>
            <div>
              <strong>24/7</strong>
              <span>Web Access</span>
            </div>
          </div>
        </div>

        <div className="hero-right">
          <div className="dashboard-preview">
            <div className="preview-top">
              <div>
                <span></span>
                <span></span>
                <span></span>
              </div>
              <p>Academic Dashboard</p>
            </div>

            <div className="preview-hero">
              <h3>Welcome to LearnHub</h3>
              <p>Your learning activities in one place</p>
            </div>

            <div className="preview-grid">
              <div>
                <BookOpen />
                <strong>Courses</strong>
                <span>06 Active</span>
              </div>

              <div>
                <ClipboardCheck />
                <strong>Assignments</strong>
                <span>03 Pending</span>
              </div>

              <div>
                <Bell />
                <strong>Notices</strong>
                <span>09 New</span>
              </div>

              <div>
                <BarChart3 />
                <strong>Progress</strong>
                <span>82%</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="home-section" id="features">
        <div className="section-heading">
          <span>Platform Features</span>
          <h2>Everything needed for academic learning management</h2>
          <p>
            Designed for students, faculties, academic staff, administrators and
            university authorities.
          </p>
        </div>

        <div className="feature-cards">
          <div className="feature-card">
            <BookOpen />
            <h3>Course Management</h3>
            <p>Create, manage, view and enroll in academic courses.</p>
          </div>

          <div className="feature-card">
            <Layers />
            <h3>Learning Materials</h3>
            <p>Organize lecture notes, slides and course resources.</p>
          </div>

          <div className="feature-card">
            <ClipboardCheck />
            <h3>Assignments</h3>
            <p>Create assignments, submit tasks and track submission status.</p>
          </div>

          <div className="feature-card">
            <BarChart3 />
            <h3>Grades & Progress</h3>
            <p>View grades, feedback and academic performance summaries.</p>
          </div>

          <div className="feature-card">
            <Bell />
            <h3>Announcements</h3>
            <p>Publish academic notices and receive important updates.</p>
          </div>

          <div className="feature-card">
            <ShieldCheck />
            <h3>Role Based Access</h3>
            <p>Secure access for students, faculties, staff and admins.</p>
          </div>
        </div>
      </section>

      <section className="roles-section" id="roles">
        <div className="section-heading light">
          <span>User Coverage</span>
          <h2>Built for every academic stakeholder</h2>
        </div>

        <div className="role-grid">
          <div>
            <Users />
            <h3>Students</h3>
            <p>Access courses, materials, assignments, grades and progress.</p>
          </div>

          <div>
            <GraduationCap />
            <h3>Faculties</h3>
            <p>Manage courses, assignments, submissions and announcements.</p>
          </div>

          <div>
            <Layers />
            <h3>Academic Staff</h3>
            <p>Maintain academic information and generate reports.</p>
          </div>

          <div>
            <ShieldCheck />
            <h3>Administrators</h3>
            <p>Manage users, roles, permissions and system operations.</p>
          </div>
        </div>
      </section>

      <section className="workflow-section" id="workflow">
        <div className="section-heading">
          <span>Basic Workflow</span>
          <h2>Simple, organized and efficient</h2>
        </div>

        <div className="workflow-line">
          <div>
            <CheckCircle2 />
            <h4>Login</h4>
            <p>Secure role-based authentication</p>
          </div>

          <div>
            <CheckCircle2 />
            <h4>Access Courses</h4>
            <p>View enrolled academic courses</p>
          </div>

          <div>
            <CheckCircle2 />
            <h4>Complete Tasks</h4>
            <p>Submit assignments and assessments</p>
          </div>

          <div>
            <CheckCircle2 />
            <h4>Track Progress</h4>
            <p>View grades, feedback and reports</p>
          </div>
        </div>
      </section>

      <section className="home-cta">
        <h2>Start managing learning activities more professionally</h2>
        <p>
          Access BUP LearnHub and experience a centralized academic learning
          environment.
        </p>
        <Link to="/login">
          Continue to Login <ArrowRight size={18} />
        </Link>
      </section>

      <footer className="home-footer">
        <p>Ã‚Â© 2026 BUP LearnHub. A Web-Based Learning Management System.</p>
      </footer>
    </div>
  );
};

export default Home;