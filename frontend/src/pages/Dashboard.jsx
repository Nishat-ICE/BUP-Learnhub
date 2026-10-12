import React from "react";
import Layout from "../components/Layout.jsx";
import { BookOpen, FileText, ClipboardCheck, Bell, TrendingUp } from "lucide-react";

const Dashboard = () => {
  const cards = [
    { title: "Active Courses", value: "06", icon: <BookOpen />, cls: "blue" },
    { title: "Materials", value: "24", icon: <FileText />, cls: "green" },
    { title: "Assignments", value: "03", icon: <ClipboardCheck />, cls: "orange" },
    { title: "Notifications", value: "09", icon: <Bell />, cls: "purple" }
  ];

  return (
    <Layout title="Dashboard">
      <section className="hero">
        <span>Smart Academic Platform</span>
        <h1>Learning Management Made Elegant</h1>
        <p>
          Manage courses, assignments, quizzes, grades, announcements and
          academic progress from one centralized platform.
        </p>
      </section>

      <section className="stats">
        {cards.map((card, i) => (
          <div className={`stat ${card.cls}`} key={i}>
            <div className="stat-icon">{card.icon}</div>
            <div>
              <h3>{card.value}</h3>
              <p>{card.title}</p>
            </div>
          </div>
        ))}
      </section>

      <section className="grid-two">
        <div className="panel">
          <h3>Recent Announcements</h3>
          <div className="notice">
            <strong>Quiz Schedule Published</strong>
            <p>Data Structure quiz will be held on Sunday at 10:00 AM.</p>
          </div>
          <div className="notice">
            <strong>Assignment Deadline Reminder</strong>
            <p>Submit your Web Engineering assignment before Friday.</p>
          </div>
          <div className="notice">
            <strong>New Material Uploaded</strong>
            <p>Lecture slide for Database Normalization is now available.</p>
          </div>
        </div>

        <div className="panel">
          <h3>Academic Progress</h3>
          <div className="progress-item">
            <span>Web Engineering</span>
            <div className="bar"><div style={{ width: "82%" }} /></div>
          </div>
          <div className="progress-item">
            <span>Database System</span>
            <div className="bar"><div style={{ width: "75%" }} /></div>
          </div>
          <div className="summary">
            <TrendingUp size={22} />
            <p>Your overall activity is improving steadily.</p>
          </div>
        </div>
      </section>
    </Layout>
  );
};

export default Dashboard;