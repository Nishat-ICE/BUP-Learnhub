import React, { useEffect, useState } from "react";
import Layout from "../components/Layout.jsx";
import api from "../api/api";
import { Megaphone, Pencil, Trash2 } from "lucide-react";
import "../styles/crud.css";

const initialForm = {
  title: "",
  message: "",
  course: ""
};

const Announcements = () => {
  const user = JSON.parse(localStorage.getItem("user") || "{}");
  const userId = String(user.id || user._id || "");

  const [announcements, setAnnouncements] = useState([]);
  const [courses, setCourses] = useState([]);
  const [form, setForm] = useState(initialForm);
  const [editingId, setEditingId] = useState(null);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState(null);

  const canPublish = ["faculty", "staff"].includes(user.role);

  const load = async () => {
    const [announcementResponse, courseResponse] = await Promise.all([
      api.get("/announcements"),
      api.get("/courses")
    ]);

    setAnnouncements(announcementResponse.data);
    setCourses(courseResponse.data);
    setLoading(false);
  };

  useEffect(() => {
    load().catch((error) => {
      setLoading(false);
      setNotice({
        type: "error",
        text: error.response?.data?.message || "Could not load announcements."
      });
    });
  }, []);

  const availableCourses =
    user.role === "faculty"
      ? courses.filter(
          (course) => String(course.faculty?._id) === userId
        )
      : courses;

  const reset = () => {
    setForm(initialForm);
    setEditingId(null);
  };

  const save = async (event) => {
    event.preventDefault();
    setBusy(true);
    setNotice(null);

    try {
      if (editingId) {
        await api.put(`/announcements/${editingId}`, form);
      } else {
        await api.post("/announcements", form);
      }

      const message = editingId
        ? "Announcement updated."
        : "Announcement published.";

      reset();
      await load();
      setNotice({ type: "success", text: message });
    } catch (error) {
      setNotice({
        type: "error",
        text: error.response?.data?.message || "Could not save announcement."
      });
    } finally {
      setBusy(false);
    }
  };

  const startEdit = (announcement) => {
    setEditingId(announcement._id);
    setForm({
      title: announcement.title || "",
      message: announcement.message || "",
      course: String(announcement.course?._id || "")
    });
    setNotice(null);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const remove = async (announcement) => {
    if (!window.confirm(`Delete "${announcement.title}"?`)) return;

    try {
      await api.delete(`/announcements/${announcement._id}`);
      if (editingId === announcement._id) reset();
      await load();
      setNotice({ type: "success", text: "Announcement deleted." });
    } catch (error) {
      setNotice({
        type: "error",
        text: error.response?.data?.message || "Could not delete announcement."
      });
    }
  };

  return (
    <Layout title="Announcements">
      {notice && (
        <div className={`crud-alert crud-${notice.type}`} role="alert">
          {notice.text}
        </div>
      )}

      {canPublish && (
        <section className="panel">
          <div className="crud-form-heading">
            <div>
              <span className="crud-kicker">ACADEMIC COMMUNICATION</span>
              <h3>
                {editingId ? "Edit announcement" : "Publish announcement"}
              </h3>
            </div>

            {editingId && (
              <button type="button" className="crud-cancel" onClick={reset}>
                Cancel editing
              </button>
            )}
          </div>

          <form className="crud-form" onSubmit={save}>
            <label>
              Title
              <input
                value={form.title}
                onChange={(e) =>
                  setForm({ ...form, title: e.target.value })
                }
                placeholder="e.g. Class schedule updated"
                required
              />
            </label>

            <label>
              Audience
              <select
                value={form.course}
                onChange={(e) =>
                  setForm({ ...form, course: e.target.value })
                }
              >
                <option value="">General announcement</option>
                {availableCourses.map((course) => (
                  <option key={course._id} value={course._id}>
                    {course.code} â€” {course.title}
                  </option>
                ))}
              </select>
            </label>

            <label className="crud-wide">
              Message
              <textarea
                rows="4"
                value={form.message}
                onChange={(e) =>
                  setForm({ ...form, message: e.target.value })
                }
                placeholder="Write the announcement"
                required
              />
            </label>

            <button type="submit" className="crud-submit" disabled={busy}>
              {busy
                ? "Saving..."
                : editingId
                ? "Save changes"
                : "Publish announcement"}
            </button>
          </form>
        </section>
      )}

      {loading && <div className="panel">Loading announcements...</div>}

      {!loading && announcements.length === 0 && (
        <div className="panel">No announcements published yet.</div>
      )}

      <div className="crud-grid">
        {announcements.map((announcement) => {
          const canManage =
            
            (canPublish &&
              String(announcement.createdBy?._id || "") === userId);

          return (
            <article className="course-card" key={announcement._id}>
              <div className="course-top">
                <span>
                  {announcement.course?.code || "GENERAL"}
                </span>
                <Megaphone size={23} />
              </div>

              <h3>{announcement.title}</h3>
              <p className="crud-announcement-text">
                {announcement.message}
              </p>

              <small>
                By {announcement.createdBy?.name || "Unknown"}
              </small>
              <small>
                {announcement.course?.title || "University-wide announcement"}
              </small>

              {canManage && (
                <div className="crud-actions">
                  <button
                    type="button"
                    className="crud-action crud-edit"
                    onClick={() => startEdit(announcement)}
                  >
                    <Pencil size={16} /> Edit
                  </button>

                  <button
                    type="button"
                    className="crud-action crud-delete"
                    onClick={() => remove(announcement)}
                  >
                    <Trash2 size={16} /> Delete
                  </button>
                </div>
              )}
            </article>
          );
        })}
      </div>
    </Layout>
  );
};

export default Announcements;