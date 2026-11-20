import React, { useEffect, useState } from "react";
import Layout from "../components/Layout.jsx";
import api from "../api/api";
import {
  CalendarDays,
  Download,
  Eye,
  FileText,
  Pencil,
  Printer,
  Sparkles,
  Trash2,
  UploadCloud,
  Wand2,
  X
} from "lucide-react";
import "../styles/routines.css";

const newForm = () => ({
  title: "",
  description: "",
  term: "Fall 2026",
  rooms: "Room 401, Room 402, ICT Lab 1",
  sessionsPerCourse: 2
});

const errorMessage = (error) =>
  error.response?.data?.message ||
  error.message ||
  "Routine request failed.";

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function RoutineTimetableGrid({
  days = [],
  slots = [],
  entries = [],
  editable = false,
  onChangeCell
}) {
  const getCellEntries = (day, slot) =>
    entries.filter((e) => e.day === day && e.slot === slot);

  return (
    <div className="rt-grid-wrap">
      <table className="rt-timetable">
        <thead>
          <tr>
            <th>Day / Time</th>
            {slots.map((slot) => (
              <th key={slot}>{slot}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {days.map((day) => (
            <tr key={day}>
              <td className="rt-day-cell">
                <strong>{day}</strong>
              </td>
              {slots.map((slot) => {
                const cellItems = getCellEntries(day, slot);
                return (
                  <td key={slot} className="rt-slot-cell">
                    {cellItems.length === 0 ? (
                      <span className="rt-free-slot">—</span>
                    ) : (
                      cellItems.map((item, idx) => (
                        <div className="rt-class-pill" key={idx}>
                          <div className="rt-pill-top">
                            <strong>{item.courseCode}</strong>
                            {editable ? (
                              <input
                                className="rt-room-input"
                                value={item.room}
                                onChange={(e) =>
                                  onChangeCell &&
                                  onChangeCell(day, slot, idx, "room", e.target.value)
                                }
                                title="Edit Room"
                              />
                            ) : (
                              <span className="rt-room-badge">{item.room}</span>
                            )}
                          </div>
                          <span className="rt-course-name">{item.courseTitle}</span>
                          <small className="rt-fac-name">{item.facultyName}</small>
                        </div>
                      ))
                    )}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function Routines() {
  const user = JSON.parse(localStorage.getItem("user") || "{}");
  const isStaff = user.role === "staff";
  const department =
    typeof user.department === "string" ? user.department.trim() : "";

  const [mode, setMode] = useState("auto"); // "auto" | "file"
  const [routines, setRoutines] = useState([]);
  const [form, setForm] = useState(newForm);
  const [generatedGrid, setGeneratedGrid] = useState(null);

  const [file, setFile] = useState(null);
  const [fileKey, setFileKey] = useState(0);
  const [editingId, setEditingId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState(null);
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
    setGeneratedGrid(null);
    setFile(null);
    setFileKey((current) => current + 1);
  }

  function editRoutine(item) {
    setEditingId(item._id);
    setForm({
      title: item.title || "",
      description: item.description || "",
      term: item.term || "Fall 2026",
      rooms: "Room 401, Room 402, ICT Lab 1",
      sessionsPerCourse: 2
    });

    if (item.kind === "generated" && item.entries?.length) {
      setMode("auto");
      setGeneratedGrid({
        days: item.days?.length
          ? item.days
          : ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday"],
        slots: item.slots?.length
          ? item.slots
          : ["08:30 - 09:50", "10:00 - 11:20", "11:30 - 12:50", "14:00 - 15:20"],
        entries: item.entries
      });
    } else {
      setMode("file");
      setGeneratedGrid(null);
    }

    setFile(null);
    setFileKey((current) => current + 1);
    setMessage(null);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function handleAutoGenerate() {
    setBusy(true);
    setMessage(null);

    try {
      const res = await api.post("/routines/auto-generate", {
        rooms: form.rooms,
        sessionsPerCourse: Number(form.sessionsPerCourse) || 2
      });

      setGeneratedGrid({
        days: res.data.days,
        slots: res.data.slots,
        entries: res.data.entries
      });

      if (!form.title.trim()) {
        setForm((prev) => ({
          ...prev,
          title: `${res.data.department} Department Class Routine (${
            prev.term || "Current Semester"
          })`
        }));
      }

      setMessage({
        type: "success",
        text: `Smart timetable generated automatically for ${res.data.courseCount} courses in ${res.data.department} without any faculty or room clash!`
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

  function updateCellField(day, slot, matchIdx, field, value) {
    if (!generatedGrid) return;
    let seen = -1;
    const nextEntries = generatedGrid.entries.map((entry) => {
      if (entry.day === day && entry.slot === slot) {
        seen += 1;
        if (seen === matchIdx) {
          return { ...entry, [field]: value };
        }
      }
      return entry;
    });
    setGeneratedGrid({ ...generatedGrid, entries: nextEntries });
  }

  async function saveGeneratedRoutine(event) {
    event.preventDefault();
    setMessage(null);

    if (!generatedGrid || !generatedGrid.entries?.length) {
      setMessage({
        type: "error",
        text: "Click 'Auto-Generate Timetable Grid' first to build the schedule."
      });
      return;
    }

    setBusy(true);
    try {
      const payload = {
        title: form.title.trim(),
        description: form.description.trim(),
        term: form.term.trim(),
        days: generatedGrid.days,
        slots: generatedGrid.slots,
        entries: generatedGrid.entries
      };

      if (editingId) {
        await api.put(`/routines/${editingId}/generated`, payload);
      } else {
        await api.post("/routines/generated", payload);
      }

      const wasEditing = Boolean(editingId);
      resetForm();
      await loadRoutines();

      setMessage({
        type: "success",
        text: wasEditing
          ? "Auto-generated routine updated!"
          : "Auto-generated routine published for your department!"
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

  async function saveFileRoutine(event) {
    event.preventDefault();
    setMessage(null);

    if (!editingId && !file) {
      setMessage({
        type: "error",
        text: "Choose a routine image or file."
      });
      return;
    }

    setBusy(true);
    try {
      const body = new FormData();
      body.append("title", form.title.trim());
      body.append("description", form.description.trim());
      body.append("term", form.term.trim());
      if (file) body.append("file", file);

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
          ? "Routine file updated."
          : "Routine file uploaded and published."
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
    if (!window.confirm(`Delete "${item.title}"?`)) return;
    setBusy(true);
    setMessage(null);

    try {
      await api.delete(`/routines/${item._id}`);
      if (editingId === item._id) resetForm();
      await loadRoutines();
      setMessage({ type: "success", text: "Routine deleted." });
    } catch (error) {
      setMessage({ type: "error", text: errorMessage(error) });
    } finally {
      setBusy(false);
    }
  }

  function printOrDownloadGeneratedPdf(item) {
    const win = window.open("", "_blank");
    if (!win) {
      alert("Please allow popups to download/print the PDF routine.");
      return;
    }

    const days = item.days?.length
      ? item.days
      : ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday"];
    const slots = item.slots?.length
      ? item.slots
      : ["08:30 - 09:50", "10:00 - 11:20", "11:30 - 12:50", "14:00 - 15:20"];
    const entries = item.entries || [];

    const slotHeaders = slots.map((s) => `<th>${escapeHtml(s)}</th>`).join("");
    const bodyRows = days
      .map((day) => {
        const cells = slots
          .map((slot) => {
            const matches = entries.filter(
              (e) => e.day === day && e.slot === slot
            );
            if (!matches.length) {
              return `<td style="text-align:center;color:#94a3b8;">—</td>`;
            }
            return `<td>${matches
              .map(
                (m) => `
                <div style="padding:6px;border-radius:6px;background:#f0fdfa;border:1px solid #99f6e4;margin-bottom:4px;">
                  <div style="display:flex;justify-content:space-between;font-weight:800;color:#0f766e;">
                    <span>${escapeHtml(m.courseCode)}</span>
                    <span style="background:#0b3b4a;color:#fff;padding:1px 6px;border-radius:4px;font-size:10px;">${escapeHtml(
                      m.room
                    )}</span>
                  </div>
                  <div style="font-weight:700;color:#0f172a;margin-top:3px;">${escapeHtml(
                    m.courseTitle
                  )}</div>
                  <div style="font-size:11px;color:#475569;">${escapeHtml(
                    m.facultyName
                  )}</div>
                </div>`
              )
              .join("")}</td>`;
          })
          .join("");
        return `<tr><td style="font-weight:800;background:#f8fafc;">${escapeHtml(
          day
        )}</td>${cells}</tr>`;
      })
      .join("");

    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8" />
        <title>${escapeHtml(item.title)}</title>
        <style>
          @page { size: landscape; margin: 12mm; }
          body { font-family: "Segoe UI", Arial, sans-serif; color: #0f172a; padding: 16px; }
          .head { border-bottom: 2px solid #0b3b4a; padding-bottom: 10px; margin-bottom: 16px; display:flex; justify-content:space-between; }
          h1 { margin: 0 0 4px; font-size: 20px; color: #0b3b4a; }
          p { margin: 2px 0; font-size: 12.5px; color: #475569; }
          table { width: 100%; border-collapse: collapse; font-size: 12px; }
          th, td { border: 1px solid #cbd5e1; padding: 8px; vertical-align: top; }
          th { background: #0b3b4a; color: #ffffff; font-weight: 800; }
        </style>
      </head>
      <body>
        <div class="head">
          <div>
            <h1>BUP LearnHub — Official Class Routine</h1>
            <p><strong>${escapeHtml(item.title)}</strong></p>
            <p>Department: ${escapeHtml(item.department)} ${
      item.term ? `| Term: ${escapeHtml(item.term)}` : ""
    }</p>
          </div>
          <div style="text-align:right;">
            <p>Generated: ${escapeHtml(new Date().toLocaleDateString())}</p>
            <p>Applies to: All Sections</p>
          </div>
        </div>
        <table>
          <thead><tr><th>Day / Time</th>${slotHeaders}</tr></thead>
          <tbody>${bodyRows}</tbody>
        </table>
        <script>
          window.onload = function() { setTimeout(function() { window.print(); }, 250); };
        </script>
      </body>
      </html>
    `;

    win.document.open();
    win.document.write(html);
    win.document.close();
  }

  async function viewRoutineInline(item) {
    if (item.kind === "generated" && item.entries?.length) {
      setViewer({
        title: item.title,
        department: item.department,
        term: item.term,
        isGenerated: true,
        days: item.days,
        slots: item.slots,
        entries: item.entries,
        rawItem: item
      });
      return;
    }

    setBusy(true);
    setMessage(null);

    try {
      const name = (item.originalName || "").toLowerCase();
      const mime = item.mimeType || "";

      if (name.endsWith(".docx") || mime.includes("wordprocessingml")) {
        const previewRes = await api.get(`/routines/${item._id}/preview`);
        if (previewRes.data?.kind === "html") {
          if (viewer?.url) URL.revokeObjectURL(viewer.url);
          setViewer({
            title: item.title,
            originalName: item.originalName,
            department: item.department,
            term: item.term,
            htmlContent: previewRes.data.html,
            isHtml: true
          });
          return;
        }
      }

      const response = await api.get(`/routines/${item._id}/file`, {
        responseType: "blob"
      });

      const blobMime =
        item.mimeType || response.data.type || "application/octet-stream";
      const blob = new Blob([response.data], { type: blobMime });
      const objectUrl = URL.createObjectURL(blob);

      if (viewer?.url) URL.revokeObjectURL(viewer.url);

      setViewer({
        title: item.title,
        originalName: item.originalName,
        department: item.department,
        term: item.term,
        url: objectUrl,
        isImage: /^image\//i.test(blobMime) || /\.(png|jpg|jpeg)$/i.test(name),
        isPdf: blobMime === "application/pdf" || /\.pdf$/i.test(name)
      });
    } catch (error) {
      setMessage({ type: "error", text: errorMessage(error) });
    } finally {
      setBusy(false);
    }
  }

  async function downloadRoutineFile(item) {
    if (item.kind === "generated" && item.entries?.length) {
      printOrDownloadGeneratedPdf(item);
      return;
    }

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
      setMessage({ type: "error", text: errorMessage(error) });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Layout title="Class Routines">
      <div className="routine-page">
        <section className="panel routine-hero">
          <div>
            <span className="routine-eyebrow">SMART ACADEMIC TIMETABLES</span>
            <h2>Class Routines &amp; Auto-Generator</h2>
            <p>
              {isStaff
                ? "Automatically generate a conflict-free class routine from your department's courses, or upload an existing routine file."
                : "View or download published class routines for your registered department."}
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
              <div className="rt-mode-tabs">
                <button
                  type="button"
                  className={
                    mode === "auto"
                      ? "routine-primary"
                      : "routine-secondary"
                  }
                  onClick={() => setMode("auto")}
                >
                  <Wand2 size={16} /> Auto-Generate Routine (Smart Timetable)
                </button>
                <button
                  type="button"
                  className={
                    mode === "file"
                      ? "routine-primary"
                      : "routine-secondary"
                  }
                  onClick={() => setMode("file")}
                >
                  <UploadCloud size={16} /> Upload Routine File (PDF / Image)
                </button>
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

            {mode === "auto" ? (
              <form className="routine-form" onSubmit={saveGeneratedRoutine}>
                <label>
                  Routine title
                  <input
                    value={form.title}
                    maxLength="120"
                    onChange={(e) =>
                      setForm({ ...form, title: e.target.value })
                    }
                    placeholder="e.g. ICT Fall 2026 Class Routine"
                    required
                  />
                </label>

                <label>
                  Semester / Term
                  <input
                    value={form.term}
                    maxLength="80"
                    onChange={(e) => setForm({ ...form, term: e.target.value })}
                    placeholder="e.g. Fall 2026"
                  />
                </label>

                <label>
                  Available Rooms / Labs (comma-separated)
                  <input
                    value={form.rooms}
                    onChange={(e) =>
                      setForm({ ...form, rooms: e.target.value })
                    }
                    placeholder="Room 401, Room 402, ICT Lab 1"
                  />
                </label>

                <label>
                  Classes per Course / Week
                  <select
                    value={form.sessionsPerCourse}
                    onChange={(e) =>
                      setForm({
                        ...form,
                        sessionsPerCourse: Number(e.target.value)
                      })
                    }
                  >
                    <option value={1}>1 Class / Week per Course</option>
                    <option value={2}>2 Classes / Week per Course</option>
                    <option value={3}>3 Classes / Week per Course</option>
                  </select>
                </label>

                <label className="routine-full">
                  Notes / Description (optional)
                  <input
                    value={form.description}
                    maxLength="700"
                    onChange={(e) =>
                      setForm({ ...form, description: e.target.value })
                    }
                    placeholder="e.g. Break from 01:00 PM - 02:00 PM"
                  />
                </label>

                <div className="routine-full rt-gen-bar">
                  <button
                    type="button"
                    className="routine-secondary"
                    disabled={busy}
                    onClick={handleAutoGenerate}
                  >
                    <Sparkles size={16} />{" "}
                    {generatedGrid
                      ? "Re-Generate Smart Timetable"
                      : "Auto-Generate Timetable Grid"}
                  </button>

                  {generatedGrid && (
                    <button
                      type="submit"
                      className="routine-primary"
                      disabled={busy}
                    >
                      <Wand2 size={16} />{" "}
                      {busy
                        ? "Publishing..."
                        : editingId
                        ? "Update Generated Routine"
                        : "Publish Auto-Generated Routine"}
                    </button>
                  )}
                </div>

                {generatedGrid && (
                  <div className="routine-full">
                    <RoutineTimetableGrid
                      days={generatedGrid.days}
                      slots={generatedGrid.slots}
                      entries={generatedGrid.entries}
                      editable
                      onChangeCell={updateCellField}
                    />
                  </div>
                )}
              </form>
            ) : (
              <form className="routine-form" onSubmit={saveFileRoutine}>
                <label>
                  Routine title
                  <input
                    value={form.title}
                    maxLength="120"
                    onChange={(e) =>
                      setForm({ ...form, title: e.target.value })
                    }
                    placeholder="e.g. ICT Semester 5 Routine"
                    required
                  />
                </label>

                <label>
                  Semester / term
                  <input
                    value={form.term}
                    maxLength="80"
                    onChange={(e) => setForm({ ...form, term: e.target.value })}
                    placeholder="e.g. Fall 2026"
                  />
                </label>

                <label className="routine-full">
                  Description (optional)
                  <textarea
                    rows="2"
                    maxLength="700"
                    value={form.description}
                    onChange={(e) =>
                      setForm({ ...form, description: e.target.value })
                    }
                  />
                </label>

                <label className="routine-full">
                  Routine picture/file
                  <input
                    key={fileKey}
                    type="file"
                    accept=".pdf,.png,.jpg,.jpeg,.docx,.xlsx,.pptx"
                    onChange={(e) => setFile(e.target.files?.[0] || null)}
                    required={!editingId}
                  />
                </label>

                <button
                  type="submit"
                  className="routine-primary"
                  disabled={busy}
                >
                  <UploadCloud size={17} />{" "}
                  {busy ? "Saving..." : "Upload and publish"}
                </button>
              </form>
            )}
          </section>
        )}

        <section className="panel">
          <div className="routine-heading">
            <div>
              <h3>Published Routines</h3>
              <span className="routine-count">{routines.length} routines</span>
            </div>
          </div>

          {loading ? (
            <p className="routine-empty">Loading routines...</p>
          ) : routines.length === 0 ? (
            <div className="routine-empty">
              <FileText size={30} />
              <p>No routine has been published for your department yet.</p>
            </div>
          ) : (
            <div className="routine-grid">
              {routines.map((item) => (
                <article className="routine-card" key={item._id}>
                  <div className="routine-card-top">
                    <div className="routine-file-icon">
                      {item.kind === "generated" ? (
                        <Wand2 size={22} />
                      ) : (
                        <FileText size={22} />
                      )}
                    </div>
                    <span className="routine-published">
                      {item.kind === "generated"
                        ? "Auto-Generated Timetable"
                        : "Published File"}
                    </span>
                  </div>

                  <h4>{item.title}</h4>
                  <p className="routine-description">
                    {item.description || "Official department class timetable"}
                  </p>

                  <div className="routine-meta">
                    <span>Department: {item.department}</span>
                    {item.term && <span>Term: {item.term}</span>}
                    <span>
                      {item.kind === "generated"
                        ? `Scheduled Classes: ${item.entries?.length || 0} slots (Sun - Thu)`
                        : `File: ${item.originalName}`}
                    </span>
                  </div>

                  <div className="routine-actions">
                    <button
                      type="button"
                      className="routine-secondary"
                      disabled={busy}
                      onClick={() => viewRoutineInline(item)}
                    >
                      <Eye size={16} /> View Routine
                    </button>

                    <button
                      type="button"
                      className="routine-primary"
                      disabled={busy}
                      onClick={() => downloadRoutineFile(item)}
                    >
                      {item.kind === "generated" ? (
                        <>
                          <Printer size={16} /> Download PDF
                        </>
                      ) : (
                        <>
                          <Download size={16} /> Download
                        </>
                      )}
                    </button>

                    {isStaff && (
                      <>
                        <button
                          type="button"
                          className="routine-secondary"
                          onClick={() => editRoutine(item)}
                        >
                          <Pencil size={15} /> Edit
                        </button>
                        <button
                          type="button"
                          className="routine-danger"
                          disabled={busy}
                          onClick={() => deleteRoutine(item)}
                        >
                          <Trash2 size={15} /> Delete
                        </button>
                      </>
                    )}
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>

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
                    {viewer.term ? ` | ${viewer.term}` : ""}
                  </small>
                </div>

                <div style={{ display: "flex", gap: "8px" }}>
                  {viewer.isGenerated && (
                    <button
                      type="button"
                      className="routine-primary"
                      onClick={() => printOrDownloadGeneratedPdf(viewer.rawItem)}
                    >
                      <Printer size={15} /> Download / Print PDF
                    </button>
                  )}
                  <button
                    type="button"
                    className="routine-danger"
                    onClick={closeViewer}
                  >
                    <X size={16} /> Close
                  </button>
                </div>
              </div>

              <div
                className="routine-modal-body"
                style={
                  viewer.isGenerated
                    ? { background: "#f8fafc", alignItems: "flex-start" }
                    : undefined
                }
              >
                {viewer.isGenerated ? (
                  <RoutineTimetableGrid
                    days={viewer.days}
                    slots={viewer.slots}
                    entries={viewer.entries}
                  />
                ) : viewer.isHtml ? (
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