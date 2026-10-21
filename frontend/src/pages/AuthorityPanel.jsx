import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import Layout from "../components/Layout.jsx";
import LeadershipReport, {
  downloadAcademicCsv
} from "../components/LeadershipReport.jsx";
import api from "../api/api";
import "../styles/leadership.css";

const blank = {
  title: "",
  content: "",
  status: "published"
};

const messageOf = (err) =>
  err.response?.data?.message || err.message || "Request failed.";

export default function AuthorityPanel() {
  const [tab, setTab] = useState("overview");
  const [report, setReport] = useState(null);
  const [policies, setPolicies] = useState([]);
  const [form, setForm] = useState({ ...blank });
  const [editingId, setEditingId] = useState(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState(null);

  async function refresh() {
    const [reportResult, policyResult] = await Promise.all([
      api.get("/management/report"),
      api.get("/management/policies")
    ]);

    setReport(reportResult.data);
    setPolicies(policyResult.data);
  }

  useEffect(() => {
    refresh().catch((err) =>
      setNotice({ kind: "error", text: messageOf(err) })
    );
  }, []);

  async function savePolicy(event) {
    event.preventDefault();
    setBusy(true);
    setNotice(null);

    try {
      if (editingId) {
        await api.put(
          `/management/policies/${editingId}`,
          form
        );
      } else {
        await api.post("/management/policies", form);
      }

      setForm({ ...blank });
      setEditingId(null);
      await refresh();

      setNotice({
        kind: "success",
        text: editingId
          ? "Policy updated."
          : "Policy published."
      });
    } catch (err) {
      setNotice({ kind: "error", text: messageOf(err) });
    } finally {
      setBusy(false);
    }
  }

  const editPolicy = (policy) => {
    setEditingId(policy._id);
    setForm({
      title: policy.title,
      content: policy.content,
      status: policy.status
    });
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  async function exportCsv() {
    try {
      await downloadAcademicCsv();
    } catch (err) {
      setNotice({ kind: "error", text: messageOf(err) });
    }
  }

  return (
    <Layout title="University Authority">
      <div className="lead-page">
        <section className="lead-hero">
          <span>UNIVERSITY OVERSIGHT</span>
          <h1>An informed view of academic activity.</h1>
          <p>
            Review aggregate reports, monitor course activity and
            publish university policies and guidelines.
          </p>
        </section>

        <nav className="lead-tabs" aria-label="Authority sections">
          <button
            type="button"
            className={tab === "overview" ? "lead-tab active" : "lead-tab"}
            onClick={() => setTab("overview")}
          >
            Reports
          </button>

          <button
            type="button"
            className={tab === "policies" ? "lead-tab active" : "lead-tab"}
            onClick={() => setTab("policies")}
          >
            Policies & Guidelines
          </button>
        </nav>

        {notice && (
          <div
            className={`lead-alert ${notice.kind}`}
            role="alert"
          >
            {notice.text}
          </div>
        )}

        {tab === "overview" && (
          <>
            <div className="lead-header">
              <h2>Academic summary</h2>
              <button
                type="button"
                className="lead-primary"
                onClick={exportCsv}
              >
                Download CSV report
              </button>
            </div>

            <LeadershipReport report={report} />

            <div className="lead-panel">
              <h3>Other academic information</h3>
              <div className="lead-links">
                <Link to="/academic-updates">
                  Calendar & class reschedules
                </Link>
                <Link to="/announcements">
                  Academic announcements
                </Link>
              </div>
              <p className="lead-footnote">
                These reports contain aggregate course activity, not
                individual students' private grades.
              </p>
            </div>
          </>
        )}

        {tab === "policies" && (
          <div className="lead-columns">
            <div className="lead-panel">
              <div className="lead-header">
                <h2>
                  {editingId
                    ? "Edit policy"
                    : "Publish a policy"}
                </h2>

                {editingId && (
                  <button
                    type="button"
                    className="lead-quiet"
                    onClick={() => {
                      setEditingId(null);
                      setForm({ ...blank });
                    }}
                  >
                    Cancel
                  </button>
                )}
              </div>

              <form className="lead-form" onSubmit={savePolicy}>
                <label className="lead-full">
                  Title
                  <input
                    value={form.title}
                    maxLength="150"
                    onChange={(e) =>
                      setForm({
                        ...form,
                        title: e.target.value
                      })
                    }
                    required
                  />
                </label>

                <label className="lead-full">
                  Guidelines / policy text
                  <textarea
                    rows="8"
                    maxLength="5000"
                    value={form.content}
                    onChange={(e) =>
                      setForm({
                        ...form,
                        content: e.target.value
                      })
                    }
                    required
                  />
                </label>

                <label className="lead-full">
                  Status
                  <select
                    value={form.status}
                    onChange={(e) =>
                      setForm({
                        ...form,
                        status: e.target.value
                      })
                    }
                  >
                    <option value="published">Published</option>
                    <option value="archived">Archived</option>
                  </select>
                </label>

                <button
                  type="submit"
                  className="lead-primary"
                  disabled={busy}
                >
                  {busy ? "Saving..." : "Save policy"}
                </button>
              </form>
            </div>

            <div className="lead-panel">
              <h2>Policy records</h2>

              {policies.length === 0 && (
                <p className="lead-muted">
                  No policies have been published yet.
                </p>
              )}

              {policies.map((policy) => (
                <article className="lead-policy" key={policy._id}>
                  <div className="lead-header">
                    <h3>{policy.title}</h3>
                    <span
                      className={
                        policy.status === "published"
                          ? "lead-badge live"
                          : "lead-badge off"
                      }
                    >
                      {policy.status}
                    </span>
                  </div>

                  <p>{policy.content}</p>
                  <small>
                    Updated{" "}
                    {new Date(policy.updatedAt).toLocaleDateString()}
                  </small>

                  <button
                    type="button"
                    className="lead-quiet"
                    onClick={() => editPolicy(policy)}
                  >
                    Edit / archive
                  </button>
                </article>
              ))}
            </div>
          </div>
        )}
      </div>
    </Layout>
  );
}