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
  Number.isFinite(item.result.maxScore);

export default function StudentCombinedGrades() {
  const [records, setRecords] = useState({
    grades: [],
    progress: [],
    quizzes: []
  });

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;

    async function load() {
      try {
        const [gradeResponse, quizResponse] = await Promise.all([
          api.get("/grades/my"),
          api.get("/quizzes")
        ]);

        const grades = gradeResponse.data?.grades;
        const progress = gradeResponse.data?.progress;
        const quizzes = quizResponse.data;

        if (
          !Array.isArray(grades) ||
          !Array.isArray(progress) ||
          !Array.isArray(quizzes)
        ) {
          throw new Error("Unexpected academic data.");
        }

        if (active) {
          setRecords({ grades, progress, quizzes });
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

  const { grades, progress, quizzes } = records;

  const assignmentSubmitted = grades.length;
  const attemptedQuizzes = quizzes.filter(
    (quiz) => quiz.attempted
  ).length;

  const awaiting =
    grades.filter((grade) => !hasAssignmentGrade(grade)).length +
    quizzes.filter(
      (quiz) => quiz.attempted && !hasQuizResult(quiz)
    ).length;

  const published =
    grades.filter(hasAssignmentGrade).length +
    quizzes.filter(hasQuizResult).length;

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

  const courseProgress = progress.map((course) => {
    const courseQuizzes = quizzes.filter(
      (quiz) => idOf(quiz.course) === idOf(course.courseId)
    );

    const assignmentTotal = count(course.totalAssignments);
    const assignmentDone = Math.min(
      assignmentTotal,
      count(course.submitted)
    );

    const quizDone = courseQuizzes.filter(
      (quiz) => quiz.attempted
    ).length;

    const total = assignmentTotal + courseQuizzes.length;
    const completed = assignmentDone + quizDone;

    return {
      ...course,
      assignmentTotal,
      assignmentDone,
      quizTotal: courseQuizzes.length,
      quizDone,
      percentage: total
        ? Math.min(100, Math.round((completed / total) * 100))
        : null
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
        Course progress counts submitted assignments and attempted
        quizzes. It does not represent average marks.
      </p>

      <section className="grid-two">
        <div className="panel">
          <div className="gq-heading">
            <h3>Course Progress</h3>
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
                  {course.code} Â· {course.title}
                </strong>
                <span>
                  {course.percentage === null
                    ? "â€”"
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
                Assignments {course.assignmentDone}/
                {course.assignmentTotal} Â· Quizzes{" "}
                {course.quizDone}/{course.quizTotal}
              </small>
            </div>
          ))}
        </div>

        <div className="panel">
          <div className="gq-heading">
            <h3>Assignment Grades & Feedback</h3>
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
                            {grade.grade}
                          </span>
                        ) : (
                          <span className="badge pending">
                            Pending
                          </span>
                        )}
                      </td>
                      <td>{grade.feedback || "â€”"}</td>
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
          <h3>Quiz Results & Feedback</h3>
          <Link to="/quizzes">Open quizzes</Link>
        </div>

        <p className="gq-help">
          Marks appear after your Faculty publishes quiz results.
        </p>

        {quizzes.length === 0 ? (
          <p className="gq-empty">
            No published quiz in your enrolled courses yet.
          </p>
        ) : (
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Quiz</th>
                  <th>Course</th>
                  <th>Status</th>
                  <th>Marks</th>
                  <th>Feedback</th>
                </tr>
              </thead>

              <tbody>
                {quizzes.map((quiz) => (
                  <tr key={idOf(quiz._id)}>
                    <td>{quiz.title}</td>
                    <td>{quiz.course?.code || "â€”"}</td>
                    <td>
                      {quiz.attempted
                        ? "Submitted"
                        : "Not attempted"}
                    </td>
                    <td>
                      {hasQuizResult(quiz) ? (
                        <span className="badge graded">
                          {quiz.result.score}/
                          {quiz.result.maxScore}
                        </span>
                      ) : (
                        <span className="badge pending">
                          {quiz.attempted
                            ? "Not published"
                            : "â€”"}
                        </span>
                      )}
                    </td>
                    <td>
                      {hasQuizResult(quiz)
                        ? quiz.result.feedback || "â€”"
                        : "â€”"}
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