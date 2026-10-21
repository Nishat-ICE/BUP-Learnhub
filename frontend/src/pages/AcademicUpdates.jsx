import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  CalendarDays,
  Clock3,
  Megaphone,
  Pencil,
  Trash2,
  ArrowRight
} from "lucide-react";
import Layout from "../components/Layout.jsx";
import api from "../api/api";
import "../styles/academicUpdates.css";

const blankEvent = {
  kind: "calendar",
  title: "",
  category: "semester",
  date: "",
  endDate: "",
  description: ""
};

const blankReschedule = {
  kind: "reschedule",
  course: "",
  section: "All",
  oldDate: "",
  oldStart: "",
  oldEnd: "",
  newDate: "",
  newStart: "",
  newEnd: "",
  reason: ""
};

const categories = {
  semester: "Semester",
  exam: "Examination",
  deadline: "Deadline",
  holiday: "Holiday",
  other: "Other"
};

function getId(value) {
  if (!value) return "";
  if (typeof value === "string") return value;
  return getId(value._id || value.id);
}

function prettyDate(value) {
  if (!value) return "â€”";

  const date = new Date(`${value}T00:00:00`);

  if (Number.isNaN(date.getTime())) return value;

  return date.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric"
  });
}

export default function AcademicUpdates() {
  const user = JSON.parse(localStorage.getItem("user") || "{}");
  const userId = getId(user.id || user._id);
  const canPublish = user.role === "staff";

  const [tab, setTab] = useState("calendar");
  const [updates, setUpdates] = useState([]);
  const [courses, setCourses] = useState([]);
  const [eventForm, setEventForm] = useState({ ...blankEvent });
  const [rescheduleForm, setRescheduleForm] = useState({
    ...blankReschedule
  });
  const [editingId, setEditingId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState(null);

  const load = async () => {
    const [updatesResponse, coursesResponse] = await Promise.all([
      api.get("/academic-updates"),
      canPublish
        ? api.get("/courses")
        : Promise.resolve({ data: [] })
    ]);

    if (
      !Array.isArray(updatesResponse.data) ||
      !Array.isArray(coursesResponse.data)
    ) {
      throw new Error("Unexpected API response.");
    }

    setUpdates(updatesResponse.data);
    setCourses(coursesResponse.data);
  };

  useEffect(() => {
    load()
      .catch((error) => {
        setMessage({
          type: "error",
          text:
            error.response?.data?.message ||
            "Could not load academic updates. Check the backend terminal."
        });
      })
      .finally(() => setLoading(false));
  }, []);

  const calendarEvents = updates
    .filter((item) => item.kind === "calendar")
    .sort((a, b) => a.date.localeCompare(b.date));

  const reschedules = updates
    .filter((item) => item.kind === "reschedule")
    .sort(
      (a, b) =>
        (new Date(b.createdAt).getTime() || 0) -
        (new Date(a.createdAt).getTime() || 0)
    );

  const visible = tab === "calendar" ? calendarEvents : reschedules;

  const reset = () => {
    setEditingId(null);
    setEventForm({ ...blankEvent });
    setRescheduleForm({ ...blankReschedule });
  };

  const changeTab = (nextTab) => {
    reset();
    setMessage(null);
    setTab(nextTab);
  };

  const changeEvent = (event) => {
    setEventForm((current) => ({
      ...current,
      [event.target.name]: event.target.value
    }));
  };

  const changeReschedule = (event) => {
    setRescheduleForm((current) => ({
      ...current,
      [event.target.name]: event.target.value
    }));
  };

  const save = async (event) => {
    event.preventDefault();
    setBusy(true);
    setMessage(null);

    const payload =
      tab === "calendar" ? eventForm : rescheduleForm;

    try {
      if (editingId) {
        await api.put(`/academic-updates/${editingId}`, payload);
      } else {
        await api.post("/academic-updates", payload);
      }

      reset();
      await load();

      setMessage({
        type: "success",
        text: editingId
          ? "Update saved successfully."
          : "Academic update published successfully."
      });
    } catch (error) {
      setMessage({
        type: "error",
        text: error.response?.data?.message || "Could not save the update."
      });
    } finally {
      setBusy(false);
    }
  };

  const edit = (item) => {
    setMessage(null);
    setEditingId(item._id);
    setTab(item.kind);

    if (item.kind === "calendar") {
      setEventForm({
        kind: "calendar",
        title: item.title || "",
        category: item.category || "other",
        date: item.date || "",
        endDate: item.endDate || "",
        description: item.description || ""
      });
    } else {
      setRescheduleForm({
        kind: "reschedule",
        course: getId(item.course),
        section: item.section || "All",
        oldDate: item.oldDate || "",
        oldStart: item.oldStart || "",
        oldEnd: item.oldEnd || "",
        newDate: item.newDate || "",
        newStart: item.newStart || "",
        newEnd: item.newEnd || "",
        reason: item.reason || ""
      });
    }

    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const remove = async (item) => {
    if (!window.confirm(`Delete "${item.title}"?`)) return;

    setBusy(true);
    setMessage(null);

    try {
      await api.delete(`/academic-updates/${item._id}`);

      if (editingId === item._id) reset();

      await load();

      setMessage({
        type: "success",
        text: "Academic update deleted."
      });
    } catch (error) {
      setMessage({
        type: "error",
        text: error.response?.data?.message || "Could not delete the update."
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Layout title="Academic Updates">
      <div className="aup-page">
        <section className="aup-hero">
          <span className="aup-eyebrow">BUP LEARNHUB Â· ACADEMIC INFORMATION</span>
          <h1>Stay informed. Stay on schedule.</h1>
          <p>
            Explore the academic calendar, class schedule changes and
            important university announcements.
          </p>

          <Link to="/announcements" className="aup-notice-link">
            <Megaphone size={17} />
            {canPublish
              ? "Publish other announcements"
              : "View announcements"}
            <ArrowRight size={16} />
          </Link>
        </section>

        <div className="aup-stats">
          <div>
            <CalendarDays size={23} />
            <strong>{calendarEvents.length}</strong>
            <span>Calendar events</span>
          </div>

          <div>
            <Clock3 size={23} />
            <strong>{reschedules.length}</strong>
            <span>Relevant class changes</span>
          </div>
        </div>

        {message && (
          <div
            className={`aup-message aup-${message.type}`}
            role="alert"
          >
            {message.text}
          </div>
        )}

        <div className="aup-tabs" aria-label="Academic update type">
          <button
            type="button"
            className={tab === "calendar" ? "aup-tab active" : "aup-tab"}
            onClick={() => changeTab("calendar")}
          >
            <CalendarDays size={18} />
            Academic Calendar
          </button>

          <button
            type="button"
            className={tab === "reschedule" ? "aup-tab active" : "aup-tab"}
            onClick={() => changeTab("reschedule")}
          >
            <Clock3 size={18} />
            Class Reschedules
          </button>
        </div>

        <div className={canPublish ? "aup-layout" : "aup-layout reader"}>
          {canPublish && (
            <section className="aup-panel">
              <div className="aup-panel-heading">
                <div>
                  <small>STAFF WORKSPACE</small>
                  <h2>
                    {editingId
                      ? "Edit update"
                      : tab === "calendar"
                      ? "Add calendar event"
                      : "Publish class change"}
                  </h2>
                </div>

                {editingId && (
                  <button
                    type="button"
                    className="aup-lite"
                    onClick={reset}
                  >
                    Cancel edit
                  </button>
                )}
              </div>

              {tab === "calendar" ? (
                <form className="aup-form" onSubmit={save}>
                  <label>
                    Event title
                    <input
                      name="title"
                      value={eventForm.title}
                      onChange={changeEvent}
                      placeholder="e.g. Midterm examination begins"
                      maxLength="120"
                      required
                    />
                  </label>

                  <label>
                    Category
                    <select
                      name="category"
                      value={eventForm.category}
                      onChange={changeEvent}
                      required
                    >
                      {Object.entries(categories).map(([value, name]) => (
                        <option key={value} value={value}>
                          {name}
                        </option>
                      ))}
                    </select>
                  </label>

                  <div className="aup-two">
                    <label>
                      Date
                      <input
                        type="date"
                        name="date"
                        value={eventForm.date}
                        onChange={changeEvent}
                        required
                      />
                    </label>

                    <label>
                      End date Â· optional
                      <input
                        type="date"
                        name="endDate"
                        value={eventForm.endDate}
                        onChange={changeEvent}
                      />
                    </label>
                  </div>

                  <label>
                    Details
                    <textarea
                      name="description"
                      rows="4"
                      maxLength="1500"
                      value={eventForm.description}
                      onChange={changeEvent}
                      placeholder="Add relevant academic information"
                    />
                  </label>

                  <button
                    type="submit"
                    className="aup-primary"
                    disabled={busy}
                  >
                    {busy
                      ? "Saving..."
                      : editingId
                      ? "Save changes"
                      : "Publish event"}
                  </button>
                </form>
              ) : (
                <form className="aup-form" onSubmit={save}>
                  {courses.length === 0 && (
                    <p className="aup-hint">
                      No course exists yet. A faculty/admin needs to create
                      a course before a class can be rescheduled.
                    </p>
                  )}

                  <label>
                    Course
                    <select
                      name="course"
                      value={rescheduleForm.course}
                      onChange={changeReschedule}
                      required
                    >
                      <option value="">Select course</option>
                      {courses.map((course) => (
                        <option key={course._id} value={course._id}>
                          {course.code} â€” {course.title}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label>
                    Section
                    <input
                      name="section"
                      value={rescheduleForm.section}
                      onChange={changeReschedule}
                      list="aup-sections"
                      placeholder="B or All"
                      maxLength="24"
                      required
                    />
                    <datalist id="aup-sections">
                      <option value="All" />
                      <option value="A" />
                      <option value="B" />
                      <option value="C" />
                      <option value="D" />
                    </datalist>
                  </label>

                  <div className="aup-subhead">Previous class</div>

                  <label>
                    Previous date
                    <input
                      type="date"
                      name="oldDate"
                      value={rescheduleForm.oldDate}
                      onChange={changeReschedule}
                      required
                    />
                  </label>

                  <div className="aup-two">
                    <label>
                      Starts
                      <input
                        type="time"
                        name="oldStart"
                        value={rescheduleForm.oldStart}
                        onChange={changeReschedule}
                        required
                      />
                    </label>

                    <label>
                      Ends
                      <input
                        type="time"
                        name="oldEnd"
                        value={rescheduleForm.oldEnd}
                        onChange={changeReschedule}
                        required
                      />
                    </label>
                  </div>

                  <div className="aup-subhead">New class</div>

                  <label>
                    New date
                    <input
                      type="date"
                      name="newDate"
                      value={rescheduleForm.newDate}
                      onChange={changeReschedule}
                      required
                    />
                  </label>

                  <div className="aup-two">
                    <label>
                      Starts
                      <input
                        type="time"
                        name="newStart"
                        value={rescheduleForm.newStart}
                        onChange={changeReschedule}
                        required
                      />
                    </label>

                    <label>
                      Ends
                      <input
                        type="time"
                        name="newEnd"
                        value={rescheduleForm.newEnd}
                        onChange={changeReschedule}
                        required
                      />
                    </label>
                  </div>

                  <label>
                    Reason Â· optional
                    <textarea
                      name="reason"
                      rows="3"
                      maxLength="700"
                      value={rescheduleForm.reason}
                      onChange={changeReschedule}
                      placeholder="Why was the class rescheduled?"
                    />
                  </label>

                  <button
                    type="submit"
                    className="aup-primary"
                    disabled={busy || courses.length === 0}
                  >
                    {busy
                      ? "Saving..."
                      : editingId
                      ? "Save changes"
                      : "Publish reschedule"}
                  </button>
                </form>
              )}
            </section>
          )}

          <section className="aup-panel">
            <div className="aup-panel-heading">
              <div>
                <small>ACADEMIC RECORDS</small>
                <h2>
                  {tab === "calendar"
                    ? "Academic calendar"
                    : "Class schedule changes"}
                </h2>
              </div>
              <span className="aup-count">{visible.length}</span>
            </div>

            {loading ? (
              <p className="aup-empty">Loading updates...</p>
            ) : visible.length === 0 ? (
              <p className="aup-empty">
                {tab === "calendar"
                  ? "No calendar events published yet."
                  : "No relevant class reschedules published yet."}
              </p>
            ) : (
              <div className="aup-records">
                {visible.map((item) => {
                  const canManage =
                    
                    (user.role === "staff" &&
                      getId(item.createdBy) === userId);

                  return (
                    <article className="aup-record" key={item._id}>
                      {item.kind === "calendar" ? (
                        <>
                          <div className="aup-record-top">
                            <span className="aup-pill">
                              {categories[item.category] || "Event"}
                            </span>
                            <span className="aup-date">
                              {prettyDate(item.date)}
                              {item.endDate
                                ? ` â€“ ${prettyDate(item.endDate)}`
                                : ""}
                            </span>
                          </div>

                          <h3>{item.title}</h3>

                          {item.description && (
                            <p>{item.description}</p>
                          )}
                        </>
                      ) : (
                        <>
                          <div className="aup-record-top">
                            <span className="aup-pill">
                              {item.course?.code ||
                                item.courseCode ||
                                "COURSE"}
                            </span>
                            <span className="aup-date">
                              Section {item.section}
                            </span>
                          </div>

                          <h3>
                            {item.course?.title ||
                              item.courseTitle ||
                              item.title}
                          </h3>

                          <div className="aup-change">
                            <div>
                              <small>PREVIOUS</small>
                              <strong>
                                {prettyDate(item.oldDate)}
                              </strong>
                              <span>
                                {item.oldStart} â€“ {item.oldEnd}
                              </span>
                            </div>

                            <ArrowRight size={19} />

                            <div>
                              <small>UPDATED</small>
                              <strong>
                                {prettyDate(item.newDate)}
                              </strong>
                              <span>
                                {item.newStart} â€“ {item.newEnd}
                              </span>
                            </div>
                          </div>

                          {item.reason && (
                            <p>Reason: {item.reason}</p>
                          )}
                        </>
                      )}

                      <div className="aup-record-footer">
                        <small>
                          Published by{" "}
                          {item.createdBy?.name || "Academic Staff"}
                        </small>

                        {canManage && (
                          <div className="aup-record-actions">
                            <button
                              type="button"
                              className="aup-lite"
                              onClick={() => edit(item)}
                              disabled={busy}
                            >
                              <Pencil size={15} /> Edit
                            </button>

                            <button
                              type="button"
                              className="aup-danger"
                              onClick={() => remove(item)}
                              disabled={busy}
                            >
                              <Trash2 size={15} /> Delete
                            </button>
                          </div>
                        )}
                      </div>
                    </article>
                  );
                })}
              </div>
            )}
          </section>
        </div>
      </div>
    </Layout>
  );
}