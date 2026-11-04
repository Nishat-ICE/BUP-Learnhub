import React, { useEffect, useState } from "react";
import { FileSpreadsheet, FileText, RefreshCw } from "lucide-react";
import api from "../api/api";
import "../styles/marksheet-export.css";

function csvCell(value) {
  let text = String(value ?? "");
  if (/^[=+\-@]/.test(text)) {
    text = "'" + text;
  }
  return `"${text.replace(/"/g, '""')}"`;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export default function FacultyMarksheetExport() {
  const [data, setData] = useState(null);
  const [selectedCourseId, setSelectedCourseId] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  async function loadMarksheet() {
    setLoading(true);
    setError("");
    try {
      const response = await api.get("/grades/marksheet");
      const courses = response.data?.courses || [];
      setData(response.data);
      if (courses.length > 0 && !selectedCourseId) {
        setSelectedCourseId(courses[0].courseId);
      }
    } catch (err) {
      setError(
        err.response?.data?.message || "Could not load course marksheet."
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadMarksheet();
  }, []);

  const courses = data?.courses || [];
  const currentCourse =
    courses.find((c) => c.courseId === selectedCourseId) || courses[0] || null;

  function downloadExcelCsv() {
    if (!currentCourse) return;

    const assignHeaders = currentCourse.assignments.map(
      (a) => `Assignment: ${a.title}`
    );
    const quizHeaders = currentCourse.quizzes.map(
      (q) => `Quiz (${q.kind}): ${q.title} [/${q.maxScore}]`
    );

    const rows = [
      ["BUP LearnHub - Official Course Marksheet"],
      ["Course", `${currentCourse.code} - ${currentCourse.title}`],
      ["Faculty", data?.facultyName || ""],
      ["Generated At", new Date().toLocaleString()],
      [],
      [
        "Student ID",
        "Student Name",
        "Section",
        ...assignHeaders,
        "Assignment Total",
        ...quizHeaders,
        "Quiz Total",
        "Grand Total"
      ],
      ...currentCourse.students.map((stu) => {
        const assignVals = currentCourse.assignments.map((a) => {
          const val = stu.assignmentMarks[a._id];
          return val === null || val === undefined ? "-" : val;
        });
        const quizVals = currentCourse.quizzes.map((q) => {
          const val = stu.quizMarks[q._id];
          return val === null || val === undefined ? "-" : val;
        });

        return [
          stu.studentId,
          stu.name,
          stu.section,
          ...assignVals,
          stu.assignmentTotal,
          ...quizVals,
          stu.quizTotal,
          stu.grandTotal
        ];
      })
    ];

    const csvContent =
      "\uFEFF" + rows.map((r) => r.map(csvCell).join(",")).join("\r\n");

    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${currentCourse.code || "Course"}-Marksheet.csv`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1500);
  }

  function downloadPdfSheet() {
    if (!currentCourse) return;

    const win = window.open("", "_blank");
    if (!win) {
      alert("Please allow popups in your browser to generate the PDF marksheet.");
      return;
    }

    const assignHeadersHtml = currentCourse.assignments
      .map((a) => `<th>${escapeHtml(a.title)}<br/><small>(Assign.)</small></th>`)
      .join("");

    const quizHeadersHtml = currentCourse.quizzes
      .map(
        (q) =>
          `<th>${escapeHtml(q.title)}<br/><small>(${escapeHtml(
            q.kind
          )} /${escapeHtml(q.maxScore)})</small></th>`
      )
      .join("");

    const bodyRowsHtml =
      currentCourse.students.length === 0
        ? `<tr><td colspan="20" style="text-align:center;padding:18px;">No enrolled students found.</td></tr>`
        : currentCourse.students
            .map((stu) => {
              const assignCells = currentCourse.assignments
                .map((a) => {
                  const v = stu.assignmentMarks[a._id];
                  return `<td>${v === null || v === undefined ? "-" : escapeHtml(v)}</td>`;
                })
                .join("");

              const quizCells = currentCourse.quizzes
                .map((q) => {
                  const v = stu.quizMarks[q._id];
                  return `<td>${v === null || v === undefined ? "-" : escapeHtml(v)}</td>`;
                })
                .join("");

              return `
                <tr>
                  <td><strong>${escapeHtml(stu.studentId)}</strong></td>
                  <td>${escapeHtml(stu.name)}</td>
                  <td>${escapeHtml(stu.section)}</td>
                  ${assignCells}
                  <td><strong>${escapeHtml(stu.assignmentTotal)}</strong></td>
                  ${quizCells}
                  <td><strong>${escapeHtml(stu.quizTotal)}</strong></td>
                  <td style="background:#f0fdf4;font-weight:800;color:#065f46;">${escapeHtml(
                    stu.grandTotal
                  )}</td>
                </tr>
              `;
            })
            .join("");

    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8" />
        <title>${escapeHtml(currentCourse.code)} - Marksheet</title>
        <style>
          @page { size: landscape; margin: 14mm; }
          body {
            font-family: "Segoe UI", Arial, sans-serif;
            color: #111827;
            margin: 0;
            padding: 20px;
          }
          .header {
            border-bottom: 2px solid #0b3b2e;
            padding-bottom: 12px;
            margin-bottom: 18px;
            display: flex;
            justify-content: space-between;
            align-items: flex-end;
          }
          .header h1 {
            margin: 0 0 4px;
            font-size: 22px;
            color: #0b3b2e;
          }
          .header p {
            margin: 2px 0;
            font-size: 13px;
            color: #4b5563;
          }
          table {
            width: 100%;
            border-collapse: collapse;
            font-size: 12px;
          }
          th, td {
            border: 1px solid #cbd5e1;
            padding: 8px 10px;
            text-align: left;
          }
          th {
            background: #0f2f24;
            color: #ffffff;
            font-weight: 700;
          }
          th small {
            font-weight: 400;
            opacity: 0.85;
          }
          tr:nth-child(even) {
            background: #f8fafc;
          }
        </style>
      </head>
      <body>
        <div class="header">
          <div>
            <h1>BUP LearnHub - Student Marksheet</h1>
            <p><strong>Course:</strong> ${escapeHtml(currentCourse.code)} - ${escapeHtml(
      currentCourse.title
    )}</p>
            <p><strong>Faculty:</strong> ${escapeHtml(data?.facultyName || "")}</p>
          </div>
          <div style="text-align:right;">
            <p><strong>Date:</strong> ${escapeHtml(new Date().toLocaleDateString())}</p>
            <p><strong>Total Students:</strong> ${currentCourse.students.length}</p>
          </div>
        </div>
        <table>
          <thead>
            <tr>
              <th>Student ID</th>
              <th>Student Name</th>
              <th>Section</th>
              ${assignHeadersHtml}
              <th>Assignment Total</th>
              ${quizHeadersHtml}
              <th>Quiz Total</th>
              <th>Grand Total</th>
            </tr>
          </thead>
          <tbody>
            ${bodyRowsHtml}
          </tbody>
        </table>
        <script>
          window.onload = function () {
            setTimeout(function () {
              window.print();
            }, 250);
          };
        </script>
      </body>
      </html>
    `;

    win.document.open();
    win.document.write(html);
    win.document.close();
  }

  return (
    <section className="panel ms-panel">
      <div className="ms-header">
        <div>
          <span className="ms-eyebrow">MY COURSE MARKSHEET</span>
          <h3>Student Quiz &amp; Assignment Marks Export</h3>
          <p>
            Select one of your courses to view or download enrolled students&apos;
            Name, ID, Assignment Marks, and Quiz Marks as Excel or PDF.
          </p>
        </div>

        <div className="ms-controls">
          {courses.length > 0 && (
            <select
              value={currentCourse?.courseId || ""}
              onChange={(e) => setSelectedCourseId(e.target.value)}
              aria-label="Select your course for marksheet"
            >
              {courses.map((c) => (
                <option key={c.courseId} value={c.courseId}>
                  {c.code} - {c.title}
                </option>
              ))}
            </select>
          )}

          <button
            type="button"
            className="ms-btn ms-btn-light"
            onClick={loadMarksheet}
            disabled={loading}
          >
            <RefreshCw size={15} /> Refresh
          </button>

          <button
            type="button"
            className="ms-btn ms-btn-excel"
            onClick={downloadExcelCsv}
            disabled={!currentCourse}
          >
            <FileSpreadsheet size={16} /> Download Excel (.csv)
          </button>

          <button
            type="button"
            className="ms-btn ms-btn-pdf"
            onClick={downloadPdfSheet}
            disabled={!currentCourse}
          >
            <FileText size={16} /> Download PDF
          </button>
        </div>
      </div>

      {error && <div className="ms-error">{error}</div>}

      {loading ? (
        <p className="ms-muted">Loading student marksheet...</p>
      ) : !currentCourse ? (
        <p className="ms-muted">No courses created under your faculty account yet.</p>
      ) : currentCourse.students.length === 0 ? (
        <p className="ms-muted">
          No students enrolled or submitted work in {currentCourse.code} yet.
        </p>
      ) : (
        <div className="table-wrap ms-table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Student ID</th>
                <th>Student Name</th>
                <th>Section</th>
                {currentCourse.assignments.map((a) => (
                  <th key={a._id}>{a.title} (Assign.)</th>
                ))}
                <th>Assignment Total</th>
                {currentCourse.quizzes.map((q) => (
                  <th key={q._id}>
                    {q.title} ({q.kind} /{q.maxScore})
                  </th>
                ))}
                <th>Quiz Total</th>
                <th>Grand Total</th>
              </tr>
            </thead>
            <tbody>
              {currentCourse.students.map((stu) => (
                <tr key={stu._id}>
                  <td>
                    <strong>{stu.studentId}</strong>
                  </td>
                  <td>{stu.name}</td>
                  <td>{stu.section}</td>
                  {currentCourse.assignments.map((a) => {
                    const val = stu.assignmentMarks[a._id];
                    return (
                      <td key={a._id}>
                        {val === null || val === undefined ? "-" : val}
                      </td>
                    );
                  })}
                  <td>
                    <strong>{stu.assignmentTotal}</strong>
                  </td>
                  {currentCourse.quizzes.map((q) => {
                    const val = stu.quizMarks[q._id];
                    return (
                      <td key={q._id}>
                        {val === null || val === undefined ? "-" : val}
                      </td>
                    );
                  })}
                  <td>
                    <strong>{stu.quizTotal}</strong>
                  </td>
                  <td>
                    <span className="badge graded">{stu.grandTotal}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}