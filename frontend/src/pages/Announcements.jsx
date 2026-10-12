import React from "react";
import { useEffect, useState } from "react";
import Layout from "../components/Layout.jsx";
import api from "../api/api";

const Announcements = () => {
  const user = JSON.parse(localStorage.getItem("user") || "{}");
  const [announcements, setAnnouncements] = useState([]);
  const [form, setForm] = useState({ title: "", message: "" });

  const load = async () => {
    const res = await api.get("/announcements");
    setAnnouncements(res.data);
  };

  useEffect(() => {
    load();
  }, []);

  const change = (e) => setForm({ ...form, [e.target.name]: e.target.value });

  const publish = async (e) => {
    e.preventDefault();
    await api.post("/announcements", form);
    setForm({ title: "", message: "" });
    load();
  };

  return (
    <Layout title="Announcements">
      {(user.role === "faculty" || user.role === "staff" || user.role === "admin") && (
        <div className="panel">
          <h3>Publish Announcement</h3>
          <form className="form-grid" onSubmit={publish}>
            <input name="title" placeholder="Title" value={form.title} onChange={change} required />
            <input name="message" placeholder="Message" value={form.message} onChange={change} required />
            <button>Publish</button>
          </form>
        </div>
      )}

      <div className="panel">
        <h3>Latest Announcements</h3>
        {announcements.map((a) => (
          <div className="notice premium" key={a._id}>
            <strong>{a.title}</strong>
            <p>{a.message}</p>
            <small>By {a.createdBy?.name || "Unknown"}</small>
          </div>
        ))}
      </div>
    </Layout>
  );
};

export default Announcements;