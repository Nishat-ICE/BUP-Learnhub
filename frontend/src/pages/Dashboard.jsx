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
import { RoleDashboardCharts } from "../components/RoleDashboardCharts.jsx";
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

function makeDashboard(
  user,
  allCourses,
  allAssignments,
  allAnnouncements,
  allQuizzes = [],
  allTheoryQuizzes = [],
  allAcademicUpdates = []
) {
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

  const quizzes = (Array.isArray(allQuizzes) ? allQuizzes : []).filter((q) =>
    courseIds.has(getId(q.course))
  );

  const theoryQuizzes = (
    Array.isArray(allTheoryQuizzes) ? allTheoryQuizzes : []
  ).filter((tq) => courseIds.has(getId(tq.course)));

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

  const mySubmission = (assignment) =>
    [...(assignment.submissions || [])]
      .reverse()
      .find((item) => getId(item.student) === userId);

  const assignmentGrades =
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
            grade: `${submission.grade}/100`,
            percent: Math.max(0, Math.min(100, Number(submission.grade))),
            feedback: submission.feedback || "",
            submittedAt: submission.submittedAt
          }))
      : [];

  const quizGrades =
    role === "student"
      ? [
          ...quizzes
            .filter(
              (q) =>
                q.result &&
                typeof q.result.score === "number" &&
                q.result.maxScore > 0
            )
            .map((q) => ({
              id: `mcq-${getId(q._id)}`,
              title: `${q.title} (MCQ)`,
              courseCode:
                q.course?.code ||
                courseById.get(getId(q.course))?.code ||
                "Course",
              grade: `${q.result.score}/${q.result.maxScore}`,
              percent: Math.round((q.result.score / q.result.maxScore) * 100),
              feedback: q.result.feedback || "",
              submittedAt: q.closesAt
            })),
          ...theoryQuizzes
            .filter(
              (tq) =>
                tq.result &&
                typeof tq.result.score === "number" &&
                tq.result.maxScore > 0
            )
            .map((tq) => ({
              id: `theory-${getId(tq._id)}`,
              title: `${tq.title} (Theory)`,
              courseCode:
                tq.course?.code ||
                courseById.get(getId(tq.course))?.code ||
                "Course",
              grade: `${tq.result.score}/${tq.result.maxScore}`,
              percent: Math.round(
                (tq.result.score / tq.result.maxScore) * 100
              ),
              feedback: "",
              submittedAt: tq.closesAt
            }))
        ]
      : [];

  const grades = [...assignmentGrades, ...quizGrades];

  const materials = courses.reduce(
    (count, course) =>
      count +
      (Array.isArray(course.materials) ? course.materials.length : 0),
    0
  );

  const unsubmitted =
    role === "student"
      ? assignments.filter((assignment) => !mySubmission(assignment)).length +
        quizzes.filter((q) => !q.attempted && !q.closed).length +
        theoryQuizzes.filter((tq) => !tq.attempted && !tq.closed).length
      : 0;

  const enrolledStudents = new Set(
    courses.flatMap((course) =>
      (course.students || []).map(getId).filter(Boolean)
    )
  ).size;

  const allSubmissions = assignments.flatMap((assignment) =>
    Array.isArray(assignment.submissions) ? assignment.submissions : []
  );

  const pendingReviews = allSubmissions.filter(
    (submission) => !isGraded(submission)
  ).length;

  const gradedSubmissions = allSubmissions.filter(isGraded).length;

  const progress = courses.slice(0, 6).map((course) => {
    const cId = getId(course._id);
    const relatedAssign = assignments.filter(
      (assignment) => getId(assignment.course) === cId
    );
    const relatedMcq = quizzes.filter((q) => getId(q.course) === cId);
    const relatedTheory = theoryQuizzes.filter(
      (tq) => getId(tq.course) === cId
    );

    if (role === "student") {
      const totalTasks =
        relatedAssign.length + relatedMcq.length + relatedTheory.length;

      let completedTasks = 0;
      const markPercents = [];
      let totalWeightedProgress = 0;

      for (const a of relatedAssign) {
        const sub = mySubmission(a);
        const done = Boolean(sub);
        if (done) completedTasks += 1;

        if (sub && isGraded(sub)) {
          const mPct = Math.max(0, Math.min(100, Number(sub.grade)));
          markPercents.push(mPct);
          totalWeightedProgress += 40 + mPct * 0.6;
        } else if (done) {
          totalWeightedProgress += 40;
        }
      }

      for (const q of relatedMcq) {
        const done = Boolean(q.attempted);
        if (done) completedTasks += 1;

        if (
          q.result &&
          typeof q.result.score === "number" &&
          q.result.maxScore > 0
        ) {
          const mPct = Math.max(
            0,
            Math.min(100, Math.round((q.result.score / q.result.maxScore) * 100))
          );
          markPercents.push(mPct);
          totalWeightedProgress += 40 + mPct * 0.6;
        } else if (done) {
          totalWeightedProgress += 40;
        }
      }

      for (const tq of relatedTheory) {
        const done = Boolean(tq.attempted);
        if (done) completedTasks += 1;

        if (
          tq.result &&
          typeof tq.result.score === "number" &&
          tq.result.maxScore > 0
        ) {
          const mPct = Math.max(
            0,
            Math.min(
              100,
              Math.round((tq.result.score / tq.result.maxScore) * 100)
            )
          );
          markPercents.push(mPct);
          totalWeightedProgress += 40 + mPct * 0.6;
        } else if (done) {
          totalWeightedProgress += 40;
        }
      }

      const completionPct =
        totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : null;

      const marksPct =
        markPercents.length > 0
          ? Math.round(
              markPercents.reduce((s, v) => s + v, 0) / markPercents.length
            )
          : null;

      const combinedPercent =
        totalTasks > 0 ? Math.round(totalWeightedProgress / totalTasks) : null;

      return {
        id: cId,
        title: course.title,
        code: course.code,
        completionPct,
        marksPct,
        percent: combinedPercent,
        detail:
          totalTasks === 0
            ? "No assignments or quizzes in this course yet"
            : marksPct !== null
            ? `Completed: ${completedTasks}/${totalTasks} (${completionPct}%) | Marks Avg: ${marksPct}%`
            : completedTasks > 0
            ? `Completed: ${completedTasks}/${totalTasks} (${completionPct}%) | Marks: Pending evaluation (40% until graded)`
            : `Completed: 0/${totalTasks} (0%) | Not submitted yet`
      };
    }

    return {
      id: cId,
      title: course.title,
      code: course.code,
      percent: null,
      detail: `${course.students?.length || 0} enrolled students`
    };
  });

  const upcoming = assignments
    .filter((assignment) => {
      if (!assignment.deadline) return false;

      const due = new Date(assignment.deadline);
      if (Number.isNaN(due.getTime())) return false;

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
        new Date(a.deadline).getTime() - new Date(b.deadline).getTime()
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
      { label: "Pending Tasks", value: unsubmitted, icon: ClipboardCheck, color: "orange" },
      { label: "Published Results", value: grades.length, icon: Award, color: "purple" }
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

  const courseGraph = courses.slice(0, 10).map((course) => {
    const related = assignments.filter(
      (assignment) => getId(assignment.course) === getId(course._id)
    );
    const subs = related.flatMap((a) =>
      Array.isArray(a.submissions) ? a.submissions : []
    );
    const graded = subs.filter(isGraded).length;
    return {
      id: getId(course._id),
      code: course.code,
      title: course.title,
      students: course.students?.length || 0,
      assignments: related.length,
      submissions: related.reduce((sum, a) => sum + getSubmissionCount(a), 0),
      graded
    };
  });

  const weeklySchedule = [];

  if (role === "student") {
    for (const a of assignments) {
      if (a.deadline) {
        const done = Boolean(mySubmission(a));
        weeklySchedule.push({
          id: `assign-${getId(a._id)}`,
          date: a.deadline,
          kind: "assignment",
          tag: `${courseById.get(getId(a.course))?.code || "Course"} | Assignment`,
          title: a.title,
          meta: done ? "Submitted" : "Due on this day"
        });
      }
    }

    for (const q of quizzes) {
      if (q.closesAt) {
        weeklySchedule.push({
          id: `mcq-${getId(q._id)}`,
          date: q.closesAt,
          kind: "quiz",
          tag: `${q.course?.code || courseById.get(getId(q.course))?.code || "Course"} | MCQ Quiz`,
          title: q.title,
          meta: q.attempted ? "Completed" : `${q.durationMinutes || 15} mins`
        });
      }
    }

    for (const tq of theoryQuizzes) {
      if (tq.closesAt) {
        weeklySchedule.push({
          id: `theory-${getId(tq._id)}`,
          date: tq.closesAt,
          kind: "theory",
          tag: `${tq.course?.code || courseById.get(getId(tq.course))?.code || "Course"} | Theory`,
          title: tq.title,
          meta: tq.attempted ? "Completed" : `${tq.durationMinutes || 15} mins`
        });
      }
    }

    for (const up of Array.isArray(allAcademicUpdates) ? allAcademicUpdates : []) {
      if (up.kind === "reschedule" && up.newDate) {
        weeklySchedule.push({
          id: `resched-${getId(up._id)}`,
          date: up.newDate,
          kind: "reschedule",
          tag: `${up.course?.code || up.courseCode || "Class"} | Rescheduled`,
          title: up.course?.title || up.courseTitle || up.title,
          meta: `${up.newStart || ""} - ${up.newEnd || ""} (Sec ${up.section || "All"})`
        });
      } else if (up.kind === "calendar" && up.date) {
        weeklySchedule.push({
          id: `cal-${getId(up._id)}`,
          date: up.date,
          kind: "calendar",
          tag: `Academic Calendar`,
          title: up.title,
          meta: up.category || "University Event"
        });
      }
    }
  }

  return {
    weeklySchedule,
    courseGraph,
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
        const userResult = await api.get("/auth/me");
        const role = userResult.data?.role;
        const isStudentOrFaculty = role === "student" || role === "faculty";

        const [
          coursesResult,
          tasksResult,
          noticesResult,
          quizzesResult,
          theoryResult,
          updatesResult
        ] = await Promise.all([
          api.get("/courses"),
          api.get("/assignments"),
          api.get("/announcements"),
          isStudentOrFaculty
            ? api.get("/quizzes").catch(() => ({ data: [] }))
            : Promise.resolve({ data: [] }),
          isStudentOrFaculty
            ? api.get("/theory-quizzes").catch(() => ({ data: [] }))
            : Promise.resolve({ data: [] }),
          role === "student"
            ? api.get("/academic-updates").catch(() => ({ data: [] }))
            : Promise.resolve({ data: [] })
        ]);

        if (active) {
          setData(
            makeDashboard(
              userResult.data,
              coursesResult.data || [],
              tasksResult.data || [],
              noticesResult.data || [],
              quizzesResult.data || [],
              theoryResult.data || [],
              updatesResult.data || []
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

      <RoleDashboardCharts data={data} />

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
                {item.createdAt ? ` | ${formatDate(item.createdAt)}` : ""}
              </small>
            </div>
          ))}
        </div>

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
                {item.courseCode} | Due {formatDate(item.deadline)}
              </p>
            </div>
          ))}
        </div>
      </section>

      <section className="grid-two">
        <div className="panel" style={{ gridColumn: "1 / -1" }}>
          {isStudent ? (
            <>
              <div className="live-panel-head">
                <h3>Grades &amp; Feedback</h3>
                <Link to="/grades">View all</Link>
              </div>

              {data.grades.length === 0 && (
                <p className="live-empty">
                  Faculty-published grades will appear here after your
                  assignment or quiz is evaluated.
                </p>
              )}

              {data.grades.map((item) => (
                <div className="live-grade-row" key={item.id}>
                  <div>
                    <strong>{item.title}</strong>
                    <small className="live-meta">
                      {item.courseCode}
                      {item.feedback ? ` | ${item.feedback}` : ""}
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