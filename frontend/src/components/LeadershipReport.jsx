import React from "react";
import api from "../api/api";

export async function downloadAcademicCsv() {
  const response = await api.get("/management/report.csv", {
    responseType: "blob"
  });

  const url = URL.createObjectURL(response.data);
  const link = document.createElement("a");

  link.href = url;
  link.download = "learnhub-academic-report.csv";
  document.body.appendChild(link);
  link.click();
  link.remove();

  setTimeout(() => URL.revokeObjectURL(url), 1500);
}

export default function LeadershipReport({ report }) {
  if (!report) return <div className="lead-panel">Loading report...</div>;

  const metrics = [
    ["Active users", report.users.active],
    ["Courses", report.courses],
    ["Enrollments", report.enrollments],
    ["Assignments", report.assignments],
    ["Submissions", report.submissions],
    ["Graded submissions", report.graded],
    ["Announcements", report.announcements],
    ["Calendar events", report.calendarEvents],
    ["Class reschedules", report.classReschedules],
    ["Published policies", report.publishedPolicies],
    ["Average grade", report.averageGrade ?? "â€”"],
    ["Learning materials", report.materials]
  ];

  return (
    <>
      <div className="lead-metrics">
        {metrics.map(([label, value]) => (
          <div className="lead-metric" key={label}>
            <span>{label}</span>
            <strong>{value}</strong>
          </div>
        ))}
      </div>

      <div className="lead-panel">
        <h3>Users by role</h3>
        <div className="lead-role-grid">
          {report.users.byRole.map((item) => (
            <div key={item.role}>
              <span>{item.role}</span>
              <strong>{item.active} active</strong>
              <small>{item.total} total</small>
            </div>
          ))}
        </div>
      </div>

      <div className="lead-panel">
        <h3>Course activity summary</h3>
        {report.courseRows.length === 0 ? (
          <p className="lead-muted">No courses have been created yet.</p>
        ) : (
          <div className="lead-table-wrap">
            <table className="lead-table">
              <thead>
                <tr>
                  <th>Course</th>
                  <th>Faculty</th>
                  <th>Students</th>
                  <th>Assignments</th>
                  <th>Submissions</th>
                  <th>Average grade</th>
                  <th>Submission rate</th>
                </tr>
              </thead>
              <tbody>
                {report.courseRows.map((course) => (
                  <tr key={course.id}>
                    <td>
                      <strong>{course.code}</strong>
                      <small>{course.title}</small>
                    </td>
                    <td>{course.faculty}</td>
                    <td>{course.students}</td>
                    <td>{course.assignments}</td>
                    <td>{course.submissions}</td>
                    <td>{course.averageGrade ?? "â€”"}</td>
                    <td>
                      {course.submissionRate === null
                        ? "â€”"
                        : `${course.submissionRate}%`}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="lead-footnote">
          Submission rate = received submissions Ã·
          (course assignments Ã— enrolled students).
          â€œâ€”â€ means there is not enough data yet.
        </p>
      </div>
    </>
  );
}