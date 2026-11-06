import React, { useEffect, useState } from "react";
import Layout from "../components/Layout.jsx";
import api from "../api/api";
import {
  CalendarDays,
  Download,
  Eye,
  FileText,
  Pencil,
  Trash2,
  UploadCloud,
  X
} from "lucide-react";
import "../styles/routines.css";

const newForm = () => ({
  title: "",
  description: "",
  term: ""
});

const errorMessage = (error) =>
  error.response?.data?.message ||
  error.message ||
  "Routine request failed.";

export default function Routines() {
  const user = JSON.parse(localStorage.getItem("user") || "{}");
  const isStaff = user.role === "staff";
  const department =
    typeof user.department === "string" ? user.department.trim() : "";

  const [routines, setRoutines] = useState([]);
  const [form, setForm] = useState(newForm);
  const [file, setFile] = useState(null);
  const [fileKey, setFileKey] = useState(0);
  const [editingId, setEditingId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState(null);

  // In-app Routine Viewer Modal state
  const [viewer, setViewer] = useState(null);

  async function loadRoutines() {
    const response = await api.get("/routines");
    setRoutines(response.data);
  }

  useEffect(() => {
    loadRoutines()
      .catch((error) => {
        setMessage({
          type: "error",
          text: errorMessage(error)
        });
      })
      .finally(() => setLoading(false));
  }, []);

  function closeViewer() {
    if (viewer?.url) {
      URL.revokeObjectURL(viewer.url);
    }
    setViewer(null);
  }

  function resetForm() {
    setEditingId(null);
    setForm(newForm());
    setFile(null);
    setFileKey((current) => current + 1);
  }

  function editRoutine(item) {
    setEditingId(item._id);
    setForm({
      title: item.title || "",
      description: item.description || "",
      term: item.term || ""
    });
    setFile(null);
    setFileKey((current) => current + 1);
    setMessage(null);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function saveRoutine(event) {
    event.preventDefault();
    setMessage(null);

    if (!department) {
      setMessage({
        type: "error",
        text: "Your account has no department assigned. Ask Admin to update your profile."
      });
      return;
    }

    if (!editingId && !file) {
      setMessage({
        type: "error",
        text: "Choose a routine image or file."
      });
      return;
    }

    if (file && file.size > 10 * 1024 * 1024) {
      setMessage({
        type: "error",
        text: "File must be 10 MB or smaller."
      });
      return;
    }

    setBusy(true);

    try {
      const body = new FormData();
      body.append("title", form.title.trim());
      body.append("description", form.description.trim());
      body.append("term", form.term.trim());

      if (file) {
        body.append("file", file);
      }

      if (editingId) {
        await api.put(`/routines/${editingId}`, body);
      } else {
        await api.post("/routines", body);
      }

      const wasEditing = Boolean(editingId);
      resetForm();
      await loadRoutines();

      setMessage({
        type: "success",
        text: wasEditing
          ? "Routine updated for your registered department."
          : "Routine uploaded and published for your registered department."
      });
    } catch (error) {
      setMessage({
        type: "error",
        text: errorMessage(error)
      });
    } finally {
      setBusy(false);
    }
  }

  async function deleteRoutine(item) {
    if (!window.confirm(`Delete "${item.title}"?`)) {
      return;
    }

    setBusy(true);
    setMessage(null);

    try {
      await api.delete(`/routines/${item._id}`);
      if (editingId === item._id) {
        resetForm();
      }
      await loadRoutines();

      setMessage({
        type: "success",
        text: "Routine deleted."
      });
    } catch (error) {
      setMessage({
        type: "error",
        text: errorMessage(error)
      });
    } finally {
      setBusy(false);
    }
  }

  async function viewRoutineInline(item) {
    setBusy(true);
    setMessage(null);

    try {
      const name = (item.originalName || "").toLowerCase();
      const mime = item.mimeType || "";

      // If it is a .docx Word file, fetch converted HTML from backend
      if (name.endsWith(".docx") || mime.includes("wordprocessingml")) {
        const previewRes = await api.get(`/routines/${item._id}/preview`);
        if (previewRes.data?.kind === "html") {
          if (viewer?.url) URL.revokeObjectURL(viewer.url);
          setViewer({
            title: item.title,
            originalName: item.originalName,
            department: item.department,
            term: item.term,
            url: null,
            htmlContent: previewRes.data.html,
            isImage: false,
            isPdf: false,
            isHtml: true
          });
          return;
        }
      }

      const response = await api.get(`/routines/${item._id}/file`, {
        responseType: "blob"
      });

      const blobMime =
        item.mimeType ||
        response.data.type ||
        "application/octet-stream";

      const blob = new Blob([response.data], { type: blobMime });
      const objectUrl = URL.createObjectURL(blob);

      const isImage =
        /^image\//i.test(blobMime) || /\.(png|jpg|jpeg)$/i.test(name);
      const isPdf =
        blobMime === "application/pdf" || /\.pdf$/i.test(name);

      if (viewer?.url) {
        URL.revokeObjectURL(viewer.url);
      }

      setViewer({
        title: item.title,
        originalName: item.originalName,
        department: item.department,
        term: item.term,
        url: objectUrl,
        htmlContent: "",
        isImage,
        isPdf,
        isHtml: false
      });
    } catch (error) {
      setMessage({
        type: "error",
        text: errorMessage(error)
      });
    } finally {
      setBusy(false);
    }
  }

  async function downloadRoutineFile(item) {
    setBusy(true);
    setMessage(null);

    try {
      const response = await api.get(`/routines/${item._id}/file`, {
        params: { download: 1 },
        responseType: "blob"
      });

      const blob = new Blob([response.data], {
        type: item.mimeType || response.data.type || "application/octet-stream"
      });

      const objectUrl = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = objectUrl;
      link.download = item.originalName || "routine";
      document.body.appendChild(link);
      link.click();
      link.remove();

      window.setTimeout(() => URL.revokeObjectURL(objectUrl), 60000);
    } catch (error) {
      setMessage({
        type: "error",
        text: errorMessage(error)
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Layout title="Class Routines">
      <div className="routine-page">
        <section className="panel routine-hero">
          <div>
            <span className="routine-eyebrow">ACADEMIC TIMETABLES</span>
            <h2>Class Routines</h2>
            <p>
              {isStaff
                ? "Upload routines for the department assigned to your Staff account."
                : "View or download published routines for your registered department."}
            </p>
          </div>
          <CalendarDays size={32} />
        </section>

        {message && (
          <div className={`routine-message ${message.type}`} role="alert">
            {message.text}
          </div>
        )}

        {isStaff && (
          <section className="panel">
            <div className="routine-heading">
              <div>
                <span className="routine-eyebrow">STAFF WORKSPACE</span>
                <h3>{editingId ? "Edit routine" : "Upload a routine"}</h3>
              </div>

              {editingId && (
                <button
                  type="button"
                  className="routine-secondary"
                  onClick={resetForm}
                >
                  Cancel edit
                </button>
              )}
            </div>

            <form className="routine-form" onSubmit={saveRoutine}>
              <label>
                Routine title
                <input
                  value={form.title}
                  maxLength="120"
                  onChange={(event) =>
                    setForm({ ...form, title: event.target.value })
                  }
                  placeholder="e.g. ICT Semester 5 Routine"
                  required
                />
              </label>

              <label>
                Semester / term | optional
                <input
                  value={form.term}
                  maxLength="80"
                  onChange={(event) =>
                    setForm({ ...form, term: event.target.value })
                  }
                  placeholder="e.g. Fall 2026"
                />
              </label>

              <label className="routine-full">
                Description | optional
                <textarea
                  rows="3"
                  maxLength="700"
                  value={form.description}
                  onChange={(event) =>
                    setForm({ ...form, description: event.target.value })
                  }
                  placeholder="Additional routine information"
                />
              </label>

              <label className="routine-full">
                Routine picture/file
                <input
                  key={fileKey}
                  type="file"
                  accept=".pdf,.png,.jpg,.jpeg,.docx,.xlsx,.pptx"
                  onChange={(event) =>
                    setFile(event.target.files?.[0] || null)
                  }
                  required={!editingId}
                />
                <small>
                  PDF, JPG, PNG, DOCX, XLSX or PPTX | maximum 10 MB
                </small>

                {file && (
                  <span className="routine-file-name">
                    Selected: {file.name}
                  </span>
                )}

                {editingId && !file && (
                  <span className="routine-file-name">
                    No new file selected; current file stays.
                  </span>
                )}
              </label>

              {file && (
                <button
                  type="button"
                  className="routine-secondary routine-remove-file"
                  onClick={() => {
                    setFile(null);
                    setFileKey((current) => current + 1);
                  }}
                >
                  <X size={15} />
                  Remove selected file
                </button>
              )}

              <button
                type="submit"
                className="routine-primary"
                disabled={busy || !department}
              >
                <UploadCloud size={17} />
                {busy
                  ? "Saving..."
                  : editingId
                  ? "Save routine"
                  : "Upload and publish"}
              </button>
            </form>
          </section>
        )}

        <section className="panel">
          <div className="routine-heading">
            <div>
              <h3>Routines for your department</h3>
              <span className="routine-count">
                {routines.length} routines
              </span>
            </div>
          </div>

          {loading ? (
            <p className="routine-empty">Loading routines...</p>
          ) : routines.length === 0 ? (
            <div className="routine-empty">
              <FileText size={30} />
              <p>
                No routine has been published for your registered department yet.
              </p>
            </div>
          ) : (
            <div className="routine-grid">
              {routines.map((item) => (
                <article className="routine-card" key={item._id}>
                  <div className="routine-card-top">
                    <div className="routine-file-icon">
                      <FileText size={22} />
                    </div>
                    <span className="routine-published">Published</span>
                  </div>

                  <h4>{item.title}</h4>

                  <p className="routine-description">
                    {item.description || "Department class routine"}
                  </p>

                  <div className="routine-meta">
                    <span>Department: {item.department}</span>
                    <span>Applies to: All sections</span>
                    {item.term && <span>Term: {item.term}</span>}
                    <span>File: {item.originalName}</span>
                    <span>
                      Uploaded by {item.uploadedBy?.name || "Academic Staff"}
                    </span>
                  </div>

                  <div className="routine-actions">
                    <button
                      type="button"
                      className="routine-secondary"
                      disabled={busy}
                      onClick={() => viewRoutineInline(item)}
                    >
                      <Eye size={16} />
                      View
                    </button>

                    <button
                      type="button"
                      className="routine-primary"
                      disabled={busy}
                      onClick={() => downloadRoutineFile(item)}
                    >
                      <Download size={16} />
                      Download
                    </button>

                    {isStaff && (
                      <>
                        <button
                          type="button"
                          className="routine-secondary"
                          onClick={() => editRoutine(item)}
                        >
                          <Pencil size={15} />
                          Edit
                        </button>

                        <button
                          type="button"
                          className="routine-danger"
                          disabled={busy}
                          onClick={() => deleteRoutine(item)}
                        >
                          <Trash2 size={15} />
                          Delete
                        </button>
                      </>
                    )}
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>

        {/* In-Page Routine Preview Modal (No download required!) */}
        {viewer && (
          <div className="routine-modal-backdrop" onClick={closeViewer}>
            <div
              className="routine-modal-box"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="routine-modal-head">
                <div>
                  <strong>{viewer.title}</strong>
                  <small>
                    {viewer.department}
                    {viewer.term ? ` | ${viewer.term}` : ""} | {viewer.originalName}
                  </small>
                </div>

                <button
                  type="button"
                  className="routine-danger"
                  onClick={closeViewer}
                >
                  <X size={16} /> Close Preview
                </button>
              </div>

              <div className="routine-modal-body">
                {viewer.isHtml ? (
                  <div
                    className="routine-docx-preview"
                    dangerouslySetInnerHTML={{ __html: viewer.htmlContent }}
                  />
                ) : viewer.isImage ? (
                  <img
                    src={viewer.url}
                    alt={viewer.title}
                    className="routine-preview-img"
                  />
                ) : viewer.isPdf ? (
                  <iframe
                    src={viewer.url}
                    title={viewer.title}
                    className="routine-preview-frame"
                  />
                ) : (
                  <iframe
                    src={viewer.url}
                    title={viewer.title}
                    className="routine-preview-frame"
                  />
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </Layout>
  );
}