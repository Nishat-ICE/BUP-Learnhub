import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import Layout from "../components/Layout.jsx";
import { AuthorityDepartmentAnalytics } from "../components/RoleDashboardCharts.jsx";
import api from "../api/api";
import "../styles/leadership.css";

const messageOf = (err) =>
  err.response?.data?.message || err.message || "Request failed.";

export default function AuthorityPanel() {
  const [report, setReport] = useState(null);
  const [notice, setNotice] = useState(null);

  useEffect(() => {
    api
      .get("/management/report")
      .then((res) => setReport(res.data))
      .catch((err) => setNotice({ kind: "error", text: messageOf(err) }));
  }, []);

  return (
    <Layout title="Authority Reports">
      <div className="lead-page">
        <section className="lead-hero">
          <span>UNIVERSITY OVERSIGHT</span>
          <h1>An informed view of academic activity.</h1>
          <p>
            Review department-wise academic summaries, monitor course activity
            graphs, and export university-wide reports.
          </p>
        </section>

        {notice && (
          <div className={`lead-alert ${notice.kind}`} role="alert">
            {notice.text}
          </div>
        )}

        <AuthorityDepartmentAnalytics report={report} />

        <div className="lead-panel">
          <h3>Other academic information</h3>
          <div className="lead-links">
            <Link to="/policies">Policies &amp; Guidelines</Link>
            <Link to="/academic-updates">Calendar &amp; class reschedules</Link>
            <Link to="/announcements">Academic announcements</Link>
          </div>
          <p className="lead-footnote">
            These reports contain aggregate course activity, not individual
            students&apos; private grades.
          </p>
        </div>
      </div>
    </Layout>
  );
}