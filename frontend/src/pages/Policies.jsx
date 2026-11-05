import React, { useEffect, useState } from "react";
import { ScrollText } from "lucide-react";
import Layout from "../components/Layout.jsx";
import api from "../api/api";
import "../styles/leadership.css";
import "../styles/policies.css";

const blank = {
  title: "",
  content: "",
  status: "published"
};

const dateText = (value) => {
  if (!value) return "";
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? ""
    : date.toLocaleDateString("en-GB", {
        day: "numeric",
        month: "long",
        year: "numeric"
      });
};

export default function Policies() {
  const user = JSON.parse(localStorage.getItem("user") || "{}");
  const isAuthority = user.role === "authority";

  const [policies, setPolicies] = useState([]);
  const [form, setForm] = useState({ ...blank });
  const [editingId, setEditingId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState(null);

  async function loadPolicies() {
    setLoading(true);
    try {
      const response = await api.get("/management/policies");
      const list = Array.isArray(response.data) ? response.data : [];
      setPolicies(
        isAuthority
          ? list
          : list.filter((item) => item.status === "published")
      );
    } catch (requestError) {
      setNotice({
        kind: "error",
        text:
          requestError.response?.data?.message ||
          "Policies could not be loaded. Check the backend server."
      });
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadPolicies();
  }, [isAuthority]);

  async function savePolicy(event) {
    event.preventDefault();
    setBusy(true);
    setNotice(null);

    try {
      if (editingId) {
        await api.put(`/management/policies/${editingId}`, form);
      } else {
        await api.post("/management/policies", form);
      }

      setForm({ ...blank });
      setEditingId(null);
      await loadPolicies();

      setNotice({
        kind: "success",
        text: editingId ? "Policy updated." : "Policy published."
      });
    } catch (err) {
      setNotice({
        kind: "error",
        text: err.response?.data?.message || err.message || "Request failed."
      });
    } finally {
      setBusy(false);
    }
  }

  function editPolicy(policy) {
    setEditingId(policy._id);
    setForm({
      title: policy.title || "",
      content: policy.content || "",
      status: policy.status || "published"
    });
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  return (
    <Layout title="Policies & Guidelines">
      <div className="policies-page lead-page">
        <section className="panel policies-intro">
          <div>
            <span className="policies-eyebrow">UNIVERSITY GUIDANCE</span>
            <h2>Policies &amp; Guidelines</h2>
            <p>
              {isAuthority
                ? "Publish, update, or archive official university policies and academic guidelines."
                : "Official policies and academic guidance published by the University Authority."}
            </p>
          </div>

          <ScrollText size={32} />
        </section>

        {notice && (
          <div className={`lead-alert ${notice.kind}`} role="alert">
            {notice.text}
          </div>
        )}

        {isAuthority ? (
          <div className="lead-columns">
            <div className="lead-panel">
              <div className="lead-header">
                <h2>{editingId ? "Edit policy" : "Publish a policy"}</h2>

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
                      setForm({ ...form, title: e.target.value })
                    }
                    placeholder="Enter policy title"
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
                      setForm({ ...form, content: e.target.value })
                    }
                    placeholder="Write official policy guidelines..."
                    required
                  />
                </label>

                <label className="lead-full">
                  Status
                  <select
                    value={form.status}
                    onChange={(e) =>
                      setForm({ ...form, status: e.target.value })
                    }
                  >
                    <option value="published">Published (Visible to all)</option>
                    <option value="archived">Archived (Hidden)</option>
                  </select>
                </label>

                <button type="submit" className="lead-primary" disabled={busy}>
                  {busy
                    ? "Saving..."
                    : editingId
                    ? "Update policy"
                    : "Publish policy"}
                </button>
              </form>
            </div>

            <div className="lead-panel">
              <h2>Policy records</h2>

              {loading ? (
                <p className="lead-muted">Loading policies...</p>
              ) : policies.length === 0 ? (
                <p className="lead-muted">No policies have been published yet.</p>
              ) : (
                policies.map((policy) => (
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
                      Updated {dateText(policy.updatedAt || policy.createdAt)}
                    </small>

                    <button
                      type="button"
                      className="lead-quiet"
                      onClick={() => editPolicy(policy)}
                    >
                      Edit / archive
                    </button>
                  </article>
                ))
              )}
            </div>
          </div>
        ) : (
          <>
            {loading && (
              <div className="panel policies-empty">
                Loading published policies...
              </div>
            )}

            {!loading && policies.length === 0 && (
              <div className="panel policies-empty">
                <ScrollText size={30} />
                <h3>No published policies yet</h3>
                <p>
                  Policies will appear here after the University Authority
                  publishes them.
                </p>
              </div>
            )}

            <div className="policies-list">
              {policies.map((policy) => (
                <article className="panel policy-card" key={policy._id}>
                  <span className="policy-status">Published</span>

                  <h3>{policy.title}</h3>

                  <p className="policy-content">{policy.content}</p>

                  <div className="policy-meta">
                    <span>
                      Published by{" "}
                      {policy.createdBy?.name || "University Authority"}
                    </span>

                    <span>
                      Updated {dateText(policy.updatedAt || policy.createdAt)}
                    </span>
                  </div>
                </article>
              ))}
            </div>
          </>
        )}
      </div>
    </Layout>
  );
}