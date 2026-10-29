import React, {
  useEffect,
  useState
} from "react";

import {
  Bell,
  Check,
  CheckCheck
} from "lucide-react";

import {
  useNavigate
} from "react-router-dom";

import Layout from "../components/Layout.jsx";
import api from "../api/api";
import "../styles/notifications.css";

export default function Notifications() {
  const navigate = useNavigate();

  const [items, setItems] = useState([]);
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [unread, setUnread] = useState(0);
  const [onlyUnread, setOnlyUnread] =
    useState(false);

  const [loading, setLoading] =
    useState(true);

  const [error, setError] = useState("");

  async function load() {
    setLoading(true);
    setError("");

    try {
      const response = await api.get(
        "/notifications",
        {
          params: {
            page,
            limit: 20,
            unread: onlyUnread
              ? 1
              : 0
          }
        }
      );

      setItems(response.data.items || []);
      setPages(response.data.pages || 1);
      setUnread(
        response.data.unreadCount || 0
      );
    } catch {
      setError(
        "Could not load notifications. Check the backend server."
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, [page, onlyUnread]);

  async function markRead(item) {
    try {
      await api.patch(
        `/notifications/${item._id}/read`
      );
      await load();
    } catch {
      setError(
        "Could not mark this notification as read."
      );
    }
  }

  async function markAll() {
    try {
      await api.patch(
        "/notifications/read-all"
      );

      await load();
    } catch {
      setError(
        "Could not mark notifications as read."
      );
    }
  }

  async function openItem(item) {
    if (!item.readAt) {
      try {
        await api.patch(
          `/notifications/${item._id}/read`
        );
      } catch {
        // The source page can still be opened.
      }
    }

    navigate(
      item.link || "/dashboard"
    );
  }

  return (
    <Layout title="Notifications">
      <div className="nh-page">
        <section className="panel nh-page-head">
          <div>
            <span className="nh-eyebrow">
              ACADEMIC ACTIVITY
            </span>

            <h2>Your notifications</h2>

            <p>
              Course updates and academic
              activities relevant to you.
            </p>
          </div>

          <Bell size={30} />
        </section>

        <div className="nh-toolbar">
          <div>
            <button
              type="button"
              className={
                !onlyUnread
                  ? "nh-tab active"
                  : "nh-tab"
              }
              onClick={() => {
                setPage(1);
                setOnlyUnread(false);
              }}
            >
              All
            </button>

            <button
              type="button"
              className={
                onlyUnread
                  ? "nh-tab active"
                  : "nh-tab"
              }
              onClick={() => {
                setPage(1);
                setOnlyUnread(true);
              }}
            >
              Unread ({unread})
            </button>
          </div>

          <button
            type="button"
            className="nh-read-all"
            disabled={!unread}
            onClick={markAll}
          >
            <CheckCheck size={17} />
            Mark all read
          </button>
        </div>

        {error && (
          <div
            className="nh-page-error"
            role="alert"
          >
            {error}
          </div>
        )}

        {loading && (
          <div className="panel">
            Loading notifications...
          </div>
        )}

        {!loading &&
          !error &&
          items.length === 0 && (
            <div className="panel nh-page-empty">
              <Bell size={28} />
              <h3>You're all caught up</h3>
              <p>
                Relevant updates will appear here.
              </p>
            </div>
          )}

        {!loading && (
          <div className="nh-page-list">
            {items.map((item) => (
              <article
                key={item._id}
                className={
                  item.readAt
                    ? "nh-page-item"
                    : "nh-page-item unread"
                }
              >
                <div>
                  <span className="nh-type">
                    {item.type.replaceAll(
                      "-",
                      " "
                    )}
                  </span>

                  <h3>{item.title}</h3>
                  <p>{item.message}</p>

                  <small>
                    {new Date(
                      item.issuedAt ||
                      item.createdAt
                    ).toLocaleString()}
                  </small>
                </div>

                <div className="nh-item-actions">
                  {!item.readAt && (
                    <button
                      type="button"
                      className="nh-light"
                      onClick={() =>
                        markRead(item)
                      }
                    >
                      <Check size={15} />
                      Mark read
                    </button>
                  )}

                  <button
                    type="button"
                    className="nh-open"
                    onClick={() =>
                      openItem(item)
                    }
                  >
                    Open
                  </button>
                </div>
              </article>
            ))}
          </div>
        )}

        {pages > 1 && (
          <div className="nh-pagination">
            <button
              type="button"
              className="nh-light"
              disabled={page <= 1}
              onClick={() =>
                setPage(page - 1)
              }
            >
              Previous
            </button>

            <span>
              {page} / {pages}
            </span>

            <button
              type="button"
              className="nh-light"
              disabled={page >= pages}
              onClick={() =>
                setPage(page + 1)
              }
            >
              Next
            </button>
          </div>
        )}
      </div>
    </Layout>
  );
}