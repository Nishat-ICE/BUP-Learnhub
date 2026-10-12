import React from "react";
import { useEffect, useState } from "react";
import Layout from "../components/Layout.jsx";
import api from "../api/api";
import { ClipboardCheck } from "lucide-react";

const Assignments = () => {
  const user = JSON.parse(localStorage.getItem("user") || "{}");
  const [assignments, setAssignments] = useState([]);
  const [courses, setCourses] = useState([]);
  const [form, setForm] = useState({ title: "", instructions: "", course: "", deadline: "" });

  const load = async () => {
    const a = await api.get("/assignments");
    const c = await api.get("/courses");
    setAssignments(a.data);
    setCourses(c.data);
  };

  useEffect(() => {
    load();
  }, []);

  const change = (e) => setForm({ ...form, [e.target.name]: e.target.value });

  const create = async (e) => {
    e.preventDefault();
    await api.post("/assignments", form);
    setForm({ title: "", instructions: "", course: "", deadline: "" });
    load();
  };

  const submit = async (id) => {
    const text = prompt("Enter submission text/link:");
    if (!text) return;
    await api.post(`/assignments/${id}/submit`, { text });
    alert("Submitted successfully");
    load();
  };

  return (
    <Layout title="Assignments">
      {(user.role === "faculty" || user.role === "admin") && (
        <div className="panel">
          <h3>Create Assignment</h3>
          <form className="form-grid" onSubmit={create}>
            <input name="title" placeholder="Title" value={form.title} onChange={change} required />
            <select name="course" value={form.course} onChange={change} required>
              <option value="">Select Course</option>
              {courses.map((c) => <option key={c._id} value={c._id}>{c.title}</option>)}
            </select>
            <input type="date" name="deadline" value={form.deadline} onChange={change} />
            <input name="instructions" placeholder="Instructions" value={form.instructions} onChange={change} />
            <button>Create</button>
          </form>
        </div>
      )}

      <div className="cards">
        {assignments.map((a) => (
          <div className="course-card" key={a._id}>
            <div className="course-top">
              <span>{a.course?.code || "Assignment"}</span>
              <ClipboardCheck />
            </div>
            <h3>{a.title}</h3>
            <p>{a.instructions || "No instructions."}</p>
            <small>Submissions: {a.submissions?.length || 0}</small>
            {user.role === "student" && <button onClick={() => submit(a._id)}>Submit</button>}
          </div>
        ))}
      </div>
    </Layout>
  );
};

export default Assignments;