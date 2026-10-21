import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  Award,
  Bell,
  BookOpen,
  ClipboardCheck,
  FileText,
  Users
} from "lucide-react";
import Layout from "../components/Layout.jsx";
import api from "../api/api";
import "../styles/dashboard-live.css";

const getId = (value) => {
  if (!value) return "";
  if (typeof value === "string") return value;
  if (typeof value === "object") {
    return getId(value._id || value.id);
  }
  return String(value);
};

const isGraded = (submission) =>
  typeof submission?.grade === "number" &&
  Number.isFinite(submission.grade);

const getSubmissionCount = (assignment) =>
  typeof assignment.submissionCount === "number"
    ? assignment.submissionCount
    : Array.isArray(assignment.submissions)
    ? assignment.submissions.length
    : 0;

const formatDate = (value) => {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";

  return date.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric"
  });
};

const roleTitle = {
  student: "Your academic overview",
  faculty: "Your teaching overview",
  staff: "Academic operations overview",
  admin: "Platform overview",
  authority: "University academic overview"
};

function makeDashboard(user, allCourses, allAssignments, allAnnouncements) {
  const role = user.role;
  const userId = getId(user._id || user.id);

  const courses =
    role === "student"
      ? allCourses.filter((course) =>
          (course.students || []).some(
            (student) => getId(student) === userId
          )
        )
      : role === "faculty"
      ? allCourses.filter(
          (course) => getId(course.faculty) === userId
        )
      : allCourses;

  const courseIds = new Set(courses.map((course) => getId(course._id)));
  const courseById = new Map(
    courses.map((course) => [getId(course._id), course])
  );

  const assignments = allAssignments.filter((assignment) =>
    courseIds.has(getId(assignment.course))
  );

  const announcements = allAnnouncements
    .filter(
      (announcement) =>
        role !== "student" && role !== "faculty"
          ? true
          : !announcement.course ||
            courseIds.has(getId(announcement.course))
    )
    .sort(
      (a, b) =>
        (new Date(b.createdAt).getTime() || 0) -
        (new Date(a.createdAt).getTime() || 0)
    );

  // Only the logged-in student's submission contributes to their grades.
  const mySubmission = (assignment) =>
    [...(assignment.submissions || [])]
      .reverse()
      .find((item) => getId(item.student) === userId);

  const grades =
    role === "student"
      ? assignments
          .map((assignment) => ({
            assignment,
            submission: mySubmission(assignment)
          }))
          .filter((item) => isGraded(item.submission))
          .map(({ assignment, submission }) => ({
            id: getId(assignment._id),
            title: assignment.title,
            courseCode:
              courseById.get(getId(assignment.course))?.code || "Course",
            grade: submission.grade,
            feedback: submission.feedback || "",
            submittedAt: submission.submittedAt
          }))
          .sort(
            (a, b) =>
              (new Date(b.submittedAt).getTime() || 0) -
              (new Date(a.submittedAt).getTime() || 0)
          )
      : [];

  const materials = courses.reduce(
    (count, course) =>
      count +
      (Array.isArray(course.materials) ? course.materials.length : 0),
    0
  );

  const unsubmitted =
    role === "student"
      ? assignments.filter((assignment) => !mySubmission(assignment)).length
      : 0;

  const enrolledStudents = new Set(
    courses.flatMap((course) =>
      (course.students || []).map(getId).filter(Boolean)
    )
  ).size;

  const allSubmissions = assignments.flatMap((assignment) =>
    Array.isArray(assignment.submissions)
      ? assignment.submissions
      : []
  );

  const pendingReviews = allSubmissions.filter(
    (submission) => !isGraded(submission)
  ).length;

  const gradedSubmissions = allSubmissions.filter(isGraded).length;

  const progress = courses.slice(0, 6).map((course) => {
    const related = assignments.filter(
      (assignment) =>
        getId(assignment.course) === getId(course._id)
    );

    if (role === "student") {
      const submitted = related.filter((assignment) =>
        Boolean(mySubmission(assignment))
      ).length;

      return {
        id: getId(course._id),
        title: course.title,
        code: course.code,
        percent:
          related.length > 0
            ? Math.round((submitted / related.length) * 100)
            : null,
        detail:
          related.length > 0
            ? `${submitted} of ${related.length} assignments submitted`
            : "No assignments in this course yet"
      };
    }

    const expected =
      related.length * (course.students?.length || 0);
    const submitted = related.reduce(
      (count, assignment) =>
        count + getSubmissionCount(assignment),
      0
    );

    return {
      id: getId(course._id),
      title: course.title,
      code: course.code,
      percent:
        expected > 0
          ? Math.min(100, Math.round((submitted / expected) * 100))
          : null,
      detail:
        related.length === 0
          ? "No assignments in this course yet"
          : expected === 0
          ? "No enrolled students yet"
          : `${submitted} of ${expected} expected submissions`
    };
  });

  const upcoming = assignments
    .filter((assignment) => {
      if (!assignment.deadline) return false;

      const due = new Date(assignment.deadline);
      if (Number.isNaN(due.getTime())) return false;

      // A date-only deadline stays visible throughout its due date.
      const endOfDay = new Date(
        due.getFullYear(),
        due.getMonth(),
        due.getDate() + 1
      );

      return (
        endOfDay.getTime() > Date.now() &&
        (role !== "student" || !mySubmission(assignment))
      );
    })
    .sort(
      (a, b) =>
        new Date(a.deadline).getTime() -
        new Date(b.deadline).getTime()
    )
    .slice(0, 4)
    .map((assignment) => ({
      id: getId(assignment._id),
      title: assignment.title,
      courseCode:
        courseById.get(getId(assignment.course))?.code || "Course",
      deadline: assignment.deadline
    }));

  let cards;

  if (role === "student") {
    cards = [
      { label: "Enrolled Courses", value: courses.length, icon: BookOpen, color: "blue" },
      { label: "Learning Materials", value: materials, icon: FileText, color: "green" },
      { label: "Unsubmitted Tasks", value: unsubmitted, icon: ClipboardCheck, color: "orange" },
      { label: "Published Grades", value: grades.length, icon: Award, color: "purple" }
    ];
  } else if (role === "faculty") {
    cards = [
      { label: "My Courses", value: courses.length, icon: BookOpen, color: "blue" },
      { label: "Enrolled Students", value: enrolledStudents, icon: Users, color: "green" },
      { label: "Assignments", value: assignments.length, icon: ClipboardCheck, color: "orange" },
      { label: "Pending Reviews", value: pendingReviews, icon: Award, color: "purple" }
    ];
  } else {
    cards = [
      { label: "Courses", value: courses.length, icon: BookOpen, color: "blue" },
      { label: "Enrolled Students", value: enrolledStudents, icon: Users, color: "green" },
      { label: "Assignments", value: assignments.length, icon: ClipboardCheck, color: "orange" },
      { label: "Announcements", value: announcements.length, icon: Bell, color: "purple" }
    ];
  }

  return {
    role,
    cards,
    announcements: announcements.slice(0, 4),
    progress,
    upcoming,
    grades: grades.slice(0, 4),
    gradedSubmissions,
    pendingReviews,
    assignmentCount: assignments.length,
    courseCount: courses.length
  };
}

export default function Dashboard() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [reload, setReload] = useState(0);

  useEffect(() => {
    let active = true;

    const load = async () => {
      setLoading(true);
      setError("");

      try {
        const [userResult, coursesResult, tasksResult, noticesResult] =
          await Promise.all([
            api.get("/auth/me"),
            api.get("/courses"),
            api.get("/assignments"),
            api.get("/announcements")
          ]);

        if (
          !Array.isArray(coursesResult.data) ||
          !Array.isArray(tasksResult.data) ||
          !Array.isArray(noticesResult.data)
        ) {
          throw new Error("Unexpected API response");
        }

        if (active) {
          setData(
            makeDashboard(
              userResult.data,
              coursesResult.data,
              tasksResult.data,
              noticesResult.data
            )
          );
        }
      } catch (err) {
        if (active) {
          setData(null);
          setError(
            err.response?.status === 401
              ? "Session expired. Log out and sign in again."
              : "Could not load academic data. Check that the backend and MongoDB are running."
          );
        }
      } finally {
        if (active) setLoading(false);
      }
    };

    load();
    return () => {
      active = false;
    };
  }, [reload]);

  if (loading) {
    return (
      <Layout title="Dashboard">
        <div className="panel live-state">Loading academic data...</div>
      </Layout>
    );
  }

  if (error || !data) {
    return (
      <Layout title="Dashboard">
        <div className="panel live-state" role="alert">
          <p>{error || "Dashboard is unavailable."}</p>
          <button
            type="button"
            className="live-refresh"
            onClick={() => setReload((value) => value + 1)}
          >
            Try again
          </button>
        </div>
      </Layout>
    );
  }

  const isStudent = data.role === "student";

  return (
    <Layout title="Dashboard">
      <section className="hero">
        <span>BUP LearnHub</span>
        <h1>{roleTitle[data.role] || "Academic overview"}</h1>
        <p>
          Courses, academic updates, assessments and learning activity
          in one place.
        </p>
      </section>

      <div className="live-toolbar">
        <span>Current information from your academic records</span>
        <button
          type="button"
          className="live-refresh"
          onClick={() => setReload((value) => value + 1)}
        >
          Refresh data
        </button>
      </div>

      <section className="stats">
        {data.cards.map((card) => {
          const Icon = card.icon;

          return (
            <div className={`stat ${card.color}`} key={card.label}>
              <div className="stat-icon"><Icon size={22} /></div>
              <div>
                <h3>{card.value}</h3>
                <p>{card.label}</p>
              </div>
            </div>
          );
        })}
      </section>

      <section className="grid-two">
        <div className="panel">
          <div className="live-panel-head">
            <h3>Recent Announcements</h3>
            <Link to="/announcements">View all</Link>
          </div>

          {data.announcements.length === 0 && (
            <p className="live-empty">No announcements available yet.</p>
          )}

          {data.announcements.map((item) => (
            <div className="notice" key={item._id}>
              <strong>{item.title}</strong>
              <p>{item.message}</p>
              <small className="live-meta">
                {item.course?.code || "General"}
                {item.createdAt ? ` Â· ${formatDate(item.createdAt)}` : ""}
              </small>
            </div>
          ))}
        </div>

        <div className="panel">
          <div className="live-panel-head">
            <h3>{isStudent ? "Academic Progress" : "Course Activity"}</h3>
            <Link to="/courses">View courses</Link>
          </div>

          {data.progress.length === 0 && (
            <p className="live-empty">
              {isStudent
                ? "You are not enrolled in any course yet. Enroll from the Courses page."
                : "No courses are available for your account yet."}
            </p>
          )}

          {data.progress.map((course) => (
            <div className="progress-item live-progress" key={course.id}>
              <div className="live-progress-heading">
                <strong>{course.code} Â· {course.title}</strong>
                <span>
                  {course.percent === null ? "N/A" : `${course.percent}%`}
                </span>
              </div>

              {course.percent !== null && (
                <div className="bar">
                  <div style={{ width: `${course.percent}%` }} />
                </div>
              )}

              <small className="live-meta">{course.detail}</small>
            </div>
          ))}
        </div>
      </section>

      <section className="grid-two">
        <div className="panel">
          <div className="live-panel-head">
            <h3>Upcoming Deadlines</h3>
            <Link to="/assignments">View assignments</Link>
          </div>

          {data.upcoming.length === 0 && (
            <p className="live-empty">
              No upcoming deadlines for your courses.
            </p>
          )}

          {data.upcoming.map((item) => (
            <div className="notice" key={item.id}>
              <strong>{item.title}</strong>
              <p>
                {item.courseCode} Â· Due {formatDate(item.deadline)}
              </p>
            </div>
          ))}
        </div>

        <div className="panel">
          {isStudent ? (
            <>
              <div className="live-panel-head">
                <h3>Grades & Feedback</h3>
                <Link to="/grades">View all</Link>
              </div>

              {data.grades.length === 0 && (
                <p className="live-empty">
                  Faculty-published grades will appear here after your
                  assignment is evaluated.
                </p>
              )}

              {data.grades.map((item) => (
                <div className="live-grade-row" key={item.id}>
                  <div>
                    <strong>{item.title}</strong>
                    <small className="live-meta">
                      {item.courseCode}
                      {item.feedback ? ` Â· ${item.feedback}` : ""}
                    </small>
                  </div>
                  <span className="live-grade-value">{item.grade}</span>
                </div>
              ))}
            </>
          ) : (
            <>
              <h3>Assessment Overview</h3>
              <div className="live-assessment-row">
                <span>Courses in view</span>
                <strong>{data.courseCount}</strong>
              </div>
              <div className="live-assessment-row">
                <span>Assignments in view</span>
                <strong>{data.assignmentCount}</strong>
              </div>

              {data.role === "faculty" || data.role === "admin" ? (
                <>
                  <div className="live-assessment-row">
                    <span>Graded submissions</span>
                    <strong>{data.gradedSubmissions}</strong>
                  </div>
                  <div className="live-assessment-row">
                    <span>Pending reviews</span>
                    <strong>{data.pendingReviews}</strong>
                  </div>
                </>
              ) : (
                <p className="live-empty">
                  Course and assessment totals are shown without individual
                  student grades.
                </p>
              )}
            </>
          )}
        </div>
      </section>
    </Layout>
  );
}