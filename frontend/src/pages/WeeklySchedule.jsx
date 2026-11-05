import React, { useEffect, useState } from "react";
import Layout from "../components/Layout.jsx";
import StudentWeeklyPlanner from "../components/StudentWeeklyPlanner.jsx";
import api from "../api/api";
import "../styles/dashboard-live.css";

const getId = (value) => {
  if (!value) return "";
  if (typeof value === "string") return value;
  if (typeof value === "object") return getId(value._id || value.id);
  return String(value);
};

export default function WeeklySchedule() {
  const [items, setItems] = useState([]);
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
          updatesRes
        ] = await Promise.all([
          api.get("/auth/me"),
          api.get("/courses"),
          api.get("/assignments"),
          api.get("/quizzes").catch(() => ({ data: [] })),
          api.get("/theory-quizzes").catch(() => ({ data: [] })),
          api.get("/academic-updates").catch(() => ({ data: [] }))
        ]);

        const user = userRes.data || {};
        const userId = getId(user._id || user.id);

        const enrolledCourses = (coursesRes.data || []).filter((c) =>
          (c.students || []).some((s) => getId(s) === userId)
        );
        const courseIds = new Set(enrolledCourses.map((c) => getId(c._id)));
        const courseById = new Map(
          enrolledCourses.map((c) => [getId(c._id), c])
        );

        const schedule = [];

        // 1. Assignments
        for (const a of assignRes.data || []) {
          if (!courseIds.has(getId(a.course)) || !a.deadline) continue;
          const submitted = (a.submissions || []).some(
            (s) => getId(s.student) === userId
          );
          schedule.push({
            id: `assign-${getId(a._id)}`,
            date: a.deadline,
            kind: "assignment",
            tag: `${courseById.get(getId(a.course))?.code || "Course"} | Assignment`,
            title: a.title,
            meta: submitted ? "Submitted" : "Due on this day"
          });
        }

        // 2. MCQ Quizzes
        for (const q of quizRes.data || []) {
          if (!courseIds.has(getId(q.course)) || !q.closesAt) continue;
          schedule.push({
            id: `mcq-${getId(q._id)}`,
            date: q.closesAt,
            kind: "quiz",
            tag: `${q.course?.code || courseById.get(getId(q.course))?.code || "Course"} | MCQ Quiz`,
            title: q.title,
            meta: q.attempted ? "Completed" : `${q.durationMinutes || 15} mins`
          });
        }

        // 3. Theory Assessments
        for (const tq of theoryRes.data || []) {
          if (!courseIds.has(getId(tq.course)) || !tq.closesAt) continue;
          schedule.push({
            id: `theory-${getId(tq._id)}`,
            date: tq.closesAt,
            kind: "theory",
            tag: `${tq.course?.code || courseById.get(getId(tq.course))?.code || "Course"} | Theory`,
            title: tq.title,
            meta: tq.attempted ? "Completed" : `${tq.durationMinutes || 15} mins`
          });
        }

        // 4. Class Reschedules & Calendar Events
        for (const up of updatesRes.data || []) {
          if (up.kind === "reschedule" && up.newDate) {
            schedule.push({
              id: `resched-${getId(up._id)}`,
              date: up.newDate,
              kind: "reschedule",
              tag: `${up.course?.code || up.courseCode || "Class"} | Rescheduled`,
              title: up.course?.title || up.courseTitle || up.title,
              meta: `${up.newStart || ""} - ${up.newEnd || ""} (Sec ${up.section || "All"})`
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
        <div className="panel">Loading your Sunday - Thursday schedule...</div>
      ) : (
        <StudentWeeklyPlanner scheduleItems={items} />
      )}
    </Layout>
  );
}