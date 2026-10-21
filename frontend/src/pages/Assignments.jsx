import React, { useEffect, useState } from "react";
import Layout from "../components/Layout.jsx";
import api from "../api/api";
import SubmissionFiles from "../components/SubmissionFiles.jsx";
import "../styles/upload.css";
import { ClipboardCheck, Pencil, Trash2 } from "lucide-react";
import "../styles/crud.css";

const initialForm = {
  title: "",
  instructions: "",
  course: "",
  deadline: ""
};

const Assignments = () => {
  const user = JSON.parse(localStorage.getItem("user") || "{}");
  const userId = String(user.id || user._id || "");

  const [assignments, setAssignments] = useState([]);
  const [courses, setCourses] = useState([]);
  const [form, setForm] = useState(initialForm);
  const [editingId, setEditingId] = useState(null);
  const [submittingId, setSubmittingId] = useState(null);
  const [submissionText, setSubmissionText] = useState("");
  const [submissionFile, setSubmissionFile] = useState(null);
  const [fileInputKey, setFileInputKey] = useState(0);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState(null);

  const canCreate = user.role === "faculty";

  const load = async () => {
    const [assignmentResponse, courseResponse] = await Promise.all([
      api.get("/assignments"),
      api.get("/courses")
    ]);

    setAssignments(assignmentResponse.data);
    setCourses(courseResponse.data);
    setLoading(false);
  };

  useEffect(() => {
    load().catch((error) => {
      setLoading(false);
      setNotice({
        type: "error",
        text: error.response?.data?.message || "Could not load assignments."
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
    setEditingId(null);
    setForm(initialForm);
  };

  const save = async (event) => {
    event.preventDefault();
    setBusy(true);
    setNotice(null);

    try {
      if (editingId) {
        await api.put(`/assignments/${editingId}`, form);
      } else {
        await api.post("/assignments", form);
      }

      const message = editingId
        ? "Assignment updated."
        : "Assignment created.";

      reset();
      await load();
      setNotice({ type: "success", text: message });
    } catch (error) {
      setNotice({
        type: "error",
        text: error.response?.data?.message || "Could not save assignment."
      });
    } finally {
      setBusy(false);
    }
  };

  const startEdit = (assignment) => {
    setEditingId(assignment._id);
    setForm({
      title: assignment.title || "",
      instructions: assignment.instructions || "",
      course: String(assignment.course?._id || ""),
      deadline: assignment.deadline?.slice(0, 10) || ""
    });
    setNotice(null);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const remove = async (assignment) => {
    if (!window.confirm(`Delete "${assignment.title}"?`)) return;

    try {
      await api.delete(`/assignments/${assignment._id}`);
      if (editingId === assignment._id) reset();
      await load();
      setNotice({ type: "success", text: "Assignment deleted." });
    } catch (error) {
      setNotice({
        type: "error",
        text: error.response?.data?.message || "Could not delete assignment."
      });
    }
  };

  const submit = async (event, assignment) => {
    event.preventDefault();
    setBusy(true);

    try {
            if (!submissionText.trim() && !submissionFile) {
        setNotice({ type: "error", text: "Write a message or select a file." });
        return;
      }

      if (submissionFile && submissionFile.size > 10 * 1024 * 1024) {
        setNotice({ type: "error", text: "File must be 10 MB or smaller." });
        return;
      }

      const payload = new FormData();
      if (submissionText.trim()) payload.append("text", submissionText.trim());
      if (submissionFile) payload.append("file", submissionFile);

      await api.post(`/assignment-uploads/${assignment._id}/submit`, payload);
      setSubmittingId(null);
      setSubmissionText("");
    setSubmissionFile(null);
      await load();
      setNotice({ type: "success", text: "Assignment submitted." });
    } catch (error) {
      setNotice({
        type: "error",
        text: error.response?.data?.message || "Submission failed."
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Layout title="Assignments">
      {notice && (
        <div className={`crud-alert crud-${notice.type}`} role="alert">
          {notice.text}
        </div>
      )}

      {canCreate && (
        <section className="panel">
          <div className="crud-form-heading">
            <div>
              <span className="crud-kicker">COURSE ASSESSMENT</span>
              <h3>{editingId ? "Edit assignment" : "Create an assignment"}</h3>
            </div>
            {editingId && (
              <button type="button" className="crud-cancel" onClick={reset}>
                Cancel editing
              </button>
            )}
          </div>

          <form className="crud-form" onSubmit={save}>
            <label>
              Assignment title
              <input
                value={form.title}
                onChange={(e) =>
                  setForm({ ...form, title: e.target.value })
                }
                placeholder="e.g. Database design task"
                required
              />
            </label>

            <label>
              Course
              <select
                value={form.course}
                onChange={(e) =>
                  setForm({ ...form, course: e.target.value })
                }
                required
              >
                <option value="">Select course</option>
                {availableCourses.map((course) => (
                  <option key={course._id} value={course._id}>
                    {course.code} â€” {course.title}
                  </option>
                ))}
              </select>
            </label>

            <label>
              Deadline
              <input
                type="date"
                value={form.deadline}
                onChange={(e) =>
                  setForm({ ...form, deadline: e.target.value })
                }
              />
            </label>

            <label className="crud-wide">
              Instructions
              <textarea
                rows="3"
                value={form.instructions}
                onChange={(e) =>
                  setForm({ ...form, instructions: e.target.value })
                }
                placeholder="Explain what students need to submit"
              />
            </label>

            <button type="submit" className="crud-submit" disabled={busy}>
              {busy
                ? "Saving..."
                : editingId
                ? "Save changes"
                : "Create assignment"}
            </button>
          </form>
        </section>
      )}

      {loading && <div className="panel">Loading assignments...</div>}

      {!loading && assignments.length === 0 && (
        <div className="panel">No assignments available yet.</div>
      )}

      <div className="crud-grid">
        {assignments.map((assignment) => {
          const canManage =
            
            (user.role === "faculty" &&
              String(assignment.course?.faculty || "") === userId);

          const submissionCount =
            assignment.submissionCount ??
            assignment.submissions?.length ??
            0;

          const alreadySubmitted =
            user.role === "student" &&
            (assignment.submissions?.length || 0) > 0;

          return (
            <article className="course-card" key={assignment._id}>
              <div className="course-top">
                <span>{assignment.course?.code || "ASSIGNMENT"}</span>
                <ClipboardCheck size={23} />
              </div>

              <h3>{assignment.title}</h3>
              <p>{assignment.instructions || "No instructions provided."}</p>

              <small>
                Deadline: {assignment.deadline?.slice(0, 10) || "Not specified"}
              </small>
              <small>
                {user.role === "student"
                  ? alreadySubmitted
                    ? "Your status: Submitted"
                    : "Your status: Pending"
                  : `Submissions: ${submissionCount}`}
              </small>

              {user.role === "student" && !alreadySubmitted && (
                <>
                  {submittingId !== assignment._id ? (
                    <button
                      type="button"
                      className="crud-submit"
                      onClick={() => {
                        setSubmittingId(assignment._id);
                        setSubmissionText("");
    setSubmissionFile(null);
                      }}
                    >
                      Submit assignment
                    </button>
                  ) : (
                    <form
                      className="crud-submission"
                      onSubmit={(event) => submit(event, assignment)}
                    >
                      <textarea
                        rows="3"
                        value={submissionText}
                        onChange={(e) => setSubmissionText(e.target.value)}
                        placeholder="Write your submission or paste a file link"
                        required={!submissionFile}
                      />
                      <label className="crud-upload">
                        <span>Attach a file (PDF, DOCX, JPG or PNG Â· max 10 MB)</span>
                        <input
                          key={fileInputKey}
                          type="file"
                          accept=".pdf,.docx,.jpg,.jpeg,.png"
                          onChange={(e) => setSubmissionFile(e.target.files?.[0] || null)}
                        />
                        {submissionFile && <small>Selected: {submissionFile.name}</small>}
                      {submissionFile && (
                        <button
                          type="button"
                          className="crud-cancel"
                          onClick={() => {
                            setSubmissionFile(null);
                            setFileInputKey((n) => n + 1);
                          }}
                        >
                          Remove file
                        </button>
                      )}
                      </label>
                      <div className="crud-actions">
                        <button
                          type="submit"
                          className="crud-submit"
                          disabled={busy}
                        >
                          {busy ? "Submitting..." : "Send"}
                        </button>
                        <button
                          type="button"
                          className="crud-cancel"
                          onClick={() => setSubmittingId(null)}
                        >
                          Cancel
                        </button>
                      </div>
                    </form>
                  )}
                </>
              )}

              {canManage && submissionCount > 0 && <SubmissionFiles assignment={assignment} />}
              {canManage && (
                <>
                  <div className="crud-actions">
                    <button
                      type="button"
                      className="crud-action crud-edit"
                      disabled={submissionCount > 0}
                      onClick={() => startEdit(assignment)}
                    >
                      <Pencil size={16} /> Edit
                    </button>

                    <button
                      type="button"
                      className="crud-action crud-delete"
                      disabled={submissionCount > 0}
                      onClick={() => remove(assignment)}
                    >
                      <Trash2 size={16} /> Delete
                    </button>
                  </div>

                  {submissionCount > 0 && (
                    <small>
                      Editing/deleting is locked because students have submitted work.
                    </small>
                  )}
                </>
              )}
            </article>
          );
        })}
      </div>
    </Layout>
  );
};

export default Assignments;