import React, { useState } from "react";
import "../styles/dashboard-charts.css";

function clamp(val, min = 0, max = 100) {
  const n = Number(val);
  if (!Number.isFinite(n)) return min;
  return Math.max(min, Math.min(max, n));
}

function CompletionRing({
  percent,
  title,
  subtitle,
  primaryColor = "#0f766e",
  secondaryColor = "#e2e8f0",
  stats = []
}) {
  const p = clamp(percent, 0, 100);
  const radius = 58;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (p / 100) * circumference;

  return (
    <div className="rdc-ring-Showcase">
      <div className="rdc-ring-graphic">
        <svg className="rdc-donut-svg" viewBox="0 0 150 150">
          <circle
            cx="75"
            cy="75"
            r={radius}
            fill="none"
            stroke={secondaryColor}
            strokeWidth="14"
          />
          <circle
            cx="75"
            cy="75"
            r={radius}
            fill="none"
            stroke={primaryColor}
            strokeWidth="14"
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={offset}
            transform="rotate(-90 75 75)"
          />
          <text x="75" y="70" textAnchor="middle" className="rdc-donut-val">
            {p}%
          </text>
          <text x="75" y="90" textAnchor="middle" className="rdc-donut-sub">
            {title}
          </text>
        </svg>
        {subtitle && <p className="rdc-donut-caption">{subtitle}</p>}
      </div>

      {stats.length > 0 && (
        <div className="rdc-ring-stats">
          {stats.map((st) => (
            <div className="rdc-ring-stat-row" key={st.label}>
              <span className="rdc-stat-dot" style={{ background: st.color }} />
              <span className="rdc-stat-label">{st.label}</span>
              <strong className="rdc-stat-num">{st.value}</strong>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function StudentProgressGraph({ courses }) {
  if (!courses || courses.length === 0) {
    return (
      <p className="rdc-empty">
        Enroll in a course to see your vertical progress bar chart.
      </p>
    );
  }

  const items = courses.map((c) => ({
    id: c.id,
    label: c.code || "Course",
    fullLabel: `${c.code} - ${c.title}`,
    completion: c.completionPct ?? 0,
    marks: c.marksPct ?? 0,
    overall: c.percent ?? 0
  }));

  return (
    <VerticalBarChart
      items={items}
      maxOverride={100}
      series={[
        { key: "completion", label: "Completion (%)", color: "#0b3b4a" },
        { key: "marks", label: "Marks Avg (%)", color: "#d6a84f" },
        { key: "overall", label: "Overall Progress (%)", color: "#0f766e" }
      ]}
    />
  );
}

function FacultyCourseGraph({ courses }) {
  if (!courses || courses.length === 0) {
    return (
      <p className="rdc-empty">
        No courses assigned yet. Create or get assigned a course to see analytics.
      </p>
    );
  }

  const items = courses.map((c) => ({
    id: c.id,
    label: c.code || "Course",
    fullLabel: `${c.code} - ${c.title}`,
    students: c.students || 0,
    submissions: c.submissions || 0,
    graded: c.graded || 0
  }));

  return (
    <VerticalBarChart
      items={items}
      series={[
        { key: "students", label: "Enrolled Students", color: "#0b3b4a" },
        { key: "submissions", label: "Submitted", color: "#0f766e" },
        { key: "graded", label: "Graded", color: "#d6a84f" }
      ]}
    />
  );
}

// ============================================================
// 1. STUDENT & FACULTY DASHBOARD CHARTS (No chart for Staff)
// ============================================================
export function RoleDashboardCharts({ data }) {
  if (!data) return null;

  if (data.role === "student") {
    const courses = data.progress || [];
    const avgCompletion = courses.length
      ? Math.round(
          courses.reduce((sum, c) => sum + (Number(c.percent) || 0), 0) /
            courses.length
        )
      : 0;

    const unsubmitted = Number(data.cards?.[2]?.value) || 0;
    const publishedGrades = Number(data.cards?.[3]?.value) || 0;
    const enrolledCount = Number(data.cards?.[0]?.value) || 0;

    return (
      <section className="grid-two rdc-section">
        <div className="panel rdc-card">
          <div className="rdc-head">
            <div>
              <span className="rdc-kicker">TASK COMPLETION</span>
              <h3>Overall Academic Completion</h3>
            </div>
          </div>

          <CompletionRing
            percent={avgCompletion}
            title="Completed"
            subtitle="Overall Course Task Completion"
            primaryColor="#0f766e"
            secondaryColor="#e6f4f1"
            stats={[
              {
                label: "Enrolled Courses",
                value: enrolledCount,
                color: "#0b3b4a"
              },
              {
                label: "Pending Tasks",
                value: unsubmitted,
                color: "#d97706"
              },
              {
                label: "Graded Tasks",
                value: publishedGrades,
                color: "#0f766e"
              }
            ]}
          />
        </div>

        <div className="panel rdc-card">
          <div className="rdc-head">
            <div>
              <span className="rdc-kicker">LEARNING PROGRESS</span>
              <h3>Course-by-Course Progress Graph</h3>
            </div>
          </div>

          <StudentProgressGraph courses={courses} />
        </div>
      </section>
    );
  }

  if (data.role === "faculty") {
    const courseItems = data.courseGraph || [];
    const graded = data.gradedSubmissions || 0;
    const pending = data.pendingReviews || 0;
    const totalSubs = graded + pending;
    const reviewedPct = totalSubs ? Math.round((graded / totalSubs) * 100) : 0;

    return (
      <section className="grid-two rdc-section">
        <div className="panel rdc-card">
          <div className="rdc-head">
            <div>
              <span className="rdc-kicker">COURSE ENGAGEMENT</span>
              <h3>Students, Submissions &amp; Grading Graph</h3>
            </div>
          </div>

          <FacultyCourseGraph courses={courseItems} />
        </div>

        <div className="panel rdc-card">
          <div className="rdc-head">
            <div>
              <span className="rdc-kicker">EVALUATION STATUS</span>
              <h3>Submission Grading Progress</h3>
            </div>
          </div>

          <CompletionRing
            percent={reviewedPct}
            title="Reviewed"
            subtitle="Percentage of Student Submissions Graded"
            primaryColor="#0f766e"
            secondaryColor="#fef3c7"
            stats={[
              {
                label: "Total Submissions",
                value: totalSubs,
                color: "#0b3b4a"
              },
              {
                label: "Graded Submissions",
                value: graded,
                color: "#0f766e"
              },
              {
                label: "Pending Reviews",
                value: pending,
                color: "#d97706"
              }
            ]}
          />
        </div>
      </section>
    );
  }

  // Staff has no graph
  return null;
}

// ============================================================
// 2. ADMIN & AUTHORITY SHARED CHARTS
// ============================================================
function MultiSegmentDonut({ segments, centerTop, centerBottom }) {
  const radius = 54;
  const circumference = 2 * Math.PI * radius;
  const total = Math.max(
    1,
    segments.reduce((s, item) => s + (Number(item.value) || 0), 0)
  );

  let accumulated = 0;

  return (
    <div className="rdc-multiseg-wrap">
      <svg className="rdc-donut-svg" viewBox="0 0 140 140">
        <circle
          cx="70"
          cy="70"
          r={radius}
          fill="none"
          stroke="#e6eef0"
          strokeWidth="16"
        />
        {segments.map((seg) => {
          const val = Number(seg.value) || 0;
          const length = (val / total) * circumference;
          const dashArray = `${length} ${circumference - length}`;
          const dashOffset = -accumulated;
          accumulated += length;
          return (
            <circle
              key={seg.label}
              cx="70"
              cy="70"
              r={radius}
              fill="none"
              stroke={seg.color}
              strokeWidth="16"
              strokeDasharray={dashArray}
              strokeDashoffset={dashOffset}
              transform="rotate(-90 70 70)"
            />
          );
        })}
        <text x="70" y="66" textAnchor="middle" className="rdc-donut-val">
          {centerTop}
        </text>
        <text x="70" y="86" textAnchor="middle" className="rdc-donut-sub">
          {centerBottom}
        </text>
      </svg>

      <div className="rdc-seg-legend">
        {segments.map((seg) => (
          <div className="rdc-seg-item" key={seg.label}>
            <span className="rdc-dot" style={{ background: seg.color }} />
            <span className="rdc-seg-name">{seg.label}</span>
            <strong>{seg.value}</strong>
          </div>
        ))}
      </div>
    </div>
  );
}

function VerticalBarChart({ items, series, maxOverride = null }) {
  const allVals = items.flatMap((item) =>
    series.map((s) => Number(item[s.key]) || 0)
  );
  const maxVal = maxOverride || Math.max(5, ...allVals, 1);

  return (
    <div className="rdc-vchart">
      <div className="rdc-legend">
        {series.map((s) => (
          <span key={s.key}>
            <i style={{ background: s.color }} />
            {s.label}
          </span>
        ))}
      </div>

      {items.length === 0 ? (
        <p className="rdc-empty">No data available to plot yet.</p>
      ) : (
        <div className="rdc-vchart-Stage">
          {items.map((item, idx) => (
            <div className="rdc-vcol" key={item.id || item.key || idx}>
              <div className="rdc-vbars">
                {series.map((s) => {
                  const val = Number(item[s.key]) || 0;
                  const heightPct = Math.max(
                    val > 0 ? 6 : 2,
                    Math.min(100, Math.round((val / maxVal) * 100))
                  );
                  return (
                    <div
                      className="rdc-vbar-slot"
                      key={s.key}
                      title={`${s.label}: ${val}`}
                    >
                      <span className="rdc-vbar-num">{val}</span>
                      <div
                        className="rdc-vbar-fill"
                        style={{
                          height: `${heightPct}%`,
                          background: s.color
                        }}
                      />
                    </div>
                  );
                })}
              </div>
              <span className="rdc-vlabel" title={item.fullLabel || item.label}>
                {item.label}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function SmoothActivityGraph({ items }) {
  const width = 640;
  const height = 235;
  const padLeft = 44;
  const padRight = 28;
  const padTop = 34;
  const padBottom = 44;

  const plotW = width - padLeft - padRight;
  const plotH = height - padTop - padBottom;
  const baseY = padTop + plotH;

  const rawMax = Math.max(1, ...items.map((d) => Number(d.count) || 0));
  const maxVal = Math.max(4, Math.ceil(rawMax * 1.15));

  const points = items.map((item, idx) => {
    const val = Number(item.count) || 0;
    const x =
      items.length === 1
        ? padLeft + plotW / 2
        : padLeft + (idx / (items.length - 1)) * plotW;
    const y = baseY - (val / maxVal) * plotH;
    return { ...item, val, x, y };
  });

  // Build smooth cubic bezier curve
  let linePath = "";
  points.forEach((pt, i) => {
    if (i === 0) {
      linePath = `M ${pt.x.toFixed(1)} ${pt.y.toFixed(1)}`;
    } else {
      const prev = points[i - 1];
      const midX = ((prev.x + pt.x) / 2).toFixed(1);
      linePath += ` C ${midX} ${prev.y.toFixed(1)}, ${midX} ${pt.y.toFixed(
        1
      )}, ${pt.x.toFixed(1)} ${pt.y.toFixed(1)}`;
    }
  });

  const areaPath =
    points.length > 0
      ? `${linePath} L ${points[points.length - 1].x.toFixed(
          1
        )} ${baseY} L ${points[0].x.toFixed(1)} ${baseY} Z`
      : "";

  const yTicks = [0, 0.25, 0.5, 0.75, 1].map((t) => ({
    val: Math.round(maxVal * t),
    y: baseY - t * plotH
  }));

  const totalActivity = points.reduce((sum, p) => sum + p.val, 0);
  const peakItem = points.reduce(
    (best, p) => (p.val > best.val ? p : best),
    points[0] || { label: "-", val: 0 }
  );

  return (
    <div className="rdc-area-wrap">
      <div className="rdc-area-pills">
        <div className="rdc-area-pill">
          <span>Total Records</span>
          <strong>{totalActivity}</strong>
        </div>
        <div className="rdc-area-pill">
          <span>Highest Module</span>
          <strong>
            {peakItem.label} ({peakItem.val})
          </strong>
        </div>
        <div className="rdc-area-pill">
          <span>Tracked Modules</span>
          <strong>{points.length}</strong>
        </div>
      </div>

      <svg
        className="rdc-area-svg"
        viewBox={`0 0 ${width} ${height}`}
        preserveAspectRatio="none"
      >
        <defs>
          <linearGradient id="adminAreaGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#0f766e" stopOpacity="0.34" />
            <stop offset="65%" stopColor="#14b8a6" stopOpacity="0.10" />
            <stop offset="100%" stopColor="#0f766e" stopOpacity="0.0" />
          </linearGradient>
          <linearGradient id="adminLineGrad" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="#0b3b4a" />
            <stop offset="55%" stopColor="#0f766e" />
            <stop offset="100%" stopColor="#d6a84f" />
          </linearGradient>
        </defs>

        {/* Horizontal dashed grid lines & Y-axis labels */}
        {yTicks.map((t, idx) => (
          <g key={idx}>
            <line
              x1={padLeft}
              y1={t.y}
              x2={width - padRight}
              y2={t.y}
              stroke={idx === 0 ? "#cbd5e1" : "#e2e8f0"}
              strokeDasharray={idx === 0 ? "none" : "4 4"}
              strokeWidth="1"
            />
            <text
              x={padLeft - 10}
              y={t.y + 4}
              textAnchor="end"
              className="rdc-axis-num"
            >
              {t.val}
            </text>
          </g>
        ))}

        {/* Shaded gradient area under curve */}
        {areaPath && <path d={areaPath} fill="url(#adminAreaGrad)" />}

        {/* Smooth spline line */}
        {linePath && (
          <path
            d={linePath}
            fill="none"
            stroke="url(#adminLineGrad)"
            strokeWidth="3.5"
            strokeLinecap="round"
          />
        )}

        {/* Vertical guide lines, glowing nodes, value badges & X-axis labels */}
        {points.map((pt) => (
          <g key={pt.id}>
            <line
              x1={pt.x}
              y1={pt.y}
              x2={pt.x}
              y2={baseY}
              stroke="#0f766e"
              strokeOpacity="0.18"
              strokeDasharray="3 3"
              strokeWidth="1.2"
            />

            {/* Outer glow */}
            <circle
              cx={pt.x}
              cy={pt.y}
              r="7.5"
              fill="#0f766e"
              fillOpacity="0.18"
            />

            {/* Main point */}
            <circle
              cx={pt.x}
              cy={pt.y}
              r="4.5"
              fill="#ffffff"
              stroke="#0f766e"
              strokeWidth="2.8"
            />

            {/* Floating value pill */}
            <rect
              x={pt.x - 15}
              y={pt.y - 26}
              width="30"
              height="18"
              rx="6"
              fill="#0b3b4a"
            />
            <text
              x={pt.x}
              y={pt.y - 13.5}
              textAnchor="middle"
              className="rdc-node-val"
            >
              {pt.val}
            </text>

            {/* X-axis label */}
            <text
              x={pt.x}
              y={baseY + 22}
              textAnchor="middle"
              className="rdc-axis-label"
            >
              {pt.label}
            </text>
          </g>
        ))}
      </svg>
    </div>
  );
}

export function AdminDashboardCharts({ report }) {
  if (!report) return null;

  const roleColors = {
    student: "#0f766e",
    faculty: "#0b3b4a",
    staff: "#d6a84f",
    admin: "#6d28d9",
    authority: "#ea580c"
  };

  const segments = (report.users?.byRole || []).map((r) => ({
    label: r.role.charAt(0).toUpperCase() + r.role.slice(1),
    value: r.total || 0,
    color: roleColors[r.role] || "#64748b"
  }));

  const platformBars = [
    { id: "courses", label: "Courses", count: report.courses || 0 },
    { id: "enrollments", label: "Enrollments", count: report.enrollments || 0 },
    { id: "materials", label: "Materials", count: report.materials || 0 },
    { id: "assignments", label: "Assignments", count: report.assignments || 0 },
    { id: "assign_subs", label: "Assign. Submitted", count: report.submissions || 0 },
    { id: "quizzes", label: "Quizzes", count: report.quizzes || 0 },
    { id: "quiz_subs", label: "Quiz Submitted", count: report.quizAttempts || 0 }
  ];

  return (
    <div className="rdc-admin-grid">
      <div className="lead-panel rdc-card">
        <div className="rdc-head">
          <div>
            <span className="rdc-kicker">USER DISTRIBUTION</span>
            <h3>System Users by Role</h3>
          </div>
        </div>
        <MultiSegmentDonut
          segments={segments}
          centerTop={report.users?.total || 0}
          centerBottom="Total Users"
        />
      </div>

      <div className="lead-panel rdc-card">
        <div className="rdc-head">
          <div>
            <span className="rdc-kicker">PLATFORM ANALYTICS CURVE</span>
            <h3>System Modules &amp; Activity Graph</h3>
          </div>
        </div>
        <SmoothActivityGraph items={platformBars} />
      </div>
    </div>
  );
}

function csvCell(value) {
  let text = String(value ?? "");
  if (/^[=+\-@]/.test(text)) text = "'" + text;
  return `"${text.replace(/"/g, '""')}"`;
}

export function downloadAllDepartmentsCsv(report) {
  if (!report) return;
  const depts = report.departmentRows || [];

  const rows = [
    ["BUP LearnHub - University Authority All-Department Summary Report"],
    ["Generated At", report.generatedAt || new Date().toISOString()],
    [],
    [
      "Department",
      "Total Users",
      "Students",
      "Faculty",
      "Staff",
      "Courses",
      "Enrollments",
      "Materials",
      "Assignments",
      "Assignment Submissions",
      "Assignment Submission Rate (%)",
      "Average Assignment Grade",
      "Quizzes",
      "Quiz Attempts",
      "Quiz Participation Rate (%)",
      "Routines"
    ],
    ...depts.map((d) => [
      d.department,
      d.users?.total || 0,
      d.students || 0,
      d.faculty || 0,
      d.staff || 0,
      d.courses || 0,
      d.enrollments || 0,
      d.materials || 0,
      d.assignments || 0,
      d.submissions || 0,
      d.submissionRate ?? 0,
      d.averageGrade ?? "-",
      d.quizzes || 0,
      d.quizAttempts || 0,
      d.quizParticipationPercent ?? 0,
      d.routines || 0
    ]),
    [],
    [
      "Course Breakdown",
      "Department",
      "Course Code",
      "Course Title",
      "Faculty",
      "Enrolled Students",
      "Assignments",
      "Submissions",
      "Average Grade",
      "Submission Rate (%)",
      "Quizzes",
      "Quiz Attempts"
    ],
    ...(report.courseRows || []).map((c) => [
      "",
      c.department || "-",
      c.code,
      c.title,
      c.faculty,
      c.students,
      c.assignments,
      c.submissions,
      c.averageGrade ?? "-",
      c.submissionRate ?? "-",
      c.quizzes ?? 0,
      c.quizAttempts ?? 0
    ])
  ];

  const csv = "\uFEFF" + rows.map((r) => r.map(csvCell).join(",")).join("\r\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "BUP-LearnHub-All-Departments-Summary.csv";
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}

export function AuthorityDepartmentAnalytics({ report }) {
  const [selectedDept, setSelectedDept] = useState("all");

  if (!report) {
    return <div className="lead-panel">Loading department analytics...</div>;
  }

  const depts = report.departmentRows || [];
  const activeDept = depts.find((d) => d.key === selectedDept) || null;

  const summary = activeDept
    ? {
        students: activeDept.students,
        faculty: activeDept.faculty,
        staff: activeDept.staff,
        courses: activeDept.courses,
        enrollments: activeDept.enrollments,
        assignments: activeDept.assignments,
        submissions: activeDept.submissions,
        quizzes: activeDept.quizzes,
        quizAttempts: activeDept.quizAttempts,
        averageGrade: activeDept.averageGrade,
        materials: activeDept.materials,
        routines: activeDept.routines
      }
    : {
        students:
          report.users?.byRole?.find((r) => r.role === "student")?.total || 0,
        faculty:
          report.users?.byRole?.find((r) => r.role === "faculty")?.total || 0,
        staff:
          report.users?.byRole?.find((r) => r.role === "staff")?.total || 0,
        courses: report.courses || 0,
        enrollments: report.enrollments || 0,
        assignments: report.assignments || 0,
        submissions: report.submissions || 0,
        quizzes: report.quizzes || 0,
        quizAttempts: report.quizAttempts || 0,
        averageGrade: report.averageGrade,
        materials: report.materials || 0,
        routines: depts.reduce((s, d) => s + (d.routines || 0), 0)
      };

  const deptGraphItems = depts.map((d) => ({
    id: d.key,
    label: d.department,
    fullLabel: d.department,
    students: d.students || 0,
    courses: d.courses || 0,
    submissions: d.submissions || 0,
    quizAttempts: d.quizAttempts || 0
  }));

  const selectedCourseItems = (
    activeDept ? activeDept.courseRows : report.courseRows || []
  ).map((c) => ({
    id: c.id,
    label: c.code,
    fullLabel: `${c.code} - ${c.title}`,
    students: c.students || 0,
    submissions: c.submissions || 0,
    quizAttempts: c.quizAttempts || 0
  }));

  return (
    <>
      <div className="lead-panel rdc-filter-bar">
        <div>
          <span className="rdc-kicker">DEPARTMENT FILTER &amp; EXPORT</span>
          <h3>
            {activeDept
              ? `${activeDept.department} Department Summary`
              : "All Departments Summary Overview"}
          </h3>
        </div>

        <div className="rdc-filter-actions">
          <select
            value={selectedDept}
            onChange={(e) => setSelectedDept(e.target.value)}
            aria-label="Select Department"
          >
            <option value="all">All Departments (University-wide)</option>
            {depts.map((d) => (
              <option key={d.key} value={d.key}>
                {d.department}
              </option>
            ))}
          </select>

          <button
            type="button"
            className="lead-primary"
            onClick={() => downloadAllDepartmentsCsv(report)}
          >
            Download All-Department CSV
          </button>
        </div>
      </div>

      <div className="lead-metrics">
        {[
          ["Students", summary.students],
          ["Faculty", summary.faculty],
          ["Staff", summary.staff],
          ["Courses", summary.courses],
          ["Enrollments", summary.enrollments],
          ["Assignments", summary.assignments],
          ["Submissions", summary.submissions],
          ["Quizzes", summary.quizzes],
          ["Quiz Attempts", summary.quizAttempts],
          ["Learning Materials", summary.materials],
          ["Routines", summary.routines],
          ["Average Grade", summary.averageGrade ?? "-"]
        ].map(([label, value]) => (
          <div className="lead-metric" key={label}>
            <span>{label}</span>
            <strong>{value}</strong>
          </div>
        ))}
      </div>

      <div className="rdc-admin-grid">
        <div className="lead-panel rdc-card">
          <div className="rdc-head">
            <div>
              <span className="rdc-kicker">
                {activeDept ? "COURSE COMPARISON GRAPH" : "DEPARTMENT SUMMARY GRAPH"}
              </span>
              <h3>
                {activeDept
                  ? `${activeDept.department} - Course-wise Activity Graph`
                  : "Department-wise Summary Comparison Graph"}
              </h3>
            </div>
          </div>

          {activeDept ? (
            <VerticalBarChart
              items={selectedCourseItems}
              series={[
                { key: "students", label: "Enrolled", color: "#0b3b4a" },
                { key: "submissions", label: "Submissions", color: "#0f766e" },
                { key: "quizAttempts", label: "Quiz Attempts", color: "#d6a84f" }
              ]}
            />
          ) : (
            <VerticalBarChart
              items={deptGraphItems}
              series={[
                { key: "students", label: "Students", color: "#0b3b4a" },
                { key: "courses", label: "Courses", color: "#0f766e" },
                { key: "submissions", label: "Submissions", color: "#d6a84f" },
                { key: "quizAttempts", label: "Quiz Attempts", color: "#6d28d9" }
              ]}
            />
          )}
        </div>

        <div className="lead-panel rdc-card">
          <div className="rdc-head">
            <div>
              <span className="rdc-kicker">DEPARTMENT PERFORMANCE RATES</span>
              <h3>Submission, Quiz &amp; Grade Rates by Department</h3>
            </div>
          </div>

          <div className="rdc-rate-list">
            {(activeDept ? [activeDept] : depts).map((d) => (
              <div className="rdc-rate-item" key={d.key}>
                <div className="rdc-rate-title">
                  <strong>{d.department}</strong>
                  <span>
                    {d.courses} Courses | {d.students} Students
                  </span>
                </div>

                <div className="rdc-rate-row">
                  <small>Assignment Submission Rate</small>
                  <div className="rdc-rate-track">
                    <div
                      style={{
                        width: `${clamp(d.submissionRate)}%`,
                        background: "#0f766e"
                      }}
                    />
                  </div>
                  <b>{d.submissionRate ?? 0}%</b>
                </div>

                <div className="rdc-rate-row">
                  <small>Quiz Participation Rate</small>
                  <div className="rdc-rate-track">
                    <div
                      style={{
                        width: `${clamp(d.quizParticipationPercent)}%`,
                        background: "#d6a84f"
                      }}
                    />
                  </div>
                  <b>{d.quizParticipationPercent ?? 0}%</b>
                </div>

                <div className="rdc-rate-row">
                  <small>Average Assignment Score</small>
                  <div className="rdc-rate-track">
                    <div
                      style={{
                        width: `${clamp(d.averageGrade || 0)}%`,
                        background: "#0b3b4a"
                      }}
                    />
                  </div>
                  <b>{d.averageGrade !== null ? `${d.averageGrade}%` : "-"}</b>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="lead-panel">
        <h3>
          {activeDept
            ? `${activeDept.department} - Course Activity Table`
            : "All Departments - Course Activity Summary"}
        </h3>
        {(activeDept ? activeDept.courseRows : report.courseRows || []).length ===
        0 ? (
          <p className="lead-muted">No courses available for this selection.</p>
        ) : (
          <div className="lead-table-wrap">
            <table className="lead-table">
              <thead>
                <tr>
                  <th>Department</th>
                  <th>Course</th>
                  <th>Faculty</th>
                  <th>Students</th>
                  <th>Assignments</th>
                  <th>Submissions</th>
                  <th>Quizzes</th>
                  <th>Quiz Attempts</th>
                  <th>Average Grade</th>
                </tr>
              </thead>
              <tbody>
                {(activeDept ? activeDept.courseRows : report.courseRows || []).map(
                  (c) => (
                    <tr key={c.id}>
                      <td>{c.department || "-"}</td>
                      <td>
                        <strong>{c.code}</strong>
                        <small>{c.title}</small>
                      </td>
                      <td>{c.faculty}</td>
                      <td>{c.students}</td>
                      <td>{c.assignments}</td>
                      <td>{c.submissions}</td>
                      <td>{c.quizzes ?? 0}</td>
                      <td>{c.quizAttempts ?? 0}</td>
                      <td>{c.averageGrade ?? "-"}</td>
                    </tr>
                  )
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}