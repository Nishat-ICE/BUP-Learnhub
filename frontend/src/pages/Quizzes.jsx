import React, {
  useEffect,
  useRef,
  useState
} from "react";

import {
  Award,
  BookOpen,
  CheckCircle2,
  Clock3,
  ListChecks,
  Pencil,
  Timer,
  Trash2
} from "lucide-react";

import Layout from "../components/Layout.jsx";
import api from "../api/api";
import "../styles/quizzes.css";
import TheoryQuizzes from "./TheoryQuizzes.jsx";

const idOf = (value) => String(value?._id || value || "");

const newQuestion = () => ({
  key: `${Date.now()}-${Math.random()}`,
  text: "",
  options: ["", "", "", ""],
  correctIndex: 0,
  points: 1
});

const emptyForm = () => ({
  course: "",
  title: "",
  instructions: "",
  closesAt: "",
  durationMinutes: 15,
  questions: [newQuestion()]
});

const showDate = (value) =>
  value ? new Date(value).toLocaleString() : "Not set";

const errorText = (error) =>
  error.response?.data?.message ||
  error.message ||
  "Request failed.";

const formatSeconds = (value) => {
  const safe = Math.max(0, Number(value) || 0);
  const minutes = Math.floor(safe / 60);
  const seconds = safe % 60;

  return `${minutes}:${String(seconds).padStart(2, "0")}`;
};

function dateForInput(value) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) return "";

  const local = new Date(
    date.getTime() - date.getTimezoneOffset() * 60000
  );

  return local.toISOString().slice(0, 16);
}

export default function Quizzes() {
  const user = JSON.parse(
    localStorage.getItem("user") || "{}"
  );

  const role = user.role;
  const faculty = role === "faculty";
  const student = role === "student";
  const staff = role === "staff";
  const reportRole = [
    "staff",
    "admin",
    "authority"
  ].includes(role);

  const [quizMode, setQuizMode] = useState("mcq");
  const [courses, setCourses] = useState([]);
  const [quizzes, setQuizzes] = useState([]);
  const [report, setReport] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [editingId, setEditingId] = useState(null);

  const [playing, setPlaying] = useState(null);
  const [answers, setAnswers] = useState({});
  const [secondsLeft, setSecondsLeft] = useState(null);
  const [timerDeadline, setTimerDeadline] = useState(null);
  const [savingAnswer, setSavingAnswer] = useState(false);
  const [review, setReview] = useState(null);
  const [studentReview, setStudentReview] = useState(null);
  const [feedback, setFeedback] = useState({});

  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState(null);

  const timeoutLock = useRef(false);
  const saveQueue = useRef(Promise.resolve());
  const pendingSaves = useRef(0);

  async function load() {
    if (reportRole) {
      const response = await api.get("/quizzes/report");
      setReport(response.data);
      return;
    }

    const [quizResponse, courseResponse] =
      await Promise.all([
        api.get("/quizzes"),
        faculty
          ? api.get("/courses")
          : Promise.resolve({ data: [] })
      ]);

    setQuizzes(quizResponse.data);

    if (faculty) {
      const currentUserId = idOf(user.id || user._id);

      setCourses(
        courseResponse.data.filter(
          (course) =>
            idOf(course.faculty) === currentUserId
        )
      );
    }
  }

  useEffect(() => {
    load()
      .catch((error) => {
        setNotice({
          type: "error",
          text: errorText(error)
        });
      })
      .finally(() => setLoading(false));
  }, []);

  async function autoSubmitExpired(quizId) {
    if (timeoutLock.current) return;

    timeoutLock.current = true;

    try {
      const response = await api.post(
        `/quizzes/${quizId}/timeout`
      );

      setNotice({
        type: "success",
        text: response.data.message
      });

      setPlaying(null);
      setTimerDeadline(null);
      setSecondsLeft(null);
      setAnswers({});

      await load();
    } catch (error) {
      const remaining =
        error.response?.data?.secondsLeft;

      // Server clock is authoritative; retry if it still has time.
      if (
        error.response?.status === 409 &&
        Number(remaining) > 0
      ) {
        timeoutLock.current = false;
        setTimerDeadline(
          Date.now() + Number(remaining) * 1000
        );
        setSecondsLeft(Number(remaining));
        return;
      }

      setNotice({
        type: "error",
        text:
          error.response?.data?.message ||
          "Could not sync the expired attempt. Reopen the quiz to retry."
      });

      setPlaying(null);
      setTimerDeadline(null);
      setSecondsLeft(null);

      await load().catch(() => {});
    }
  }

  const playingId = playing?._id || "";

  useEffect(() => {
    if (!playingId || timerDeadline === null) {
      return undefined;
    }

    const tick = () => {
      const remaining = Math.max(
        0,
        Math.ceil((timerDeadline - Date.now()) / 1000)
      );

      setSecondsLeft(remaining);

      if (remaining === 0) {
        autoSubmitExpired(playingId);
      }
    };

    tick();

    const timer = window.setInterval(tick, 250);

    return () => window.clearInterval(timer);
  }, [playingId, timerDeadline]);

  function resetForm() {
    setEditingId(null);
    setForm(emptyForm());
  }

  function updateQuestion(index, changes) {
    setForm((current) => ({
      ...current,
      questions: current.questions.map(
        (question, position) =>
          position === index
            ? { ...question, ...changes }
            : question
      )
    }));
  }

  async function run(action, success) {
    setBusy(true);
    setNotice(null);

    try {
      const response = await action();
      await load();

      setNotice({
        type: "success",
        text: success || response.data.message
      });

      return response.data;
    } catch (error) {
      setNotice({
        type: "error",
        text: errorText(error)
      });

      return null;
    } finally {
      setBusy(false);
    }
  }

  async function save(event) {
    event.preventDefault();

    let closesAt;

    try {
      closesAt = new Date(form.closesAt).toISOString();
    } catch {
      setNotice({
        type: "error",
        text: "Choose a valid quiz deadline."
      });
      return;
    }

    const payload = {
      ...form,
      closesAt,
      durationMinutes: Number(form.durationMinutes),
      questions: form.questions.map((question) => ({
        text: question.text,
        options: question.options,
        correctIndex: Number(question.correctIndex),
        points: Number(question.points)
      }))
    };

    const result = await run(() =>
      editingId
        ? api.put(`/quizzes/${editingId}`, payload)
        : api.post("/quizzes", payload)
    );

    if (result) resetForm();
  }

  async function edit(item) {
    setBusy(true);

    try {
      const response = await api.get(
        `/quizzes/${item._id}`
      );

      const quiz = response.data;

      setEditingId(quiz._id);
      setForm({
        course: idOf(quiz.course),
        title: quiz.title,
        instructions: quiz.instructions || "",
        closesAt: dateForInput(quiz.closesAt),
        durationMinutes: quiz.durationMinutes || 15,
        questions: quiz.questions.map((question) => ({
          key: idOf(question._id),
          text: question.text,
          options: question.options,
          correctIndex: question.correctIndex,
          points: question.points
        }))
      });

      window.scrollTo({
        top: 0,
        behavior: "smooth"
      });
    } catch (error) {
      setNotice({
        type: "error",
        text: errorText(error)
      });
    } finally {
      setBusy(false);
    }
  }

  async function openQuiz(item) {
    setBusy(true);
    setNotice(null);
    timeoutLock.current = false;

    try {
      const response = await api.get(
        `/quizzes/${item._id}/play`
      );

      const data = response.data;

      if (data.closed) {
        setNotice({
          type: "error",
          text: data.message || "Quiz deadline has passed."
        });
        await load();
        return;
      }

      if (data.attempted || !data.questions?.length) {
        setNotice({
          type: data.result ? "success" : "error",
          text: data.result
            ? "This quiz is already submitted."
            : data.message ||
              "Your attempt is complete. Results show after Faculty publishes."
        });

        await load();
        return;
      }

      const restored = {};

      for (const answer of data.savedAnswers || []) {
        restored[String(answer.questionId)] =
          answer.selectedIndex;
      }

      const serverNow = Date.parse(data.serverNow);
      const serverExpiry = Date.parse(data.expiresAt);

      const remainingMs =
        Number.isFinite(serverNow) &&
        Number.isFinite(serverExpiry)
          ? Math.max(0, serverExpiry - serverNow)
          : Math.max(0, Number(data.secondsLeft || 0) * 1000);

      setAnswers(restored);
      setPlaying(data);
      setSecondsLeft(
        Math.ceil(remainingMs / 1000)
      );
      setTimerDeadline(Date.now() + remainingMs);
      pendingSaves.current = 0;
      saveQueue.current = Promise.resolve();
    } catch (error) {
      setNotice({
        type: "error",
        text: errorText(error)
      });
    } finally {
      setBusy(false);
    }
  }

  function saveAnswer(questionId, selectedIndex) {
    setAnswers((current) => ({
      ...current,
      [questionId]: selectedIndex
    }));

    pendingSaves.current += 1;
    setSavingAnswer(true);

    const task = saveQueue.current
      .catch(() => {})
      .then(() =>
        api.patch(
          `/quizzes/${playing._id}/answers`,
          { questionId, selectedIndex }
        )
      );

    saveQueue.current = task;

    task
      .catch((error) => {
        setNotice({
          type: "error",
          text:
            error.response?.data?.message ||
            "Answer could not be saved. Check your connection."
        });
      })
      .finally(() => {
        pendingSaves.current = Math.max(
          0,
          pendingSaves.current - 1
        );

        setSavingAnswer(
          pendingSaves.current > 0
        );
      });
  }

  async function submitQuiz(event) {
    event.preventDefault();

    if (!playing) return;

    if (secondsLeft === 0) {
      await autoSubmitExpired(playing._id);
      return;
    }

    const selected = playing.questions.map((question) => ({
      questionId: question._id,
      selectedIndex: answers[question._id]
    }));

    if (
      selected.some(
        (answer) => answer.selectedIndex === undefined
      )
    ) {
      setNotice({
        type: "error",
        text: "Answer every question before submitting."
      });
      return;
    }

    if (!window.confirm("Submit your quiz? You can attempt it only once.")) {
      return;
    }

    setBusy(true);

    try {
      await saveQueue.current;

      await api.post(
        `/quizzes/${playing._id}/submit`,
        { answers: selected }
      );

      setPlaying(null);
      setTimerDeadline(null);
      setSecondsLeft(null);
      setAnswers({});

      await load();

      setNotice({
        type: "success",
        text:
          "Quiz submitted. Marks and answer review will be available after Faculty publishes results."
      });
    } catch (error) {
      setNotice({
        type: "error",
        text: errorText(error)
      });
    } finally {
      setBusy(false);
    }
  }

  async function openStudentReview(quiz) {
    setBusy(true);
    setNotice(null);

    try {
      const response = await api.get(
        `/quizzes/${quiz._id}/review`
      );

      setStudentReview(response.data);
    } catch (error) {
      setNotice({
        type: "error",
        text: errorText(error)
      });
    } finally {
      setBusy(false);
    }
  }

  async function openReview(quiz) {
    setBusy(true);

    try {
      const [quizResponse, attemptsResponse] =
        await Promise.all([
          api.get(`/quizzes/${quiz._id}`),
          api.get(`/quizzes/${quiz._id}/attempts`)
        ]);

      setReview({
        quiz: quizResponse.data,
        attempts: attemptsResponse.data
      });

      setFeedback({});
    } catch (error) {
      setNotice({
        type: "error",
        text: errorText(error)
      });
    } finally {
      setBusy(false);
    }
  }

  async function saveFeedback(attempt) {
    if (!review) return;

    const result = await run(() =>
      api.put(
        `/quizzes/${review.quiz._id}/attempts/${attempt._id}/feedback`,
        {
          feedback:
            feedback[attempt._id] ??
            attempt.feedback ??
            ""
        }
      )
    );

    if (result) {
      await openReview({ _id: review.quiz._id });
    }
  }

  async function publishResults(quiz) {
    if (
      !window.confirm(
        "Publish marks and correct-answer review to students?"
      )
    ) {
      return;
    }

    await run(() =>
      api.post(`/quizzes/${quiz._id}/results`)
    );
  }

  async function removeQuiz(quiz) {
    if (!window.confirm(`Delete "${quiz.title}"?`)) {
      return;
    }

    await run(() =>
      api.delete(`/quizzes/${quiz._id}`)
    );
  }

  if (
    ![
      "student",
      "faculty",
      "staff",
      "admin",
      "authority"
    ].includes(role)
  ) {
    return (
      <Layout title="Quizzes">
        <div className="panel">
          This section is not available for your role.
        </div>
      </Layout>
    );
  }

    if (!reportRole && quizMode === "theory") {
    return (
      <Layout title="Quizzes">
        <div className="lq-page">
          <div className="lq-mode-switch" role="tablist" aria-label="Assessment type">
            <button
              type="button"
              className="lq-mode-btn"
              onClick={() => setQuizMode("mcq")}
            >
              Multiple Choice (MCQ)
            </button>
            <button
              type="button"
              className="lq-mode-btn active"
              onClick={() => setQuizMode("theory")}
            >
              Broad &amp; Theory Questions
            </button>
          </div>
          <TheoryQuizzes embedded />
        </div>
      </Layout>
    );
  }

  return (
    <Layout
      title={
        staff
          ? "Quiz Participation"
          : reportRole
          ? "Quiz Reports"
          : "Quizzes"
      }
    >
            <div className="lq-page">
        {!reportRole && (
          <div className="lq-mode-switch" role="tablist" aria-label="Assessment type">
            <button
              type="button"
              className="lq-mode-btn active"
              onClick={() => setQuizMode("mcq")}
            >
              Multiple Choice (MCQ)
            </button>
            <button
              type="button"
              className="lq-mode-btn"
              onClick={() => setQuizMode("theory")}
            >
              Broad &amp; Theory Questions
            </button>
          </div>
        )}
        <section className="panel lq-hero">
          <div>
            <span className="lq-eyebrow">
              {reportRole
                ? "ACADEMIC OVERVIEW"
                : "COURSE ASSESSMENTS"}
            </span>

            <h2>
              {staff
                ? "Quiz participation"
                : reportRole
                ? "Quiz reports"
                : faculty
                ? "Manage your quizzes"
                : "Your course quizzes"}
            </h2>

            <p>
              {staff
                ? "View enrolment and participation counts."
                : reportRole
                ? "View aggregate quiz activity."
                : faculty
                ? "Set each quiz deadline and attempt duration."
                : "Your timer starts when you begin. Marks and answer review appear after Faculty publishes results."}
            </p>
          </div>

          <ListChecks size={31} />
        </section>

        {notice && (
          <div
            className={`lq-notice ${notice.type}`}
            role="alert"
          >
            {notice.text}
          </div>
        )}

        {loading && (
          <div className="panel">Loading quizzes...</div>
        )}

        {reportRole && report && (
          <>
            <div className="lq-stats">
              <div>
                <strong>{report.total}</strong>
                <span>Quizzes</span>
              </div>

              <div>
                <strong>{report.submissions}</strong>
                <span>Submitted attempts</span>
              </div>
            </div>

            <div className="panel">
              <h3>Course-wise quiz activity</h3>

              {report.rows.length === 0 ? (
                <p>No quiz activity yet.</p>
              ) : (
                <div className="lq-table-wrap">
                  <table className="lq-table">
                    <thead>
                      <tr>
                        <th>Quiz</th>
                        <th>Enrolled</th>
                        <th>Submitted</th>
                        <th>Not submitted</th>
                        <th>Participation</th>
                        {!staff && <th>Average marks</th>}
                      </tr>
                    </thead>

                    <tbody>
                      {report.rows.map((row) => (
                        <tr key={row.id}>
                          <td>
                            <strong>
                              {row.courseCode} | {row.title}
                            </strong>
                            <small>{row.courseTitle}</small>
                          </td>
                          <td>{row.enrolled}</td>
                          <td>{row.submitted}</td>
                          <td>{row.notSubmitted}</td>
                          <td>
                            {row.participationPercent === null
                              ? "-"
                              : `${row.participationPercent}%`}
                          </td>
                          {!staff && (
                            <td>
                              {row.averagePercent === null
                                ? "-"
                                : `${row.averagePercent}%`}
                            </td>
                          )}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </>
        )}

        {faculty && !loading && (
          <section className="panel">
            <div className="lq-section-head">
              <h3>
                {editingId
                  ? "Edit quiz"
                  : "Create MCQ quiz"}
              </h3>

              {editingId && (
                <button
                  type="button"
                  className="lq-secondary"
                  onClick={resetForm}
                >
                  Cancel edit
                </button>
              )}
            </div>

            {courses.length === 0 ? (
              <p>
                Create your course first to add a quiz.
              </p>
            ) : (
              <form className="lq-form" onSubmit={save}>
                <div className="lq-two">
                  <label>
                    Course
                    <select
                      value={form.course}
                      disabled={Boolean(editingId)}
                      onChange={(event) =>
                        setForm({
                          ...form,
                          course: event.target.value
                        })
                      }
                      required
                    >
                      <option value="">Select course</option>

                      {courses.map((course) => (
                        <option
                          key={course._id}
                          value={course._id}
                        >
                          {course.code} - {course.title}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label>
                    Quiz title
                    <input
                      value={form.title}
                      maxLength="120"
                      onChange={(event) =>
                        setForm({
                          ...form,
                          title: event.target.value
                        })
                      }
                      required
                    />
                  </label>
                </div>

                <div className="lq-two">
                  <label>
                    Attempt deadline - date and time
                    <input
                      type="datetime-local"
                      value={form.closesAt}
                      onChange={(event) =>
                        setForm({
                          ...form,
                          closesAt: event.target.value
                        })
                      }
                      required
                    />
                  </label>

                  <label>
                    Time allowed per attempt - minutes
                    <input
                      type="number"
                      min="1"
                      max="600"
                      value={form.durationMinutes}
                      onChange={(event) =>
                        setForm({
                          ...form,
                          durationMinutes: event.target.value
                        })
                      }
                      required
                    />
                    <small>
                      Faculty can choose any duration from 1 to 600 minutes-for example, 3 or 45.
                    </small>
                  </label>
                </div>

                <label>
                  Instructions
                  <input
                    value={form.instructions}
                    maxLength="1000"
                    onChange={(event) =>
                      setForm({
                        ...form,
                        instructions: event.target.value
                      })
                    }
                    placeholder="Optional"
                  />
                </label>

                {form.questions.map((question, index) => (
                  <div
                    className="lq-question"
                    key={question.key}
                  >
                    <div className="lq-section-head">
                      <strong>Question {index + 1}</strong>

                      {form.questions.length > 1 && (
                        <button
                          type="button"
                          className="lq-danger"
                          onClick={() =>
                            setForm({
                              ...form,
                              questions: form.questions.filter(
                                (_, position) => position !== index
                              )
                            })
                          }
                        >
                          Remove
                        </button>
                      )}
                    </div>

                    <label>
                      Question text
                      <input
                        value={question.text}
                        maxLength="500"
                        onChange={(event) =>
                          updateQuestion(index, {
                            text: event.target.value
                          })
                        }
                        required
                      />
                    </label>

                    <div className="lq-two">
                      {question.options.map(
                        (option, optionIndex) => (
                          <label key={optionIndex}>
                            Option {optionIndex + 1}
                            <input
                              value={option}
                              maxLength="200"
                              onChange={(event) => {
                                const options = [
                                  ...question.options
                                ];

                                options[optionIndex] =
                                  event.target.value;

                                updateQuestion(index, {
                                  options
                                });
                              }}
                              required
                            />
                          </label>
                        )
                      )}
                    </div>

                    <div className="lq-two">
                      <label>
                        Correct answer
                        <select
                          value={question.correctIndex}
                          onChange={(event) =>
                            updateQuestion(index, {
                              correctIndex: Number(
                                event.target.value
                              )
                            })
                          }
                        >
                          {[0, 1, 2, 3].map((number) => (
                            <option
                              key={number}
                              value={number}
                            >
                              Option {number + 1}
                            </option>
                          ))}
                        </select>
                      </label>

                      <label>
                        Marks
                        <input
                          type="number"
                          min="1"
                          max="20"
                          value={question.points}
                          onChange={(event) =>
                            updateQuestion(index, {
                              points: Number(
                                event.target.value
                              )
                            })
                          }
                          required
                        />
                      </label>
                    </div>
                  </div>
                ))}

                <div className="lq-actions">
                  <button
                    type="button"
                    className="lq-secondary"
                    disabled={form.questions.length >= 20}
                    onClick={() =>
                      setForm({
                        ...form,
                        questions: [
                          ...form.questions,
                          newQuestion()
                        ]
                      })
                    }
                  >
                    + Add question
                  </button>

                  <button
                    type="submit"
                    className="lq-primary"
                    disabled={busy}
                  >
                    {editingId
                      ? "Save changes"
                      : "Save as draft"}
                  </button>
                </div>
              </form>
            )}
          </section>
        )}

        {!reportRole && !loading && (
          <>
            <div className="lq-section-head">
              <h3>
                {faculty ? "Your quizzes" : "Available quizzes"}
              </h3>
              <span>{quizzes.length}</span>
            </div>

            {quizzes.length === 0 && (
              <div className="panel">
                {student
                  ? "No published quiz is available in your enrolled courses."
                  : "No quizzes created yet."}
              </div>
            )}

            <div className="lq-grid">
              {quizzes.map((quiz) => {
                const closed =
                  quiz.closed ||
                  new Date(quiz.closesAt).getTime() <= Date.now();

                return (
                  <article
                    className="lq-card"
                    key={quiz._id}
                  >
                    <span className="lq-pill">
                      {quiz.course?.code || "COURSE"}
                    </span>

                    <h3>{quiz.title}</h3>

                    {quiz.instructions && (
                      <p>{quiz.instructions}</p>
                    )}

                    <small>
                      <Clock3 size={15} />
                      Deadline: {showDate(quiz.closesAt)}
                    </small>

                    <small>
                      <Timer size={15} />
                      Time allowed: {quiz.durationMinutes || 15} minutes
                    </small>

                    <small>
                      <BookOpen size={15} />
                      {quiz.questionCount} questions |{" "}
                      {quiz.maxScore} marks
                    </small>

                    {faculty ? (
                      <>
                        <small>
                          {quiz.attemptCount || 0} final attempts |{" "}
                          {quiz.isPublished ? "Published" : "Draft"}
                        </small>

                        <div className="lq-actions">
                          {!quiz.isPublished && !closed && (
                            <button
                              type="button"
                              className="lq-primary"
                              disabled={busy}
                              onClick={() =>
                                run(() =>
                                  api.post(
                                    `/quizzes/${quiz._id}/publish`
                                  )
                                )
                              }
                            >
                              Publish quiz
                            </button>
                          )}

                          <button
                            type="button"
                            className="lq-secondary"
                            onClick={() => openReview(quiz)}
                          >
                            Review attempts
                          </button>

                          {quiz.attemptCount > 0 &&
                            !quiz.resultsPublished && (
                              <button
                                type="button"
                                className="lq-primary"
                                disabled={busy}
                                onClick={() =>
                                  publishResults(quiz)
                                }
                              >
                                Publish results
                              </button>
                            )}

                          <button
                            type="button"
                            className="lq-secondary"
                            disabled={busy || quiz.attemptCount > 0}
                            onClick={() => edit(quiz)}
                          >
                            <Pencil size={15} />
                            Edit
                          </button>

                          <button
                            type="button"
                            className="lq-danger"
                            disabled={busy || quiz.attemptCount > 0}
                            onClick={() => removeQuiz(quiz)}
                          >
                            <Trash2 size={15} />
                            Delete
                          </button>
                        </div>
                      </>
                    ) : (
                      <div className="lq-actions">
                        {quiz.attempted ? (
                          <div>
                            {quiz.result ? (
                              <div className="lq-result">
                                <CheckCircle2 size={18} />
                                <div>
                                  <strong>
                                    {quiz.result.score}/
                                    {quiz.result.maxScore}
                                  </strong>
                                  {quiz.result.feedback && (
                                    <p>
                                      Feedback:{" "}
                                      {quiz.result.feedback}
                                    </p>
                                  )}
                                </div>
                              </div>
                            ) : (
                              <span>
                                {quiz.expired
                                  ? "Time expired | Result pending Faculty publication."
                                  : "Submitted | Result pending Faculty publication."}
                              </span>
                            )}

                            {quiz.reviewAvailable && (
                              <button
                                type="button"
                                className="lq-secondary"
                                disabled={busy}
                                onClick={() =>
                                  openStudentReview(quiz)
                                }
                              >
                                Review answers
                              </button>
                            )}
                          </div>
                        ) : (
                          <button
                            type="button"
                            className="lq-primary"
                            disabled={busy || closed}
                            onClick={() => openQuiz(quiz)}
                          >
                            {closed
                              ? "Deadline passed"
                              : quiz.inProgress
                              ? "Resume attempt"
                              : "Attempt quiz"}
                          </button>
                        )}
                      </div>
                    )}
                  </article>
                );
              })}
            </div>
          </>
        )}

        {student && playing && (
          <section className="panel lq-current">
            <div className="lq-section-head">
              <h3>{playing.title}</h3>

              <button
                type="button"
                className="lq-secondary"
                onClick={() => {
                  if (
                    window.confirm(
                      "Close this window? The server timer keeps running; resume before it expires."
                    )
                  ) {
                    setPlaying(null);
                    setTimerDeadline(null);
                    setSecondsLeft(null);
                  }
                }}
              >
                Close
              </button>
            </div>

            <p>
              Quiz deadline: {showDate(playing.closesAt)}
            </p>

            <div
              className={
                secondsLeft !== null && secondsLeft <= 60
                  ? "lq-timer danger"
                  : "lq-timer"
              }
            >
              <Timer size={18} />
              Time remaining:{" "}
              {secondsLeft === null
                ? "..."
                : formatSeconds(secondsLeft)}
            </div>

            <form onSubmit={submitQuiz}>
              {playing.questions.map(
                (question, index) => (
                  <fieldset
                    className="lq-question"
                    key={question._id}
                  >
                    <legend>
                      {index + 1}. {question.text}{" "}
                      ({question.points} marks)
                    </legend>

                    {question.options.map(
                      (option, optionIndex) => (
                        <label
                          className="lq-answer"
                          key={optionIndex}
                        >
                          <input
                            type="radio"
                            name={question._id}
                            checked={
                              answers[question._id] ===
                              optionIndex
                            }
                            onChange={() =>
                              saveAnswer(
                                question._id,
                                optionIndex
                              )
                            }
                          />
                          {option}
                        </label>
                      )
                    )}
                  </fieldset>
                )
              )}

              <button
                type="submit"
                className="lq-primary"
                disabled={
                  busy ||
                  savingAnswer ||
                  secondsLeft === 0
                }
              >
                {savingAnswer
                  ? "Saving answer..."
                  : "Submit quiz"}
              </button>
            </form>
          </section>
        )}

        {studentReview && (
          <section className="panel lq-current">
            <div className="lq-section-head">
              <div>
                <h3>
                  Answer review: {studentReview.title}
                </h3>
                <p>
                  Marks: {studentReview.score}/
                  {studentReview.maxScore}
                </p>
              </div>

              <button
                type="button"
                className="lq-secondary"
                onClick={() => setStudentReview(null)}
              >
                Close review
              </button>
            </div>

            {studentReview.feedback && (
              <p>
                Faculty feedback: {studentReview.feedback}
              </p>
            )}

            {studentReview.questions.map(
              (question, index) => (
                <div
                  className="lq-question"
                  key={question.questionId}
                >
                  <strong>
                    {index + 1}. {question.text}
                  </strong>

                  <p>
                    Your answer:{" "}
                    {question.selectedIndex === null
                      ? "Not answered"
                      : question.options[
                          question.selectedIndex
                        ]}
                  </p>

                  <p>
                    Correct answer:{" "}
                    {question.options[question.correctIndex]}
                  </p>

                  <span>
                    {question.isCorrect
                      ? `Correct | ${question.points} marks`
                      : "Incorrect"}
                  </span>
                </div>
              )
            )}
          </section>
        )}

        {faculty && review && (
          <section className="panel lq-current">
            <div className="lq-section-head">
              <h3>
                Attempts | {review.quiz.title}
              </h3>

              <button
                type="button"
                className="lq-secondary"
                onClick={() => setReview(null)}
              >
                Close
              </button>
            </div>

            {review.attempts.length === 0 && (
              <p>No final attempts yet.</p>
            )}

            {review.attempts.map(
              (attempt) => (
                <div
                  className="lq-question"
                  key={attempt._id}
                >
                  <strong>
                    {attempt.student?.name || "Student"}
                  </strong>

                  <small>
                    {attempt.student?.studentId ||
                      attempt.student?.email ||
                      ""}
                  </small>

                  <p>
                    Auto-marked: {attempt.score}/
                    {attempt.maxScore} | {attempt.status}
                  </p>

                  <details>
                    <summary>Review selected answers</summary>

                    {review.quiz.questions.map(
                      (question, index) => {
                        const answer = attempt.answers.find(
                          (item) =>
                            idOf(item.questionId) ===
                            idOf(question._id)
                        );

                        const selected =
                          answer?.selectedIndex;

                        return (
                          <p key={question._id}>
                            {index + 1}. {question.text}
                            <br />
                            Student answer:{" "}
                            {selected === undefined
                              ? "Not answered"
                              : question.options[selected]}
                            <br />
                            Correct answer:{" "}
                            {question.options[
                              question.correctIndex
                            ]}
                            <br />
                            {selected === question.correctIndex
                              ? "Correct"
                              : "Incorrect"}
                          </p>
                        );
                      }
                    )}
                  </details>

                  <label>
                    Faculty feedback
                    <textarea
                      rows="2"
                      maxLength="1000"
                      value={
                        feedback[attempt._id] ??
                        attempt.feedback ??
                        ""
                      }
                      onChange={(event) =>
                        setFeedback({
                          ...feedback,
                          [attempt._id]: event.target.value
                        })
                      }
                    />
                  </label>

                  <button
                    type="button"
                    className="lq-secondary"
                    disabled={busy}
                    onClick={() => saveFeedback(attempt)}
                  >
                    Save feedback
                  </button>
                </div>
              )
            )}
          </section>
        )}
      </div>
    </Layout>
  );
}