import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  Award,
  BookOpen,
  CheckCircle2,
  Clock3
} from "lucide-react";
import api from "../api/api";
import "../styles/grades-quiz.css";

const idOf = (value) => {
  if (!value) return "";
  if (typeof value === "string") return value;
  if (value._id) return idOf(value._id);
  if (value.id) return idOf(value.id);
  return String(value);
};

const count = (value) => {
  const number = Number(value);
  return Number.isFinite(number)
    ? Math.max(0, Math.floor(number))
    : 0;
};

const hasAssignmentGrade = (item) =>
  typeof item?.grade === "number" &&
  Number.isFinite(item.grade);

const hasQuizResult = (item) =>
  item?.result &&
  typeof item.result.score === "number" &&
  Number.isFinite(item.result.score) &&
  typeof item.result.maxScore === "number" &&
  item.result.maxScore > 0;

export default function StudentCombinedGrades() {
  const [records, setRecords] = useState({
    grades: [],
    progress: [],
    quizzes: [],
    theoryQuizzes: []
  });

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;

    async function load() {
      try {
        const [gradeResponse, quizResponse, theoryResponse] = await Promise.all([
          api.get("/grades/my"),
          api.get("/quizzes").catch(() => ({ data: [] })),
          api.get("/theory-quizzes").catch(() => ({ data: [] }))
        ]);

        const grades = gradeResponse.data?.grades || [];
        const progress = gradeResponse.data?.progress || [];
        const quizzes = Array.isArray(quizResponse.data) ? quizResponse.data : [];
        const theoryQuizzes = Array.isArray(theoryResponse.data)
          ? theoryResponse.data
          : [];

        if (active) {
          setRecords({ grades, progress, quizzes, theoryQuizzes });
        }
      } catch (requestError) {
        if (active) {
          setError(
            requestError.response?.data?.message ||
            "Grades could not be loaded. Check that the backend is running."
          );
        }
      } finally {
        if (active) setLoading(false);
      }
    }

    load();

    return () => {
      active = false;
    };
  }, []);

  if (loading) {
    return <div className="panel">Loading grades and progress...</div>;
  }

  if (error) {
    return (
      <div className="panel" role="alert">
        <p>{error}</p>
      </div>
    );
  }

  const { grades, progress, quizzes, theoryQuizzes } = records;

  const allQuizzes = [
    ...quizzes.map((q) => ({ ...q, kind: "MCQ" })),
    ...theoryQuizzes.map((tq) => ({ ...tq, kind: "Theory" }))
  ];

  const assignmentSubmitted = grades.length;
  const attemptedQuizzes = allQuizzes.filter((quiz) => quiz.attempted).length;

  const awaiting =
    grades.filter((grade) => !hasAssignmentGrade(grade)).length +
    allQuizzes.filter((quiz) => quiz.attempted && !hasQuizResult(quiz)).length;

  const published =
    grades.filter(hasAssignmentGrade).length +
    allQuizzes.filter(hasQuizResult).length;

  const cards = [
    {
      title: "Enrolled Courses",
      value: progress.length,
      icon: BookOpen,
      color: "blue"
    },
    {
      title: "Activities Submitted",
      value: assignmentSubmitted + attemptedQuizzes,
      icon: CheckCircle2,
      color: "green"
    },
    {
      title: "Results Pending",
      value: awaiting,
      icon: Clock3,
      color: "orange"
    },
    {
      title: "Published Results",
      value: published,
      icon: Award,
      color: "purple"
    }
  ];

  // Progress Formula: 40% Task Submission + 60% Marks Achieved
  const courseProgress = progress.map((course) => {
    const cId = idOf(course.courseId);
    const courseQuizzes = allQuizzes.filter(
      (quiz) => idOf(quiz.course) === cId
    );
    const courseAssignGrades = grades.filter(
      (g) => g.code === course.code
    );

    const assignmentTotal = count(course.totalAssignments);
    const assignmentDone = Math.min(
      assignmentTotal,
      count(course.submitted)
    );

    const quizDone = courseQuizzes.filter((quiz) => quiz.attempted).length;
    const totalTasks = assignmentTotal + courseQuizzes.length;
    const completedTasks = assignmentDone + quizDone;

    let totalWeighted = 0;
    const scorePercents = [];

    // Assignments contribution
    for (let i = 0; i < assignmentTotal; i++) {
      const g = courseAssignGrades[i];
      if (g) {
        if (hasAssignmentGrade(g)) {
          const mPct = Math.max(0, Math.min(100, Number(g.grade)));
          scorePercents.push(mPct);
          totalWeighted += 40 + mPct * 0.6;
        } else {
          // Submitted but ungraded -> 40%
          totalWeighted += 40;
        }
      }
    }

    // Quizzes contribution
    for (const q of courseQuizzes) {
      if (q.attempted) {
        if (hasQuizResult(q)) {
          const mPct = Math.max(
            0,
            Math.min(
              100,
              Math.round((q.result.score / q.result.maxScore) * 100)
            )
          );
          scorePercents.push(mPct);
          totalWeighted += 40 + mPct * 0.6;
        } else {
          totalWeighted += 40;
        }
      }
    }

    const completionPct =
      totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : null;

    const marksPct =
      scorePercents.length > 0
        ? Math.round(
            scorePercents.reduce((s, v) => s + v, 0) / scorePercents.length
          )
        : null;

    const percentage =
      totalTasks > 0 ? Math.round(totalWeighted / totalTasks) : null;

    return {
      ...course,
      assignmentTotal,
      assignmentDone,
      quizTotal: courseQuizzes.length,
      quizDone,
      completionPct,
      marksPct,
      percentage
    };
  });

  return (
    <div className="gq-page">
      <section className="stats">
        {cards.map((card) => {
          const Icon = card.icon;

          return (
            <div className={`stat ${card.color}`} key={card.title}>
              <div className="stat-icon">
                <Icon size={22} />
              </div>
              <div>
                <h3>{card.value}</h3>
                <p>{card.title}</p>
              </div>
            </div>
          );
        })}
      </section>

      <p className="gq-note">
        Academic Progress depends on both Task Submission (40% weight) and Achieved Marks in graded assignments &amp; quizzes (60% weight).
      </p>

      <section className="grid-two">
        <div className="panel">
          <div className="gq-heading">
            <h3>Course Progress (Submission + Marks)</h3>
            <Link to="/courses">View courses</Link>
          </div>

          {courseProgress.length === 0 && (
            <p className="gq-empty">
              No enrolled course yet. Enroll from the Courses page.
            </p>
          )}

          {courseProgress.map((course) => (
            <div className="gq-course" key={idOf(course.courseId)}>
              <div className="gq-course-top">
                <strong>
                  {course.code} | {course.title}
                </strong>
                <span>
                  {course.percentage === null
                    ? "-"
                    : `${course.percentage}%`}
                </span>
              </div>

              {course.percentage !== null && (
                <div className="bar">
                  <div
                    style={{ width: `${course.percentage}%` }}
                  />
                </div>
              )}

              <small>
                Assignments {course.assignmentDone}/{course.assignmentTotal} | Quizzes{" "}
                {course.quizDone}/{course.quizTotal}
                {course.marksPct !== null
                  ? ` | Marks Avg: ${course.marksPct}%`
                  : course.completionPct > 0
                  ? " | Marks: Pending (40% until graded)"
                  : ""}
              </small>
            </div>
          ))}
        </div>

        <div className="panel">
          <div className="gq-heading">
            <h3>Assignment Grades &amp; Feedback</h3>
            <Link to="/assignments">Assignments</Link>
          </div>

          {grades.length === 0 ? (
            <p className="gq-empty">
              No assignment submission yet.
            </p>
          ) : (
            <div className="table-wrap">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Assignment</th>
                    <th>Course</th>
                    <th>Marks</th>
                    <th>Feedback</th>
                  </tr>
                </thead>

                <tbody>
                  {grades.map((grade) => (
                    <tr key={idOf(grade.assignmentId)}>
                      <td>{grade.assignment}</td>
                      <td>{grade.code}</td>
                      <td>
                        {hasAssignmentGrade(grade) ? (
                          <span className="badge graded">
                            {grade.grade}/100
                          </span>
                        ) : (
                          <span className="badge pending">
                            Pending
                          </span>
                        )}
                      </td>
                      <td>{grade.feedback || "-"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </section>

      <section className="panel">
        <div className="gq-heading">
          <h3>Quiz Results &amp; Feedback</h3>
          <Link to="/quizzes">Open quizzes</Link>
        </div>

        <p className="gq-help">
          Marks appear after your Faculty publishes quiz results.
        </p>

        {allQuizzes.length === 0 ? (
          <p className="gq-empty">
            No published quiz in your enrolled courses yet.
          </p>
        ) : (
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Quiz</th>
                  <th>Type</th>
                  <th>Course</th>
                  <th>Status</th>
                  <th>Marks</th>
                  <th>Feedback</th>
                </tr>
              </thead>

              <tbody>
                {allQuizzes.map((quiz) => (
                  <tr key={`${quiz.kind}-${idOf(quiz._id)}`}>
                    <td>{quiz.title}</td>
                    <td>{quiz.kind}</td>
                    <td>{quiz.course?.code || "-"}</td>
                    <td>
                      {quiz.attempted
                        ? "Submitted"
                        : "Not attempted"}
                    </td>
                    <td>
                      {hasQuizResult(quiz) ? (
                        <span className="badge graded">
                          {quiz.result.score}/{quiz.result.maxScore}
                        </span>
                      ) : (
                        <span className="badge pending">
                          {quiz.attempted
                            ? "Not published"
                            : "-"}
                        </span>
                      )}
                    </td>
                    <td>
                      {hasQuizResult(quiz)
                        ? quiz.result.feedback || "-"
                        : "-"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}