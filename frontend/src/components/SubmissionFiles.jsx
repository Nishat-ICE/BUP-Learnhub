import React, { useState } from "react";
import api from "../api/api";

export default function SubmissionFiles({ assignment }) {
  const [rows, setRows] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const load = async (event) => {
    if (!event.currentTarget.open || rows !== null || loading) return;

    setLoading(true);
    setError("");

    try {
      const response = await api.get(
        `/assignment-uploads/${assignment._id}/submissions`
      );
      setRows(response.data);
    } catch (err) {
      setError(err.response?.data?.message || "Could not load submissions.");
    } finally {
      setLoading(false);
    }
  };

  const download = async (submission) => {
    setError("");

    try {
      const response = await api.get(
        `/assignment-uploads/${assignment._id}/submissions/${submission._id}/file`,
        { responseType: "blob" }
      );

      const url = URL.createObjectURL(response.data);
      const link = document.createElement("a");
      link.href = url;
      link.download = submission.attachment.originalName;
      document.body.appendChild(link);
      link.click();
      link.remove();

      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch {
      setError("File download failed.");
    }
  };

  return (
    <details className="submission-files" onToggle={load}>
      <summary>View student submissions & files</summary>

      {loading && <p>Loading...</p>}
      {error && <p className="submission-error">{error}</p>}

      {rows?.map((item) => (
        <div className="submission-file-item" key={item._id}>
          <strong>{item.student?.name || "Student"}</strong>
          <small>{item.student?.studentId || item.student?.email || ""}</small>

          {item.text && <p>{item.text}</p>}

          {item.attachment && (
            <button
              type="button"
              className="download-file-btn"
              onClick={() => download(item)}
            >
              Download {item.attachment.originalName}
            </button>
          )}
        </div>
      ))}
    </details>
  );
}