import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  BookOpen,
  Download,
  FileText,
  Pencil,
  Trash2,
  UploadCloud
} from "lucide-react";
import Layout from "../components/Layout.jsx";
import api from "../api/api";
import "../styles/materials.css";

const initialForm = {
  title: "",
  category: "lecture",
  description: ""
};

const idOf = (value) =>
  String(value?._id || value || "");

const categories = {
  lecture: "Lecture note",
  slides: "Presentation",
  reading: "Reading",
  other: "Other"
};

export default function Materials() {
  const user = JSON.parse(localStorage.getItem("user") || "{}");
  const userId = String(user.id || user._id || "");
  const isFaculty = user.role === "faculty";

  const [courses, setCourses] = useState([]);
  const [selectedId, setSelectedId] = useState("");
  const [materials, setMaterials] = useState([]);
  const [filter, setFilter] = useState("all");
  const [form, setForm] = useState(initialForm);
  const [file, setFile] = useState(null);
  const [fileKey, setFileKey] = useState(0);
  const [editingId, setEditingId] = useState(null);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState(null);

  useEffect(() => {
    let active = true;

    api.get("/courses")
      .then((response) => {
        if (!active) return;

        const visible = response.data.filter((course) =>
          isFaculty
            ? idOf(course.faculty) === userId
            : (course.students || []).some(
                (student) => idOf(student) === userId
              )
        );

        setCourses(visible);

        if (visible.length) {
          setSelectedId(idOf(visible[0]._id));
        } else {
          setLoading(false);
        }
      })
      .catch((error) => {
        if (!active) return;

        setMessage({
          type: "error",
          text:
            error.response?.data?.message ||
            "Could not load your courses."
        });
        setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [isFaculty, userId]);

  async function loadMaterials(courseId) {
    const response = await api.get(
      `/materials/courses/${courseId}`
    );

    setMaterials(response.data.materials || []);
  }

  useEffect(() => {
    if (!selectedId) return;

    let active = true;
    setLoading(true);
    setMaterials([]);

    api.get(`/materials/courses/${selectedId}`)
      .then((response) => {
        if (active) {
          setMaterials(response.data.materials || []);
        }
      })
      .catch((error) => {
        if (active) {
          setMessage({
            type: "error",
            text:
              error.response?.data?.message ||
              "Could not load materials."
          });
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [selectedId]);

  function resetForm() {
    setEditingId(null);
    setForm(initialForm);
    setFile(null);
    setFileKey((current) => current + 1);
  }

  function chooseCourse(value) {
    setSelectedId(value);
    setFilter("all");
    setMessage(null);
    resetForm();
  }

  function edit(item) {
    setEditingId(item._id);
    setForm({
      title: item.title || "",
      category: item.category || "other",
      description: item.description || ""
    });
    setFile(null);
    setFileKey((current) => current + 1);
    setMessage(null);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function save(event) {
    event.preventDefault();
    setMessage(null);

    if (!editingId && !file) {
      setMessage({
        type: "error",
        text: "Choose a file first."
      });
      return;
    }

    if (file && file.size > 10 * 1024 * 1024) {
      setMessage({
        type: "error",
        text: "File must be 10 MB or smaller."
      });
      return;
    }

    setBusy(true);

    try {
      const payload = new FormData();
      payload.append("title", form.title.trim());
      payload.append("category", form.category);
      payload.append("description", form.description.trim());

      if (file) payload.append("file", file);

      if (editingId) {
        await api.put(
          `/materials/courses/${selectedId}/${editingId}`,
          payload
        );
      } else {
        await api.post(
          `/materials/courses/${selectedId}`,
          payload
        );
      }

      const text = editingId
        ? "Material updated."
        : "Material uploaded.";

      resetForm();
      await loadMaterials(selectedId);
      setMessage({ type: "success", text });
    } catch (error) {
      setMessage({
        type: "error",
        text:
          error.response?.data?.message ||
          "Could not save material."
      });
    } finally {
      setBusy(false);
    }
  }

  async function remove(item) {
    if (!window.confirm(`Delete "${item.title}"?`)) return;

    setBusy(true);
    setMessage(null);

    try {
      await api.delete(
        `/materials/courses/${selectedId}/${item._id}`
      );

      if (editingId === item._id) resetForm();

      await loadMaterials(selectedId);
      setMessage({
        type: "success",
        text: "Material deleted."
      });
    } catch (error) {
      setMessage({
        type: "error",
        text:
          error.response?.data?.message ||
          "Could not delete material."
      });
    } finally {
      setBusy(false);
    }
  }

  async function download(item) {
    setBusy(true);
    setMessage(null);

    try {
      const response = await api.get(
        `/materials/courses/${selectedId}/${item._id}/file`,
        { responseType: "blob" }
      );

      const url = URL.createObjectURL(response.data);
      const link = document.createElement("a");

      link.href = url;
      link.download = item.originalName || "material";
      document.body.appendChild(link);
      link.click();
      link.remove();

      setTimeout(() => URL.revokeObjectURL(url), 60000);
    } catch {
      setMessage({
        type: "error",
        text: "Could not download the file."
      });
    } finally {
      setBusy(false);
    }
  }

  const visibleMaterials =
    filter === "all"
      ? materials
      : materials.filter((item) => item.category === filter);

  return (
    <Layout title="Learning Materials">
      <div className="mat-page">
        <section className="panel mat-intro">
          <div>
            <span className="mat-eyebrow">COURSE RESOURCES</span>
            <h2>Learning Materials</h2>
            <p>
              {isFaculty
                ? "Upload and organize resources for your courses."
                : "Access learning resources for your enrolled courses."}
            </p>
          </div>

          <BookOpen size={30} />
        </section>

        {message && (
          <div
            role="alert"
            className={`mat-message ${message.type}`}
          >
            {message.text}
          </div>
        )}

        {courses.length === 0 ? (
          <section className="panel mat-empty">
            <FileText size={34} />
            <h3>
              {isFaculty
                ? "No course assigned to you yet"
                : "You are not enrolled in a course yet"}
            </h3>
            <p>
              {isFaculty
                ? "Create a course first, then add its materials."
                : "Enroll in a course to access its materials."}
            </p>
            <Link to="/courses">Go to Courses</Link>
          </section>
        ) : (
          <>
            <section className="panel mat-toolbar">
              <label>
                Course
                <select
                  value={selectedId}
                  onChange={(event) =>
                    chooseCourse(event.target.value)
                  }
                >
                  {courses.map((course) => (
                    <option key={course._id} value={course._id}>
                      {course.code} - {course.title}
                    </option>
                  ))}
                </select>
              </label>

              <label>
                Category
                <select
                  value={filter}
                  onChange={(event) =>
                    setFilter(event.target.value)
                  }
                >
                  <option value="all">All materials</option>
                  {Object.entries(categories).map(
                    ([value, label]) => (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    )
                  )}
                </select>
              </label>
            </section>

            {isFaculty && (
              <section className="panel">
                <div className="mat-section-head">
                  <div>
                    <span className="mat-eyebrow">
                      FACULTY WORKSPACE
                    </span>
                    <h3>
                      {editingId
                        ? "Edit material"
                        : "Upload material"}
                    </h3>
                  </div>

                  {editingId && (
                    <button
                      type="button"
                      className="mat-minor"
                      onClick={resetForm}
                    >
                      Cancel edit
                    </button>
                  )}
                </div>

                <form className="mat-form" onSubmit={save}>
                  <label>
                    Title
                    <input
                      value={form.title}
                      onChange={(event) =>
                        setForm({
                          ...form,
                          title: event.target.value
                        })
                      }
                      placeholder="e.g. Lecture 01 - Introduction"
                      maxLength="120"
                      required
                    />
                  </label>

                  <label>
                    Category
                    <select
                      value={form.category}
                      onChange={(event) =>
                        setForm({
                          ...form,
                          category: event.target.value
                        })
                      }
                    >
                      {Object.entries(categories).map(
                        ([value, label]) => (
                          <option key={value} value={value}>
                            {label}
                          </option>
                        )
                      )}
                    </select>
                  </label>

                  <label className="mat-full">
                    Description | optional
                    <textarea
                      rows="3"
                      maxLength="700"
                      value={form.description}
                      onChange={(event) =>
                        setForm({
                          ...form,
                          description: event.target.value
                        })
                      }
                      placeholder="What does this resource cover?"
                    />
                  </label>

                  <label className="mat-full">
                    {editingId
                      ? "Replace file | optional"
                      : "File | required"}
                    <input
                      key={fileKey}
                      type="file"
                      accept=".pdf,.docx,.pptx,.png,.jpg,.jpeg"
                      onChange={(event) =>
                        setFile(
                          event.target.files?.[0] || null
                        )
                      }
                    />
                    <small>
                      PDF, DOCX, PPTX, JPG or PNG | maximum 10 MB
                    </small>
                    {file && (
                      <button
                        type="button"
                        className="mat-remove-file"
                        onClick={() => {
                          setFile(null);
                          setFileKey((current) => current + 1);
                        }}
                      >
                        Remove selected file
                      </button>
                    )}
                  </label>

                  <button
                    type="submit"
                    className="mat-primary"
                    disabled={busy}
                  >
                    <UploadCloud size={17} />
                    {busy
                      ? "Saving..."
                      : editingId
                      ? "Save changes"
                      : "Upload material"}
                  </button>
                </form>
              </section>
            )}

            <section className="panel">
              <div className="mat-section-head">
                <h3>Course resources</h3>
                <span>{visibleMaterials.length} materials</span>
              </div>

              {loading ? (
                <p className="mat-empty-text">
                  Loading materials...
                </p>
              ) : visibleMaterials.length === 0 ? (
                <p className="mat-empty-text">
                  No materials in this category yet.
                </p>
              ) : (
                <div className="mat-grid">
                  {visibleMaterials.map((item) => (
                    <article
                      className="mat-card"
                      key={item._id}
                    >
                      <div className="mat-card-top">
                        <div className="mat-icon">
                          <FileText size={22} />
                        </div>
                        <span>
                          {categories[item.category] ||
                            "Other"}
                        </span>
                      </div>

                      <h4>{item.title}</h4>

                      {item.description && (
                        <p>{item.description}</p>
                      )}

                      <small>
                        {item.originalName ||
                          "No private file attached"}
                      </small>

                      <div className="mat-actions">
                        {item.downloadable && (
                          <button
                            type="button"
                            className="mat-download"
                            disabled={busy}
                            onClick={() => download(item)}
                          >
                            <Download size={16} />
                            Download
                          </button>
                        )}

                        {isFaculty && (
                          <>
                            <button
                              type="button"
                              className="mat-minor"
                              onClick={() => edit(item)}
                            >
                              <Pencil size={15} />
                              Edit
                            </button>

                            <button
                              type="button"
                              className="mat-danger"
                              disabled={busy}
                              onClick={() => remove(item)}
                            >
                              <Trash2 size={15} />
                              Delete
                            </button>
                          </>
                        )}
                      </div>
                    </article>
                  ))}
                </div>
              )}
            </section>
          </>
        )}
      </div>
    </Layout>
  );
}