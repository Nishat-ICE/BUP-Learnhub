import React, {
  useEffect,
  useState
} from "react";

import { Link } from "react-router-dom";

import {
  BookOpen,
  MessageCircle,
  Pencil,
  Send,
  Trash2
} from "lucide-react";

import Layout from "../components/Layout.jsx";
import api from "../api/api";
import "../styles/discussions.css";

const getId = (value) =>
  String(value?._id || value || "");

const formatDate = (value) => {
  const date = new Date(value);

  return Number.isNaN(date.getTime())
    ? ""
    : date.toLocaleString("en-GB", {
        dateStyle: "medium",
        timeStyle: "short"
      });
};

const getError = (error) =>
  error.response?.data?.message ||
  error.message ||
  "Something went wrong.";

export default function Discussions() {
  const user = JSON.parse(
    localStorage.getItem("user") || "{}"
  );

  const userId = getId(user.id || user._id);
  const isFaculty = user.role === "faculty";

  const [courses, setCourses] = useState([]);
  const [courseId, setCourseId] = useState("");
  const [page, setPage] = useState(1);

  const [listing, setListing] = useState({
    items: [],
    total: 0,
    pages: 1
  });

  const [newPost, setNewPost] = useState({
    title: "",
    body: ""
  });

  const [replyDrafts, setReplyDrafts] = useState({});
  const [replyingTo, setReplyingTo] = useState(null);
  const [editing, setEditing] = useState(null);

  const [loadingCourses, setLoadingCourses] =
    useState(true);

  const [loadingPosts, setLoadingPosts] =
    useState(false);

  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState(null);

  useEffect(() => {
    let active = true;

    api.get("/courses")
      .then((response) => {
        if (!active) return;

        const visible = response.data.filter(
          (course) => {
            if (isFaculty) {
              return getId(course.faculty) === userId;
            }

            return (course.students || []).some(
              (student) =>
                getId(student) === userId
            );
          }
        );

        setCourses(visible);

        if (visible.length) {
          setCourseId(getId(visible[0]._id));
        }
      })
      .catch((error) => {
        if (active) {
          setNotice({
            type: "error",
            text: getError(error)
          });
        }
      })
      .finally(() => {
        if (active) setLoadingCourses(false);
      });

    return () => {
      active = false;
    };
  }, [isFaculty, userId]);

  useEffect(() => {
    if (!courseId) return;

    let active = true;

    setLoadingPosts(true);

    api.get(
      `/discussions/courses/${courseId}`,
      { params: { page } }
    )
      .then((response) => {
        if (active) {
          setListing(response.data);
        }
      })
      .catch((error) => {
        if (active) {
          setNotice({
            type: "error",
            text: getError(error)
          });
        }
      })
      .finally(() => {
        if (active) setLoadingPosts(false);
      });

    return () => {
      active = false;
    };
  }, [courseId, page]);

  async function refresh(targetPage = page) {
    const response = await api.get(
      `/discussions/courses/${courseId}`,
      { params: { page: targetPage } }
    );

    setListing(response.data);
    setPage(targetPage);
  }

  async function changeData(request, success, targetPage = page) {
    setBusy(true);
    setNotice(null);

    try {
      await request();
      await refresh(targetPage);

      setNotice({
        type: "success",
        text: success
      });

      return true;
    } catch (error) {
      setNotice({
        type: "error",
        text: getError(error)
      });

      return false;
    } finally {
      setBusy(false);
    }
  }

  async function publish(event) {
    event.preventDefault();

    const okay = await changeData(
      () =>
        api.post(
          `/discussions/courses/${courseId}`,
          newPost
        ),
      "Discussion posted.",
      1
    );

    if (okay) {
      setNewPost({
        title: "",
        body: ""
      });
    }
  }

  async function postReply(event, threadId) {
    event.preventDefault();

    const body = replyDrafts[threadId] || "";

    const okay = await changeData(
      () =>
        api.post(
          `/discussions/courses/${courseId}/${threadId}/replies`,
          { body }
        ),
      "Reply posted."
    );

    if (okay) {
      setReplyDrafts((previous) => ({
        ...previous,
        [threadId]: ""
      }));

      setReplyingTo(null);
    }
  }

  async function saveEdit(event) {
    event.preventDefault();

    if (!editing) return;

    const base =
      `/discussions/courses/${courseId}/${editing.threadId}`;

    const url =
      editing.kind === "reply"
        ? `${base}/replies/${editing.replyId}`
        : base;

    const body =
      editing.kind === "reply"
        ? { body: editing.body }
        : {
            title: editing.title,
            body: editing.body
          };

    const okay = await changeData(
      () => api.put(url, body),
      "Changes saved."
    );

    if (okay) setEditing(null);
  }

  async function removeMessage(
    threadId,
    replyId = null
  ) {
    const description = replyId
      ? "Remove this reply?"
      : "Remove this discussion? Other people's replies will be kept.";

    if (!window.confirm(description)) return;

    const base =
      `/discussions/courses/${courseId}/${threadId}`;

    const url = replyId
      ? `${base}/replies/${replyId}`
      : base;

    await changeData(
      () => api.delete(url),
      replyId
        ? "Reply removed."
        : "Discussion removed."
    );
  }

  function chooseCourse(value) {
    setCourseId(value);
    setPage(1);
    setEditing(null);
    setReplyingTo(null);
    setNotice(null);

    setListing({
      items: [],
      total: 0,
      pages: 1
    });
  }

  const canRemove = (item) =>
    !item.removedAt &&
    (
      isFaculty ||
      getId(item.author) === userId
    );

  const canEdit = (item) =>
    !item.removedAt &&
    getId(item.author) === userId;

  return (
    <Layout title="Course Discussions">
      <div className="dh-page">
        <section className="panel dh-intro">
          <div>
            <span className="dh-eyebrow">
              ACADEMIC COMMUNITY
            </span>

            <h2>Course Discussions</h2>

            <p>
              Ask questions, share ideas and
              discuss course topics with your
              classmates and faculty.
            </p>
          </div>

          <MessageCircle size={32} />
        </section>

        {notice && (
          <div
            className={`dh-notice ${notice.type}`}
            role="alert"
          >
            {notice.text}
          </div>
        )}

        {loadingCourses ? (
          <section className="panel">
            Loading your courses...
          </section>
        ) : courses.length === 0 ? (
          <section className="panel dh-empty">
            <BookOpen size={32} />

            <h3>
              {isFaculty
                ? "No course assigned yet"
                : "No enrolled course yet"}
            </h3>

            <p>
              {isFaculty
                ? "Create your course before starting a discussion."
                : "Enroll in a course before joining its discussions."}
            </p>

            <Link to="/courses">
              Go to Courses
            </Link>
          </section>
        ) : (
          <>
            <section className="panel dh-toolbar">
              <label>
                Select course

                <select
                  value={courseId}
                  onChange={(event) =>
                    chooseCourse(event.target.value)
                  }
                >
                  {courses.map((course) => (
                    <option
                      key={course._id}
                      value={course._id}
                    >
                      {course.code} -{" "}
                      {course.title}
                    </option>
                  ))}
                </select>
              </label>

              <span>
                {listing.total} discussions
              </span>
            </section>

            <section className="panel">
              <div className="dh-section-head">
                <div>
                  <span className="dh-eyebrow">
                    START A CONVERSATION
                  </span>

                  <h3>New discussion</h3>
                </div>
              </div>

              <form
                className="dh-form"
                onSubmit={publish}
              >
                <label>
                  Topic
                  <input
                    value={newPost.title}
                    maxLength="120"
                    onChange={(event) =>
                      setNewPost({
                        ...newPost,
                        title: event.target.value
                      })
                    }
                    placeholder="e.g. Question about Lecture 04"
                    required
                  />
                </label>

                <label>
                  Your message
                  <textarea
                    rows="4"
                    maxLength="2000"
                    value={newPost.body}
                    onChange={(event) =>
                      setNewPost({
                        ...newPost,
                        body: event.target.value
                      })
                    }
                    placeholder="Write a clear academic question or discussion topic..."
                    required
                  />
                </label>

                <button
                  type="submit"
                  className="dh-primary"
                  disabled={busy}
                >
                  <Send size={16} />
                  {busy
                    ? "Posting..."
                    : "Post discussion"}
                </button>
              </form>
            </section>

            <section className="dh-list">
              <div className="dh-section-head">
                <h3>Conversations</h3>
                <span>
                  Page {page} of{" "}
                  {listing.pages || 1}
                </span>
              </div>

              {loadingPosts && (
                <div className="panel">
                  Loading discussions...
                </div>
              )}

              {!loadingPosts &&
                listing.items.length === 0 && (
                  <div className="panel dh-empty">
                    <MessageCircle size={30} />
                    <p>
                      No discussions in this
                      course yet.
                    </p>
                  </div>
                )}

              {!loadingPosts &&
                listing.items.map((thread) => {
                  const threadEditing =
                    editing?.kind === "thread" &&
                    editing.threadId ===
                      thread._id;

                  return (
                    <article
                      className="panel dh-thread"
                      key={thread._id}
                    >
                      <div className="dh-thread-header">
                        <div>
                          <span className="dh-author">
                            {thread.author?.name ||
                              "Course member"}
                          </span>

                          <small>
                            {thread.author?.role ||
                              "Member"}
                            {" | "}
                            {formatDate(
                              thread.createdAt
                            )}
                          </small>
                        </div>

                        <span className="dh-reply-count">
                          {thread.replies?.length ||
                            0}{" "}
                          replies
                        </span>
                      </div>

                      {threadEditing ? (
                        <form
                          className="dh-form dh-inline"
                          onSubmit={saveEdit}
                        >
                          <label>
                            Topic
                            <input
                              value={editing.title}
                              maxLength="120"
                              onChange={(event) =>
                                setEditing({
                                  ...editing,
                                  title:
                                    event.target.value
                                })
                              }
                              required
                            />
                          </label>

                          <label>
                            Message
                            <textarea
                              rows="3"
                              maxLength="2000"
                              value={editing.body}
                              onChange={(event) =>
                                setEditing({
                                  ...editing,
                                  body:
                                    event.target.value
                                })
                              }
                              required
                            />
                          </label>

                          <div className="dh-actions">
                            <button
                              type="submit"
                              className="dh-primary"
                              disabled={busy}
                            >
                              Save changes
                            </button>

                            <button
                              type="button"
                              className="dh-secondary"
                              onClick={() =>
                                setEditing(null)
                              }
                            >
                              Cancel
                            </button>
                          </div>
                        </form>
                      ) : (
                        <>
                          <h3>{thread.title}</h3>

                          <p className="dh-body">
                            {thread.body}
                          </p>

                          {!thread.removedAt && (
                            <div className="dh-actions">
                              <button
                                type="button"
                                className="dh-secondary"
                                onClick={() =>
                                  setReplyingTo(
                                    replyingTo ===
                                      thread._id
                                      ? null
                                      : thread._id
                                  )
                                }
                              >
                                <MessageCircle
                                  size={15}
                                />
                                Reply
                              </button>

                              {canEdit(thread) && (
                                <button
                                  type="button"
                                  className="dh-secondary"
                                  onClick={() =>
                                    setEditing({
                                      kind:
                                        "thread",
                                      threadId:
                                        thread._id,
                                      title:
                                        thread.title,
                                      body:
                                        thread.body
                                    })
                                  }
                                >
                                  <Pencil size={15} />
                                  Edit
                                </button>
                              )}

                              {canRemove(thread) && (
                                <button
                                  type="button"
                                  className="dh-danger"
                                  disabled={busy}
                                  onClick={() =>
                                    removeMessage(
                                      thread._id
                                    )
                                  }
                                >
                                  <Trash2
                                    size={15}
                                  />
                                  Remove
                                </button>
                              )}
                            </div>
                          )}
                        </>
                      )}

                      {replyingTo === thread._id &&
                        !thread.removedAt && (
                          <form
                            className="dh-form dh-inline"
                            onSubmit={(event) =>
                              postReply(
                                event,
                                thread._id
                              )
                            }
                          >
                            <label>
                              Your reply
                              <textarea
                                rows="3"
                                maxLength="1200"
                                value={
                                  replyDrafts[
                                    thread._id
                                  ] || ""
                                }
                                onChange={(
                                  event
                                ) =>
                                  setReplyDrafts({
                                    ...replyDrafts,
                                    [thread._id]:
                                      event.target
                                        .value
                                  })
                                }
                                required
                              />
                            </label>

                            <button
                              type="submit"
                              className="dh-primary"
                              disabled={busy}
                            >
                              Send reply
                            </button>
                          </form>
                        )}

                      {thread.replies?.length >
                        0 && (
                        <div className="dh-replies">
                          <h4>Replies</h4>

                          {thread.replies.map(
                            (reply) => {
                              const replyEditing =
                                editing?.kind ===
                                  "reply" &&
                                editing.threadId ===
                                  thread._id &&
                                editing.replyId ===
                                  reply._id;

                              return (
                                <div
                                  className="dh-reply"
                                  key={reply._id}
                                >
                                  <div className="dh-reply-head">
                                    <strong>
                                      {reply.author
                                        ?.name ||
                                        "Course member"}
                                    </strong>

                                    <small>
                                      {formatDate(
                                        reply.createdAt
                                      )}
                                    </small>
                                  </div>

                                  {replyEditing ? (
                                    <form
                                      className="dh-form dh-inline"
                                      onSubmit={
                                        saveEdit
                                      }
                                    >
                                      <textarea
                                        rows="3"
                                        maxLength="1200"
                                        value={
                                          editing.body
                                        }
                                        onChange={(
                                          event
                                        ) =>
                                          setEditing({
                                            ...editing,
                                            body:
                                              event
                                                .target
                                                .value
                                          })
                                        }
                                        required
                                      />

                                      <div className="dh-actions">
                                        <button
                                          type="submit"
                                          className="dh-primary"
                                          disabled={
                                            busy
                                          }
                                        >
                                          Save
                                        </button>

                                        <button
                                          type="button"
                                          className="dh-secondary"
                                          onClick={() =>
                                            setEditing(
                                              null
                                            )
                                          }
                                        >
                                          Cancel
                                        </button>
                                      </div>
                                    </form>
                                  ) : (
                                    <>
                                      <p className="dh-body">
                                        {reply.body}
                                      </p>

                                      {!reply.removedAt && (
                                        <div className="dh-actions">
                                          {canEdit(
                                            reply
                                          ) && (
                                            <button
                                              type="button"
                                              className="dh-secondary"
                                              onClick={() =>
                                                setEditing({
                                                  kind:
                                                    "reply",
                                                  threadId:
                                                    thread._id,
                                                  replyId:
                                                    reply._id,
                                                  body:
                                                    reply.body
                                                })
                                              }
                                            >
                                              Edit
                                            </button>
                                          )}

                                          {canRemove(
                                            reply
                                          ) && (
                                            <button
                                              type="button"
                                              className="dh-danger"
                                              disabled={
                                                busy
                                              }
                                              onClick={() =>
                                                removeMessage(
                                                  thread._id,
                                                  reply._id
                                                )
                                              }
                                            >
                                              Remove
                                            </button>
                                          )}
                                        </div>
                                      )}
                                    </>
                                  )}
                                </div>
                              );
                            }
                          )}
                        </div>
                      )}
                    </article>
                  );
                })}

              {listing.pages > 1 && (
                <div className="dh-pagination">
                  <button
                    type="button"
                    className="dh-secondary"
                    disabled={page <= 1}
                    onClick={() =>
                      setPage(page - 1)
                    }
                  >
                    Previous
                  </button>

                  <span>
                    {page} / {listing.pages}
                  </span>

                  <button
                    type="button"
                    className="dh-secondary"
                    disabled={
                      page >= listing.pages
                    }
                    onClick={() =>
                      setPage(page + 1)
                    }
                  >
                    Next
                  </button>
                </div>
              )}
            </section>
          </>
        )}
      </div>
    </Layout>
  );
}