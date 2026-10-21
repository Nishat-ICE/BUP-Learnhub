import React, { useEffect, useState } from "react";
import Layout from "../components/Layout.jsx";
import api from "../api/api";
import { BookOpen, Pencil, Trash2, Users } from "lucide-react";
import "../styles/crud.css";

const initialForm = {
  title: "",
  code: "",
  description: "",
  credit: "3"
};

const Courses = () => {
  const user = JSON.parse(localStorage.getItem("user") || "{}");
  const userId = String(user.id || user._id || "");

  const [courses, setCourses] = useState([]);
  const [form, setForm] = useState(initialForm);
  const [editingId, setEditingId] = useState(null);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState(null);

  const canCreate = user.role === "faculty" || user.role === "admin";

  const load = async () => {
    const response = await api.get("/courses");
    setCourses(response.data);
    setLoading(false);
  };

  useEffect(() => {
    load().catch((error) => {
      setLoading(false);
      setNotice({
        type: "error",
        text: error.response?.data?.message || "Could not load courses."
      });
    });
  }, []);

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
        await api.put(`/courses/${editingId}`, form);
      } else {
        await api.post("/courses", form);
      }

      const message = editingId ? "Course updated." : "Course created.";
      reset();
      await load();
      setNotice({ type: "success", text: message });
    } catch (error) {
      setNotice({
        type: "error",
        text: error.response?.data?.message || "Could not save course."
      });
    } finally {
      setBusy(false);
    }
  };

  const startEdit = (course) => {
    setEditingId(course._id);
    setForm({
      title: course.title || "",
      code: course.code || "",
      description: course.description || "",
      credit: String(course.credit ?? 3)
    });
    setNotice(null);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const remove = async (course) => {
    if (!window.confirm(`Delete "${course.title}"? This cannot be undone.`)) {
      return;
    }

    setNotice(null);

    try {
      await api.delete(`/courses/${course._id}`);
      if (editingId === course._id) reset();
      await load();
      setNotice({ type: "success", text: "Course deleted." });
    } catch (error) {
      setNotice({
        type: "error",
        text: error.response?.data?.message || "Could not delete course."
      });
    }
  };

  const enroll = async (course) => {
    try {
      await api.post(`/courses/${course._id}/enroll`);
      await load();
      setNotice({ type: "success", text: "Enrolled successfully." });
    } catch (error) {
      setNotice({
        type: "error",
        text: error.response?.data?.message || "Enrollment failed."
      });
    }
  };

  return (
    <Layout title="Courses">
      {notice && (
        <div className={`crud-alert crud-${notice.type}`} role="alert">
          {notice.text}
        </div>
      )}

      {canCreate && (
        <section className="panel">
          <div className="crud-form-heading">
            <div>
              <span className="crud-kicker">ACADEMIC CONTENT</span>
              <h3>{editingId ? "Edit course" : "Create a course"}</h3>
            </div>
            {editingId && (
              <button type="button" className="crud-cancel" onClick={reset}>
                Cancel editing
              </button>
            )}
          </div>

          <form className="crud-form" onSubmit={save}>
            <label>
              Course title
              <input
                value={form.title}
                onChange={(e) =>
                  setForm({ ...form, title: e.target.value })
                }
                placeholder="e.g. Database Management Systems"
                required
              />
            </label>

            <label>
              Course code
              <input
                value={form.code}
                onChange={(e) =>
                  setForm({ ...form, code: e.target.value })
                }
                placeholder="e.g. ICT-301"
                required
              />
            </label>

            <label>
              Credit
              <input
                type="number"
                min="0.5"
                max="8"
                step="0.5"
                value={form.credit}
                onChange={(e) =>
                  setForm({ ...form, credit: e.target.value })
                }
                required
              />
            </label>

            <label className="crud-wide">
              Description
              <textarea
                rows="3"
                value={form.description}
                onChange={(e) =>
                  setForm({ ...form, description: e.target.value })
                }
                placeholder="Briefly describe the course"
              />
            </label>

            <button type="submit" className="crud-submit" disabled={busy}>
              {busy ? "Saving..." : editingId ? "Save changes" : "Create course"}
            </button>
          </form>
        </section>
      )}

      {loading && <div className="panel">Loading courses...</div>}

      {!loading && courses.length === 0 && (
        <div className="panel">No courses created yet.</div>
      )}

      <div className="crud-grid">
        {courses.map((course) => {
          const ownerId = String(course.faculty?._id || "");
          const canManage =
            user.role === "admin" ||
            (user.role === "faculty" && ownerId === userId);

          const enrolled = (course.students || []).some(
            (student) =>
              String(student._id || student) === userId
          );

          return (
            <article className="course-card" key={course._id}>
              <div className="course-top">
                <span>{course.code}</span>
                <BookOpen size={23} />
              </div>

              <h3>{course.title}</h3>
              <p>{course.description || "No description provided."}</p>

              <small>Faculty: {course.faculty?.name || "Not assigned"}</small>
              <small>
                <Users size={14} />
                {course.students?.length || 0} enrolled Â· {course.credit || 3} credits
              </small>

              {user.role === "student" && (
                <button
                  type="button"
                  className="crud-submit"
                  disabled={enrolled}
                  onClick={() => enroll(course)}
                >
                  {enrolled ? "Enrolled" : "Enroll course"}
                </button>
              )}

              {canManage && (
                <div className="crud-actions">
                  <button
                    type="button"
                    className="crud-action crud-edit"
                    onClick={() => startEdit(course)}
                  >
                    <Pencil size={16} /> Edit
                  </button>

                  <button
                    type="button"
                    className="crud-action crud-delete"
                    onClick={() => remove(course)}
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

export default Courses;