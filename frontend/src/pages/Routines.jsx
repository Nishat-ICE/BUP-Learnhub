import React, { useEffect, useState } from "react";
import Layout from "../components/Layout.jsx";
import api from "../api/api";
import {
  CalendarDays,
  Download,
  Eye,
  FileText,
  GraduationCap,
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
  title: "SEMESTER FINAL EXAMINATION ROUTINE (JULY- DECEMBER 2026)",
  facultyHeader: "FACULTY OF SCIENCE AND TECHNOLOGY (FST)",
  programHeader: "PROGRAM: BICE & MICE",
  description: "",
  term: "July - December 2026",
  startDate: "2026-11-29",
  endDate: "2026-12-08",
  workingDays: 8,
  batches:
    "BICE 2023 (1330-1630), BICE 2024 (1330-1630), BICE 2025 (0900-1200), BICE 2026 (0900-1200), MICE 2026 (1330-1630)",
  batchSubjectsText: `BICE 2023: ICE-4105 Optical Communication ; ICE-4103 Information, Network and Software Security ; ICE-4101 Software Testing and Maintenance
BICE 2024: ICE-3201 Microprocessor and Computer Architecture ; ICE-3207 Software and Requirement Engineering ; ICE-3203 Microwave Engineering and Antenna
BICE 2025: ICE-2205 Signals and Systems ; ICE-2203 Database Management System ; ICE-2207 Computer Network
BICE 2026: MATH-1205 Mathematics-II (Ordinary and partial Differential Equations) ; ICE-1207 Discrete Mathematics ; ICE-1203 Electronic Devices and Circuit
MICE 2026: MICE-5102 Information and Cyber Security ; MICE-5103 Big Data Analytics and Design ; MICE-5101 Advanced Machine Learning`,
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

function fullDepartmentTitle(dept) {
  const raw = String(dept || "ICT").trim();
  if (raw.toUpperCase() === "ICT") {
    return "DEPARTMENT OF INFORMATION & COMMUNICATION TECHNOLOGY (ICT)";
  }
  if (raw.toUpperCase() === "CSE") {
    return "DEPARTMENT OF COMPUTER SCIENCE & ENGINEERING (CSE)";
  }
  if (raw.toUpperCase() === "ES") {
    return "DEPARTMENT OF ENVIRONMENTAL SCIENCE (ES)";
  }
  return `DEPARTMENT OF ${raw.toUpperCase()}`;
}

// ============================================================
// BUP OFFICIAL EXAM ROUTINE TABLE (Matches uploaded photo 100%)
// ============================================================
function BupExamRoutineSheet({
  facultyHeader,
  department,
  programHeader,
  title,
  batches = [],
  examDates = [],
  entries = [],
  editable = false,
  onChangeExamCell
}) {
  const getCellText = (dateStr, batchName) => {
    const found = entries.find(
      (e) => e.day === dateStr && e.slot === batchName
    );
    if (!found) return "";
    return `${found.courseCode ? found.courseCode + " " : ""}${
      found.courseTitle || ""
    }`.trim();
  };

  return (
    <div className="bup-exam-sheet">
      <div className="bup-exam-headers">
        <div className="bup-exam-line">{facultyHeader}</div>
        <div className="bup-exam-line">{fullDepartmentTitle(department)}</div>
        <div className="bup-exam-line">{programHeader}</div>
        <div className="bup-exam-line">{title}</div>
      </div>

      <div className="rt-grid-wrap">
        <table className="bup-exam-table">
          <thead>
            <tr>
              <th className="bup-diag-cell">
                <span className="diag-top-right">Batch</span>
                <span className="diag-bottom-left">Date</span>
              </th>
              {batches.map((b) => (
                <th key={b.name} className="bup-batch-th">
                  <div>{b.name}</div>
                  <div>{b.time}</div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {examDates.map((dRow) => (
              <tr key={dRow.dateStr}>
                <td className="bup-date-td">
                  <div>{dRow.dateStr}</div>
                  <div>{dRow.dayName}</div>
                </td>
                {batches.map((b) => {
                  const val = getCellText(dRow.dateStr, b.name);
                  return (
                    <td key={b.name} className="bup-exam-td">
                      {editable ? (
                        <textarea
                          rows="3"
                          className="bup-exam-cell-input"
                          value={val}
                          placeholder="Empty (Study Gap)"
                          onChange={(e) =>
                            onChangeExamCell &&
                            onChangeExamCell(dRow.dateStr, b.name, e.target.value)
                          }
                        />
                      ) : (
                        <div className="bup-exam-cell-text">{val}</div>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ============================================================
// WEEKLY CLASS TIMETABLE GRID
// ============================================================
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
                      <span className="rt-free-slot">-</span>
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
    typeof user.department === "string" ? user.department.trim() : "ICT";

  const [mode, setMode] = useState("exam"); // "exam" | "auto" | "file"
  const [routines, setRoutines] = useState([]);
  const [form, setForm] = useState(newForm);
  const [examGrid, setExamGrid] = useState(null);
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
    setExamGrid(null);
    setGeneratedGrid(null);
    setFile(null);
    setFileKey((current) => current + 1);
  }

  function editRoutine(item) {
    setEditingId(item._id);
    setForm({
      ...newForm(),
      title: item.title || "",
      facultyHeader:
        item.facultyHeader || "FACULTY OF SCIENCE AND TECHNOLOGY (FST)",
      programHeader: item.programHeader || "PROGRAM: BICE & MICE",
      description: item.description || "",
      term: item.term || "July - December 2026"
    });

    if (item.kind === "exam" && item.batches?.length) {
      setMode("exam");
      setExamGrid({
        batches: item.batches,
        examDates: item.examDates,
        entries: item.entries || []
      });
      setGeneratedGrid(null);
    } else if (item.kind === "generated" && item.entries?.length) {
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
      setExamGrid(null);
    } else {
      setMode("file");
      setExamGrid(null);
      setGeneratedGrid(null);
    }

    setFile(null);
    setFileKey((current) => current + 1);
    setMessage(null);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  // ---- 1. Auto-Generate BUP Exam Routine ----
  async function handleAutoGenerateExam() {
    setBusy(true);
    setMessage(null);

    try {
      const res = await api.post("/routines/auto-generate-exam", {
        startDate: form.startDate,
        endDate: form.endDate,
        batches: form.batches,
        batchSubjectsText: form.batchSubjectsText
      });

      setExamGrid({
        batches: res.data.batches,
        examDates: res.data.examDates,
        entries: res.data.entries
      });

      setMessage({
        type: "success",
        text: "BUP Official Semester Examination Routine generated with automatic study gaps (Fridays & Saturdays skipped)! You can edit any cell before publishing."
      });
    } catch (error) {
      setMessage({ type: "error", text: errorMessage(error) });
    } finally {
      setBusy(false);
    }
  }

  function updateExamCell(dateStr, batchName, rawText) {
    if (!examGrid) return;
    const text = rawText;
    const trimmed = text.trim();

    const firstSpace = trimmed.indexOf(" ");
    const courseCode =
      firstSpace > 0 && /^[A-Z]+-\d+/i.test(trimmed.slice(0, firstSpace))
        ? trimmed.slice(0, firstSpace)
        : "";
    const courseTitle = courseCode
      ? trimmed.slice(firstSpace + 1)
      : trimmed;

    const others = examGrid.entries.filter(
      (e) => !(e.day === dateStr && e.slot === batchName)
    );

    if (trimmed) {
      others.push({
        day: dateStr,
        slot: batchName,
        courseCode,
        courseTitle,
        room: ""
      });
    }

    setExamGrid({ ...examGrid, entries: others });
  }

  async function saveExamRoutine(event) {
    event.preventDefault();
    setMessage(null);

    if (!examGrid || !examGrid.batches?.length) {
      setMessage({
        type: "error",
        text: "Click 'Auto-Generate BUP Exam Routine' first to build the schedule."
      });
      return;
    }

    setBusy(true);
    try {
      const payload = {
        title: form.title.trim(),
        facultyHeader: form.facultyHeader.trim(),
        programHeader: form.programHeader.trim(),
        description: form.description.trim(),
        term: form.term.trim(),
        batches: examGrid.batches,
        examDates: examGrid.examDates,
        entries: examGrid.entries
      };

      if (editingId) {
        await api.put(`/routines/${editingId}/exam`, payload);
      } else {
        await api.post("/routines/exam", payload);
      }

      const wasEditing = Boolean(editingId);
      resetForm();
      await loadRoutines();

      setMessage({
        type: "success",
        text: wasEditing
          ? "Examination routine updated!"
          : "Official Examination Routine published for your department!"
      });
    } catch (error) {
      setMessage({ type: "error", text: errorMessage(error) });
    } finally {
      setBusy(false);
    }
  }

  // ---- 2. Auto-Generate Weekly Class Routine ----
  async function handleAutoGenerateClass() {
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

      setMessage({
        type: "success",
        text: `Smart class timetable generated for ${res.data.courseCount} courses!`
      });
    } catch (error) {
      setMessage({ type: "error", text: errorMessage(error) });
    } finally {
      setBusy(false);
    }
  }

  function updateClassCellField(day, slot, matchIdx, field, value) {
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

  async function saveGeneratedClassRoutine(event) {
    event.preventDefault();
    setMessage(null);

    if (!generatedGrid || !generatedGrid.entries?.length) {
      setMessage({
        type: "error",
        text: "Click 'Auto-Generate Class Timetable' first."
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

      resetForm();
      await loadRoutines();
      setMessage({
        type: "success",
        text: "Class routine published for your department!"
      });
    } catch (error) {
      setMessage({ type: "error", text: errorMessage(error) });
    } finally {
      setBusy(false);
    }
  }

  // ---- 3. File Upload Routine ----
  async function saveFileRoutine(event) {
    event.preventDefault();
    setMessage(null);

    if (!editingId && !file) {
      setMessage({ type: "error", text: "Choose a routine image or file." });
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

      resetForm();
      await loadRoutines();
      setMessage({ type: "success", text: "Routine file published." });
    } catch (error) {
      setMessage({ type: "error", text: errorMessage(error) });
    } finally {
      setBusy(false);
    }
  }

  async function deleteRoutine(item) {
    if (!window.confirm(`Delete "${item.title}"?`)) return;
    setBusy(true);
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

  // ---- Official BUP Exam Routine Print / PDF ----
  function printExamRoutinePdf(item) {
    const win = window.open("", "_blank");
    if (!win) {
      alert("Please allow popups to print/download the PDF routine.");
      return;
    }

    const batches = item.batches || [];
    const examDates = item.examDates || [];
    const entries = item.entries || [];

    const batchHeaders = batches
      .map(
        (b) =>
          `<th><div>${escapeHtml(b.name)}</div><div>${escapeHtml(b.time)}</div></th>`
      )
      .join("");

    const rowsHtml = examDates
      .map((d) => {
        const cells = batches
          .map((b) => {
            const found = entries.find(
              (e) => e.day === d.dateStr && e.slot === b.name
            );
            const txt = found
              ? `${found.courseCode ? found.courseCode + " " : ""}${
                  found.courseTitle || ""
                }`.trim()
              : "";
            return `<td>${escapeHtml(txt)}</td>`;
          })
          .join("");

        return `<tr>
          <td class="date-cell"><div>${escapeHtml(d.dateStr)}</div><div>${escapeHtml(
          d.dayName
        )}</div></td>
          ${cells}
        </tr>`;
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
          body { font-family: "Times New Roman", serif; color: #000; padding: 10px; }
          .headers { text-align: center; margin-bottom: 16px; }
          .headers div {
            font-size: 15px;
            font-weight: bold;
            text-decoration: underline;
            margin-bottom: 4px;
            text-transform: uppercase;
          }
          table { width: 100%; border-collapse: collapse; font-size: 13px; }
          th, td { border: 1px solid #000; padding: 7px 8px; vertical-align: top; text-align: left; }
          thead th { background: #d1d5db; text-align: center; font-weight: bold; }
          .date-cell { background: #d1d5db; width: 115px; font-weight: normal; }
          .diag {
            position: relative;
            width: 115px;
            height: 46px;
            background: linear-gradient(to top right, #d1d5db 49%, #000 50%, #d1d5db 51%);
          }
          .diag .b { position: absolute; top: 4px; right: 8px; font-weight: bold; }
          .diag .d { position: absolute; bottom: 4px; left: 8px; font-weight: bold; }
        </style>
      </head>
      <body>
        <div class="headers">
          <div>${escapeHtml(
            item.facultyHeader || "FACULTY OF SCIENCE AND TECHNOLOGY (FST)"
          )}</div>
          <div>${escapeHtml(fullDepartmentTitle(item.department))}</div>
          <div>${escapeHtml(item.programHeader || "PROGRAM: BICE & MICE")}</div>
          <div>${escapeHtml(item.title)}</div>
        </div>
        <table>
          <thead>
            <tr>
              <th class="diag"><span class="b">Batch</span><span class="d">Date</span></th>
              ${batchHeaders}
            </tr>
          </thead>
          <tbody>${rowsHtml}</tbody>
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

  function printClassRoutinePdf(item) {
    const win = window.open("", "_blank");
    if (!win) return;

    const days = item.days || [];
    const slots = item.slots || [];
    const entries = item.entries || [];

    const slotHeaders = slots.map((s) => `<th>${escapeHtml(s)}</th>`).join("");
    const bodyRows = days
      .map((day) => {
        const cells = slots
          .map((slot) => {
            const matches = entries.filter(
              (e) => e.day === day && e.slot === slot
            );
            if (!matches.length) return `<td style="text-align:center;">-</td>`;
            return `<td>${matches
              .map(
                (m) =>
                  `<div><strong>${escapeHtml(m.courseCode)}</strong> (${escapeHtml(
                    m.room
                  )})<br/>${escapeHtml(m.courseTitle)}<br/><small>${escapeHtml(
                    m.facultyName
                  )}</small></div>`
              )
              .join("")}</td>`;
          })
          .join("");
        return `<tr><td><strong>${escapeHtml(day)}</strong></td>${cells}</tr>`;
      })
      .join("");

    win.document.open();
    win.document.write(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>${escapeHtml(item.title)}</title>
        <style>
          @page { size: landscape; margin: 12mm; }
          body { font-family: Arial, sans-serif; padding: 16px; }
          table { width: 100%; border-collapse: collapse; font-size: 12px; }
          th, td { border: 1px solid #333; padding: 8px; }
          th { background: #e2e8f0; }
        </style>
      </head>
      <body>
        <h2>${escapeHtml(item.title)} (${escapeHtml(item.department)})</h2>
        <table><thead><tr><th>Day / Time</th>${slotHeaders}</tr></thead><tbody>${bodyRows}</tbody></table>
        <script>window.onload = function(){ setTimeout(function(){ window.print(); }, 250); };</script>
      </body>
      </html>
    `);
    win.document.close();
  }

  async function viewRoutineInline(item) {
    if (item.kind === "exam" && item.batches?.length) {
      setViewer({
        title: item.title,
        department: item.department,
        term: item.term,
        isExam: true,
        rawItem: item
      });
      return;
    }

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
    if (item.kind === "exam") {
      printExamRoutinePdf(item);
      return;
    }
    if (item.kind === "generated") {
      printClassRoutinePdf(item);
      return;
    }

    setBusy(true);
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
    <Layout title="Class & Exam Routines">
      <div className="routine-page">
        <section className="panel routine-hero">
          <div>
            <span className="routine-eyebrow">
              BUP OFFICIAL EXAM &amp; CLASS TIMETABLES
            </span>
            <h2>Exam &amp; Class Routine Generator</h2>
            <p>
              {isStaff
                ? "Auto-generate official BUP Semester Final Examination Routines (Date x Batch format), Weekly Class Routines, or upload routine files."
                : "View or download official Examination Routines and Class Timetables for your department."}
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
                    mode === "exam" ? "routine-primary" : "routine-secondary"
                  }
                  onClick={() => setMode("exam")}
                >
                  <GraduationCap size={16} /> Auto Exam Routine (BUP Official Format)
                </button>
                <button
                  type="button"
                  className={
                    mode === "auto" ? "routine-primary" : "routine-secondary"
                  }
                  onClick={() => setMode("auto")}
                >
                  <Wand2 size={16} /> Auto Class Routine (Weekly)
                </button>
                <button
                  type="button"
                  className={
                    mode === "file" ? "routine-primary" : "routine-secondary"
                  }
                  onClick={() => setMode("file")}
                >
                  <UploadCloud size={16} /> Upload Routine File
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

            {mode === "exam" ? (
              <form className="routine-form" onSubmit={saveExamRoutine}>
                <label>
                  Faculty Header
                  <input
                    value={form.facultyHeader}
                    onChange={(e) =>
                      setForm({ ...form, facultyHeader: e.target.value })
                    }
                    required
                  />
                </label>

                <label>
                  Program Header
                  <input
                    value={form.programHeader}
                    onChange={(e) =>
                      setForm({ ...form, programHeader: e.target.value })
                    }
                    required
                  />
                </label>

                <label className="routine-full">
                  Examination Routine Title
                  <input
                    value={form.title}
                    onChange={(e) =>
                      setForm({ ...form, title: e.target.value })
                    }
                    placeholder="SEMESTER FINAL EXAMINATION ROUTINE (JULY- DECEMBER 2026)"
                    required
                  />
                </label>

                <label>
                  Exam Start Date (Fridays &amp; Saturdays auto-skipped)
                  <input
                    type="date"
                    value={form.startDate}
                    onChange={(e) =>
                      setForm({ ...form, startDate: e.target.value })
                    }
                    required
                  />
                </label>

                <label>
                  Exam End Date (Fridays &amp; Saturdays auto-skipped)
                  <input
                    type="date"
                    value={form.endDate}
                    min={form.startDate}
                    onChange={(e) =>
                      setForm({ ...form, endDate: e.target.value })
                    }
                    required
                  />
                </label>

                <label className="routine-full">
                  Batches &amp; Exam Time Slots (comma-separated: Batch Name (Time))
                  <input
                    value={form.batches}
                    onChange={(e) =>
                      setForm({ ...form, batches: e.target.value })
                    }
                    required
                  />
                </label>

                <label className="routine-full">
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "8px" }}>
                    <span>Subjects / Courses per Batch (One line per Batch, separated by semicolon `;`)</span>
                    <button
                      type="button"
                      className="routine-secondary"
                      style={{ padding: "5px 10px", fontSize: "11.5px" }}
                      onClick={async () => {
                        try {
                          const res = await api.get("/courses");
                          const list = Array.isArray(res.data) ? res.data : [];
                          if (!list.length) {
                            alert("No courses found in your department database yet.");
                            return;
                          }
                          const bNames = form.batches
                            .split(",")
                            .map((b) => b.replace(/\(.*\)/, "").trim())
                            .filter(Boolean);
                          const lines = bNames.map((bName, bIdx) => {
                            const picked = [];
                            for (let k = 0; k < Math.min(3, list.length); k++) {
                              const c = list[(bIdx * 2 + k) % list.length];
                              if (c) picked.push(`${c.code} ${c.title}`);
                            }
                            return `${bName}: ${picked.join(" ; ")}`;
                          });
                          setForm({ ...form, batchSubjectsText: lines.join("\n") });
                        } catch {
                          alert("Could not load courses from database.");
                        }
                      }}
                    >
                      Load Courses from Database
                    </button>
                  </div>
                  <textarea
                    rows="6"
                    value={form.batchSubjectsText}
                    onChange={(e) =>
                      setForm({ ...form, batchSubjectsText: e.target.value })
                    }
                    placeholder="BICE 2024: ICE-3201 Microprocessor ; ICE-3207 Software Engineering"
                    required
                  />
                  <small>
                    Enter the subjects for each batch above (separated by `;`). The generator will automatically assign dates (Sun-Thu, skipping Fri/Sat) with study gaps between exams!
                  </small>
                </label>

                <div className="routine-full rt-gen-bar">
                  <button
                    type="button"
                    className="routine-secondary"
                    disabled={busy}
                    onClick={handleAutoGenerateExam}
                  >
                    <Sparkles size={16} />{" "}
                    {examGrid
                      ? "Re-Generate BUP Exam Routine"
                      : "Auto-Generate BUP Exam Routine"}
                  </button>

                  {examGrid && (
                    <button
                      type="submit"
                      className="routine-primary"
                      disabled={busy}
                    >
                      <GraduationCap size={16} />{" "}
                      {busy
                        ? "Publishing..."
                        : editingId
                        ? "Update Exam Routine"
                        : "Publish Official Exam Routine"}
                    </button>
                  )}
                </div>

                {examGrid && (
                  <div className="routine-full">
                    <BupExamRoutineSheet
                      facultyHeader={form.facultyHeader}
                      department={department}
                      programHeader={form.programHeader}
                      title={form.title}
                      batches={examGrid.batches}
                      examDates={examGrid.examDates}
                      entries={examGrid.entries}
                      editable
                      onChangeExamCell={updateExamCell}
                    />
                  </div>
                )}
              </form>
            ) : mode === "auto" ? (
              <form className="routine-form" onSubmit={saveGeneratedClassRoutine}>
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
                  />
                </label>

                <label>
                  Available Rooms / Labs (comma-separated)
                  <input
                    value={form.rooms}
                    onChange={(e) =>
                      setForm({ ...form, rooms: e.target.value })
                    }
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

                <div className="routine-full rt-gen-bar">
                  <button
                    type="button"
                    className="routine-secondary"
                    disabled={busy}
                    onClick={handleAutoGenerateClass}
                  >
                    <Sparkles size={16} /> Auto-Generate Class Timetable
                  </button>

                  {generatedGrid && (
                    <button
                      type="submit"
                      className="routine-primary"
                      disabled={busy}
                    >
                      <Wand2 size={16} /> Publish Class Routine
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
                      onChangeCell={updateClassCellField}
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
                    required
                  />
                </label>

                <label>
                  Semester / term
                  <input
                    value={form.term}
                    maxLength="80"
                    onChange={(e) => setForm({ ...form, term: e.target.value })}
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
                  <UploadCloud size={17} /> Upload and publish
                </button>
              </form>
            )}
          </section>
        )}

        <section className="panel">
          <div className="routine-heading">
            <div>
              <h3>Published Department Routines</h3>
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
                      {item.kind === "exam" ? (
                        <GraduationCap size={22} />
                      ) : item.kind === "generated" ? (
                        <Wand2 size={22} />
                      ) : (
                        <FileText size={22} />
                      )}
                    </div>
                    <span className="routine-published">
                      {item.kind === "exam"
                        ? "BUP Exam Routine"
                        : item.kind === "generated"
                        ? "Class Timetable"
                        : "Published File"}
                    </span>
                  </div>

                  <h4>{item.title}</h4>
                  <p className="routine-description">
                    {item.kind === "exam"
                      ? `${item.programHeader || "PROGRAM: BICE & MICE"}`
                      : item.description || "Official department routine"}
                  </p>

                  <div className="routine-meta">
                    <span>Department: {item.department}</span>
                    {item.term && <span>Term: {item.term}</span>}
                    <span>
                      {item.kind === "exam"
                        ? `Batches: ${(item.batches || []).map((b) => b.name).join(", ")}`
                        : item.kind === "generated"
                        ? `Scheduled Classes: ${item.entries?.length || 0} slots`
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
                      {item.kind === "exam" || item.kind === "generated" ? (
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
                  {(viewer.isExam || viewer.isGenerated) && (
                    <button
                      type="button"
                      className="routine-primary"
                      onClick={() =>
                        viewer.isExam
                          ? printExamRoutinePdf(viewer.rawItem)
                          : printClassRoutinePdf(viewer.rawItem)
                      }
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
                  viewer.isExam || viewer.isGenerated
                    ? { background: "#ffffff", alignItems: "flex-start" }
                    : undefined
                }
              >
                {viewer.isExam ? (
                  <BupExamRoutineSheet
                    facultyHeader={viewer.rawItem.facultyHeader}
                    department={viewer.rawItem.department}
                    programHeader={viewer.rawItem.programHeader}
                    title={viewer.rawItem.title}
                    batches={viewer.rawItem.batches}
                    examDates={viewer.rawItem.examDates}
                    entries={viewer.rawItem.entries}
                  />
                ) : viewer.isGenerated ? (
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