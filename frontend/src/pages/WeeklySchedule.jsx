import React, { useEffect, useState } from "react";
import Layout from "../components/Layout.jsx";
import StudentWeeklyPlanner from "../components/StudentWeeklyPlanner.jsx";
import api from "../api/api";
import "../styles/dashboard-live.css";

const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday"];
const DEFAULT_SLOTS = [
  "08:30 - 09:50",
  "10:00 - 11:20",
  "11:30 - 12:50",
  "14:00 - 15:20"
];

const getId = (value) => {
  if (!value) return "";
  if (typeof value === "string") return value;
  if (typeof value === "object") return getId(value._id || value.id);
  return String(value);
};

export default function WeeklySchedule() {
  const [items, setItems] = useState([]);
  const [role, setRole] = useState("student");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;

    async function loadSchedule() {
      setLoading(true);
      setError("");
      try {
        const [
          userRes,
          coursesRes,
          assignRes,
          quizRes,
          theoryRes,
          updatesRes,
          routinesRes
        ] = await Promise.all([
          api.get("/auth/me"),
          api.get("/courses"),
          api.get("/assignments"),
          api.get("/quizzes").catch(() => ({ data: [] })),
          api.get("/theory-quizzes").catch(() => ({ data: [] })),
          api.get("/academic-updates").catch(() => ({ data: [] })),
          api.get("/routines").catch(() => ({ data: [] }))
        ]);

        const user = userRes.data || {};
        const userId = getId(user._id || user.id);
        const userRole = user.role || "student";
        if (active) setRole(userRole);

        const myCourses =
          userRole === "faculty"
            ? (coursesRes.data || []).filter(
                (c) => getId(c.faculty) === userId
              )
            : (coursesRes.data || []).filter((c) =>
                (c.students || []).some((s) => getId(s) === userId)
              );

        const courseIds = new Set(myCourses.map((c) => getId(c._id)));
        const courseCodes = new Set(
          myCourses.map((c) => String(c.code || "").trim().toUpperCase())
        );
        const courseById = new Map(myCourses.map((c) => [getId(c._id), c]));

        const schedule = [];

        // --------------------------------------------------------
        // 1. WEEKLY CLASSES (From Published Auto-Routine OR Course Schedule)
        // --------------------------------------------------------
        const generatedRoutines = (routinesRes.data || []).filter(
          (r) => r.kind === "generated" && Array.isArray(r.entries) && r.entries.length > 0
        );

        let addedClassCount = 0;

        if (generatedRoutines.length > 0) {
          const latestRoutine = generatedRoutines[0];
          (latestRoutine.entries || []).forEach((entry, idx) => {
            const codeUpper = String(entry.courseCode || "")
              .trim()
              .toUpperCase();
            const facMatch =
              userRole === "faculty" &&
              entry.facultyName &&
              String(entry.facultyName)
                .toLowerCase()
                .includes(String(user.name || "").toLowerCase());

            if (courseCodes.has(codeUpper) || facMatch) {
              schedule.push({
                id: `routine-cls-${idx}-${codeUpper}`,
                recurringDay: entry.day,
                kind: "class",
                tag: `${entry.courseCode} | Class (${entry.room || "Room 401"})`,
                title: entry.courseTitle || "Scheduled Lecture",
                meta: `${entry.slot}${
                  userRole === "student" && entry.facultyName
                    ? ` | ${entry.facultyName}`
                    : ` | ${entry.room || "Room 401"}`
                }`
              });
              addedClassCount++;
            }
          });
        }

        // If no published generated routine matched yet, derive weekly class slots from assigned/enrolled courses
        if (addedClassCount === 0 && myCourses.length > 0) {
          myCourses.forEach((course, cIdx) => {
            const day1 = DAY_NAMES[(cIdx * 2) % 5];
            const day2 = DAY_NAMES[(cIdx * 2 + 2) % 5];
            const slot = DEFAULT_SLOTS[cIdx % DEFAULT_SLOTS.length];
            const room = `Room ${401 + (cIdx % 4)}`;

            [day1, day2].forEach((dName, sIdx) => {
              schedule.push({
                id: `auto-cls-${getId(course._id)}-${sIdx}`,
                recurringDay: dName,
                kind: "class",
                tag: `${course.code} | Lecture (${room})`,
                title: course.title,
                meta: `${slot}${
                  userRole === "faculty"
                    ? ` | ${course.students?.length || 0} Students`
                    : course.faculty?.name
                    ? ` | ${course.faculty.name}`
                    : ""
                }`
              });
            });
          });
        }

        // --------------------------------------------------------
        // 2. ASSIGNMENTS (Deadlines & Faculty Pending Reviews)
        // --------------------------------------------------------
        for (const a of assignRes.data || []) {
          if (!courseIds.has(getId(a.course)) || !a.deadline) continue;
          const courseCode =
            courseById.get(getId(a.course))?.code || "Course";

          if (userRole === "faculty") {
            const subs = Array.isArray(a.submissions) ? a.submissions : [];
            const pendingCount = subs.filter(
              (s) => typeof s.grade !== "number"
            ).length;
            schedule.push({
              id: `assign-${getId(a._id)}`,
              date: a.deadline,
              kind: "assignment",
              tag: `${courseCode} | Assignment Task`,
              title: a.title,
              meta: `${subs.length} Submitted | ${pendingCount} Pending Review`
            });
          } else {
            const submitted = (a.submissions || []).some(
              (s) => getId(s.student) === userId
            );
            schedule.push({
              id: `assign-${getId(a._id)}`,
              date: a.deadline,
              kind: "assignment",
              tag: `${courseCode} | Assignment`,
              title: a.title,
              meta: submitted ? "Submitted" : "Due on this day"
            });
          }
        }

        // --------------------------------------------------------
        // 3. MCQ QUIZZES
        // --------------------------------------------------------
        for (const q of quizRes.data || []) {
          if (!courseIds.has(getId(q.course)) || !q.closesAt) continue;
          const cCode =
            q.course?.code ||
            courseById.get(getId(q.course))?.code ||
            "Course";

          schedule.push({
            id: `mcq-${getId(q._id)}`,
            date: q.closesAt,
            kind: "quiz",
            tag: `${cCode} | MCQ Quiz`,
            title: q.title,
            meta:
              userRole === "faculty"
                ? `${q.attemptCount || 0} Attempts | ${
                    q.resultsPublished ? "Published" : "Review / Publish"
                  }`
                : q.attempted
                ? "Completed"
                : `${q.durationMinutes || 15} mins`
          });
        }

        // --------------------------------------------------------
        // 4. BROAD & THEORY ASSESSMENTS
        // --------------------------------------------------------
        for (const tq of theoryRes.data || []) {
          if (!courseIds.has(getId(tq.course)) || !tq.closesAt) continue;
          const cCode =
            tq.course?.code ||
            courseById.get(getId(tq.course))?.code ||
            "Course";

          schedule.push({
            id: `theory-${getId(tq._id)}`,
            date: tq.closesAt,
            kind: "theory",
            tag: `${cCode} | Theory Quiz`,
            title: tq.title,
            meta:
              userRole === "faculty"
                ? `${tq.attemptCount || 0} Attempts | ${
                    tq.resultsPublished ? "Published" : "Grade & Publish"
                  }`
                : tq.attempted
                ? "Completed"
                : `${tq.durationMinutes || 15} mins`
          });
        }

        // --------------------------------------------------------
        // 5. CLASS RESCHEDULES & ACADEMIC CALENDAR EVENTS
        // --------------------------------------------------------
        for (const up of updatesRes.data || []) {
          if (up.kind === "reschedule" && up.newDate) {
            schedule.push({
              id: `resched-${getId(up._id)}`,
              date: up.newDate,
              kind: "reschedule",
              tag: `${up.course?.code || up.courseCode || "Class"} | Rescheduled`,
              title: up.course?.title || up.courseTitle || up.title,
              meta: `${up.newStart || ""} - ${up.newEnd || ""} (Sec ${
                up.section || "All"
              })`
            });
          } else if (up.kind === "calendar" && up.date) {
            schedule.push({
              id: `cal-${getId(up._id)}`,
              date: up.date,
              kind: "calendar",
              tag: "Academic Calendar",
              title: up.title,
              meta: up.category || "University Event"
            });
          }
        }

        if (active) setItems(schedule);
      } catch (err) {
        if (active) {
          setError(
            err.response?.data?.message ||
              "Could not load your weekly schedule."
          );
        }
      } finally {
        if (active) setLoading(false);
      }
    }

    loadSchedule();
    return () => {
      active = false;
    };
  }, []);

  return (
    <Layout title="Weekly Schedule">
      {error && (
        <div className="panel" role="alert" style={{ color: "#b4232f" }}>
          {error}
        </div>
      )}

      {loading ? (
        <div className="panel">
          Loading your Sunday - Thursday classes &amp; tasks...
        </div>
      ) : (
        <StudentWeeklyPlanner scheduleItems={items} role={role} />
      )}
    </Layout>
  );
}