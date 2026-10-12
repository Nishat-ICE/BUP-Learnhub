import React, { useEffect, useState } from "react";
import Layout from "../components/Layout.jsx";
import api from "../api/api";
import { Award, BookOpen, CheckCircle2, Clock, Save } from "lucide-react";

const StudentView = () => {
  const [data, setData] = useState({ grades: [], progress: [] });

  useEffect(() => {
    api.get("/grades/my").then((res) => setData(res.data));
  }, []);

  const totalGraded = data.grades.filter((g) => g.grade !== null).length;
  const overall =
    totalGraded > 0
      ? Math.round(
          data.grades.filter((g) => g.grade !== null).reduce((s, g) => s + g.grade, 0) / totalGraded
        )
      : null;

  return (
    <>
      <section className="stats">
        <div className="stat blue">
          <div className="stat-icon"><BookOpen /></div>
          <div><h3>{data.progress.length}</h3><p>Enrolled Courses</p></div>
        </div>
        <div className="stat green">
          <div className="stat-icon"><CheckCircle2 /></div>
          <div><h3>{data.grades.length}</h3><p>Submitted Tasks</p></div>
        </div>
        <div className="stat orange">
          <div className="stat-icon"><Clock /></div>
          <div><h3>{data.grades.length - totalGraded}</h3><p>Awaiting Grade</p></div>
        </div>
        <div className="stat purple">
          <div className="stat-icon"><Award /></div>
          <div><h3>{overall !== null ? overall : "--"}</h3><p>Average Score</p></div>
        </div>
      </section>

      <div className="grid-two">
        <div className="panel">
          <h3>Course Progress</h3>
          {data.progress.length === 0 && (
            <p className="empty-text">You are not enrolled in any course yet.</p>
          )}
          {data.progress.map((p) => (
            <div className="progress-item" key={p.courseId}>
              <div className="progress-head">
                <span>{p.code} · {p.title}</span>
                <small>{p.submitted}/{p.totalAssignments} submitted · {p.percent}%</small>
              </div>
              <div className="bar"><div style={{ width: `${p.percent}%` }} /></div>
              <small className="faculty-line">
                Faculty: {p.faculty} {p.average !== null && `· Avg: ${p.average}`}
              </small>
            </div>
          ))}
        </div>

        <div className="panel">
          <h3>Grades & Feedback</h3>
          {data.grades.length === 0 && (
            <p className="empty-text">No submissions yet.</p>
          )}
          <div className="table-wrap">
            {data.grades.length > 0 && (
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Assignment</th>
                    <th>Course</th>
                    <th>Grade</th>
                    <th>Feedback</th>
                  </tr>
                </thead>
                <tbody>
                  {data.grades.map((g, i) => (
                    <tr key={i}>
                      <td>{g.assignment}</td>
                      <td>{g.code}</td>
                      <td>
                        {g.grade !== null ? (
                          <span className="badge graded">{g.grade}</span>
                        ) : (
                          <span className="badge pending">Pending</span>
                        )}
                      </td>
                      <td>{g.feedback || "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>
    </>
  );
};

const FacultyView = () => {
  const [subs, setSubs] = useState([]);
  const [edit, setEdit] = useState({});

  const load = () => api.get("/grades/submissions").then((res) => setSubs(res.data));

  useEffect(() => {
    load();
  }, []);

  const setField = (id, field, value) =>
    setEdit({ ...edit, [id]: { ...(edit[id] || {}), [field]: value } });

  const save = async (s) => {
    const e = edit[s.submissionId] || {};
    const grade = e.grade !== undefined ? e.grade : s.grade;
    const feedback = e.feedback !== undefined ? e.feedback : s.feedback;

    if (grade === null || grade === undefined || grade === "") {
      alert("Please enter a grade.");
      return;
    }

    await api.put(`/grades/${s.assignmentId}/${s.submissionId}`, { grade, feedback });
    alert("Grade published");
    load();
  };

  return (
    <div className="panel">
      <h3>Student Submissions</h3>
      {subs.length === 0 && <p className="empty-text">No submissions to evaluate yet.</p>}
      {subs.length > 0 && (
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Student</th>
                <th>Assignment</th>
                <th>Submission</th>
                <th>Grade</th>
                <th>Feedback</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {subs.map((s) => (
                <tr key={s.submissionId}>
                  <td>
                    <strong>{s.student?.name || "Unknown"}</strong>
                    <br />
                    <small>{s.student?.studentId || s.student?.email}</small>
                  </td>
                  <td>
                    {s.assignment}
                    <br />
                    <small>{s.code}</small>
                  </td>
                  <td className="sub-text">{s.text}</td>
                  <td>
                    <input
                      type="number"
                      min="0"
                      max="100"
                      className="grade-input"
                      defaultValue={s.grade ?? ""}
                      onChange={(e) => setField(s.submissionId, "grade", e.target.value)}
                    />
                  </td>
                  <td>
                    <input
                      className="feedback-input"
                      placeholder="Feedback"
                      defaultValue={s.feedback}
                      onChange={(e) => setField(s.submissionId, "feedback", e.target.value)}
                    />
                  </td>
                  <td>
                    <button className="save-btn" onClick={() => save(s)}>
                      <Save size={16} /> Save
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

const Grades = () => {
  const user = JSON.parse(localStorage.getItem("user") || "{}");
  const isGrader = user.role === "faculty" || user.role === "admin";

  return (
    <Layout title="Grades & Progress">
      {isGrader ? <FacultyView /> : <StudentView />}
    </Layout>
  );
};

export default Grades;