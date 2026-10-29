import React, {
  useEffect,
  useRef,
  useState
} from "react";

import {
  Bell,
  CheckCheck
} from "lucide-react";

import {
  Link,
  useNavigate
} from "react-router-dom";

import api from "../api/api";
import "../styles/notifications.css";

export default function NotificationBell() {
  const navigate = useNavigate();
  const rootRef = useRef(null);

  const [open, setOpen] = useState(false);
  const [items, setItems] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [error, setError] = useState("");

  async function refresh() {
    try {
      const response = await api.get(
        "/notifications",
        {
          params: { limit: 5 }
        }
      );

      setItems(response.data.items || []);
      setUnreadCount(
        response.data.unreadCount || 0
      );
      setError("");
    } catch {
      setError(
        "Notifications could not be loaded."
      );
    }
  }

  useEffect(() => {
    refresh();

    const timer = setInterval(() => {
      if (
        document.visibilityState === "visible"
      ) {
        refresh();
      }
    }, 45000);

    const onFocus = () => refresh();

    window.addEventListener("focus", onFocus);

    return () => {
      clearInterval(timer);
      window.removeEventListener(
        "focus",
        onFocus
      );
    };
  }, []);

  useEffect(() => {
    if (!open) return;

    function closeOutside(event) {
      if (
        !rootRef.current?.contains(
          event.target
        )
      ) {
        setOpen(false);
      }
    }

    function closeEscape(event) {
      if (event.key === "Escape") {
        setOpen(false);
      }
    }

    document.addEventListener(
      "mousedown",
      closeOutside
    );

    document.addEventListener(
      "keydown",
      closeEscape
    );

    return () => {
      document.removeEventListener(
        "mousedown",
        closeOutside
      );

      document.removeEventListener(
        "keydown",
        closeEscape
      );
    };
  }, [open]);

  async function openItem(item) {
    try {
      if (!item.readAt) {
        await api.patch(
          `/notifications/${item._id}/read`
        );
      }
    } catch {
      // Navigation remains possible even if the read update fails.
    }

    setOpen(false);
    navigate(item.link || "/notifications");
  }

  async function readAll() {
    try {
      await api.patch(
        "/notifications/read-all"
      );

      await refresh();
    } catch {
      setError(
        "Could not mark notifications as read."
      );
    }
  }

  return (
    <div className="nh-bell" ref={rootRef}>
      <button
        type="button"
        className="nh-icon-button"
        aria-label={
          unreadCount
            ? `${unreadCount} unread notifications`
            : "Notifications"
        }
        aria-expanded={open}
        onClick={() => {
          setOpen(!open);
          if (!open) readAll();
        }}
      >
        <Bell size={20} />

        {unreadCount > 0 && (
          <span className="nh-count">
            {unreadCount > 99
              ? "99+"
              : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div className="nh-popover">
          <div className="nh-popover-head">
            <strong>Notifications</strong>

            <button
              type="button"
              className="nh-text-button"
              onClick={readAll}
              disabled={!unreadCount}
            >
              <CheckCheck size={15} />
              Mark all read
            </button>
          </div>

          {error && (
            <p className="nh-error">
              {error}
            </p>
          )}

          {!error && items.length === 0 && (
            <p className="nh-empty">
              Nothing new right now.
            </p>
          )}

          <div className="nh-popover-list">
            {items.map((item) => (
              <button
                type="button"
                key={item._id}
                onClick={() =>
                  openItem(item)
                }
                className={
                  item.readAt
                    ? "nh-item"
                    : "nh-item unread"
                }
              >
                <strong>{item.title}</strong>
                <span>{item.message}</span>
              </button>
            ))}
          </div>

          <Link
            to="/notifications"
            className="nh-view-all"
            onClick={() =>
              setOpen(false)
            }
          >
            View all notifications
          </Link>
        </div>
      )}
    </div>
  );
}