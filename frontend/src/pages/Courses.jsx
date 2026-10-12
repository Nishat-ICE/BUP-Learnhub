import React from "react";
import { useEffect, useState } from "react";
import Layout from "../components/Layout.jsx";
import api from "../api/api";
import { BookOpen, Users } from "lucide-react";

const Courses = () => {
  const user = JSON.parse(localStorage.getItem("user") || "{}");
  const [courses, setCourses] = useState([]);
  const [form, setForm] = useState({ title: "", code: "", description: "", credit: 3 });

  const load = async () => {
    const res = await api.get("/courses");
    setCourses(res.data);
  };

  useEffect(() => {
    load();
  }, []);

  const change = (e) => setForm({ ...form, [e.target.name]: e.target.value });

  const create = async (e) => {
    e.preventDefault();
    await api.post("/courses", form);
    setForm({ title: "", code: "", description: "", credit: 3 });
    load();
  };

  const enroll = async (id) => {
    await api.post(`/courses/${id}/enroll`);
    alert("Enrolled successfully");
    load();
  };

  return (
    <Layout title="Courses">
      {(user.role === "faculty" || user.role === "admin") && (
        <div className="panel">
          <h3>Create Course</h3>
          <form className="form-grid" onSubmit={create}>
            <input name="title" placeholder="Course title" value={form.title} onChange={change} required />
            <input name="code" placeholder="Course code" value={form.code} onChange={change} required />
            <input name="description" placeholder="Description" value={form.description} onChange={change} />
            <button>Create</button>
          </form>
        </div>
      )}

      <div className="cards">
        {courses.map((c) => (
          <div className="course-card" key={c._id}>
            <div className="course-top">
              <span>{c.code}</span>
              <BookOpen />
            </div>
            <h3>{c.title}</h3>
            <p>{c.description || "No description provided."}</p>
            <small>Faculty: {c.faculty?.name || "Not assigned"}</small>
            <small><Users size={14} /> Students: {c.students?.length || 0}</small>
            {user.role === "student" && <button onClick={() => enroll(c._id)}>Enroll Course</button>}
          </div>
        ))}
      </div>
    </Layout>
  );
};

export default Courses;