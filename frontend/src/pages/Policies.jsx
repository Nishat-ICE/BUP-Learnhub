import React, { useEffect, useState } from "react";
import { ScrollText } from "lucide-react";
import Layout from "../components/Layout.jsx";
import api from "../api/api";
import "../styles/policies.css";

const dateText = (value) => {
  if (!value) return "";

  const date = new Date(value);

  return Number.isNaN(date.getTime())
    ? ""
    : date.toLocaleDateString("en-GB", {
        day: "numeric",
        month: "long",
        year: "numeric"
      });
};

export default function Policies() {
  const [policies, setPolicies] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;

    api.get("/management/policies")
      .then((response) => {
        if (!active) return;

        const published = Array.isArray(response.data)
          ? response.data.filter(
              (item) => item.status === "published"
            )
          : [];

        setPolicies(published);
      })
      .catch((requestError) => {
        if (active) {
          setError(
            requestError.response?.data?.message ||
            "Policies could not be loaded. Check the backend server."
          );
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, []);

  return (
    <Layout title="Policies & Guidelines">
      <div className="policies-page">
        <section className="panel policies-intro">
          <div>
            <span className="policies-eyebrow">
              UNIVERSITY GUIDANCE
            </span>
            <h2>Policies & Guidelines</h2>
            <p>
              Official policies and academic guidance published
              by the University Authority.
            </p>
          </div>

          <ScrollText size={32} />
        </section>

        {error && (
          <div className="policies-message" role="alert">
            {error}
          </div>
        )}

        {loading && (
          <div className="panel policies-empty">
            Loading published policies...
          </div>
        )}

        {!loading && !error && policies.length === 0 && (
          <div className="panel policies-empty">
            <ScrollText size={30} />
            <h3>No published policies yet</h3>
            <p>
              Policies will appear here after the University
              Authority publishes them.
            </p>
          </div>
        )}

        <div className="policies-list">
          {policies.map((policy) => (
            <article
              className="panel policy-card"
              key={policy._id}
            >
              <span className="policy-status">
                Published
              </span>

              <h3>{policy.title}</h3>

              <p className="policy-content">
                {policy.content}
              </p>

              <div className="policy-meta">
                <span>
                  Published by{" "}
                  {policy.createdBy?.name ||
                    "University Authority"}
                </span>

                <span>
                  Updated{" "}
                  {dateText(
                    policy.updatedAt || policy.createdAt
                  )}
                </span>
              </div>
            </article>
          ))}
        </div>
      </div>
    </Layout>
  );
}