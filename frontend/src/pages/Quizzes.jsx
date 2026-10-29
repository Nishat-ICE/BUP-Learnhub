import React, { useEffect, useState } from "react";
import {
  Award,
  BookOpen,
  CheckCircle2,
  Clock3,
  ListChecks,
  Pencil,
  Trash2
} from "lucide-react";

import Layout from "../components/Layout.jsx";
import api from "../api/api";
import "../styles/quizzes.css";

const idOf = (value) =>
  String(value?._id || value || "");

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
  questions: [newQuestion()]
});

const showDate = (value) =>
  value ? new Date(value).toLocaleString() : "Not set";

const errorText = (error) =>
  error.response?.data?.message ||
  error.message ||
  "Request failed.";

function dateForInput(value) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) return "";

  const local = new Date(
    date.getTime() -
      date.getTimezoneOffset() * 60000
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
  const reportRole = ["staff", "admin", "authority"].includes(role);

  const [courses, setCourses] = useState([]);
  const [quizzes, setQuizzes] = useState([]);
  const [report, setReport] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [editingId, setEditingId] = useState(null);
  const [playing, setPlaying] = useState(null);
  const [answers, setAnswers] = useState({});
  const [review, setReview] = useState(null);
  const [feedback, setFeedback] = useState({});
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState(null);

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
      const myId = idOf(user.id || user._id);

      setCourses(
        courseResponse.data.filter(
          (course) =>
            idOf(course.faculty) === myId
        )
      );
    }
  }

  useEffect(() => {
    load()
      .catch((error) =>
        setNotice({
          type: "error",
          text: errorText(error)
        })
      )
      .finally(() => setLoading(false));
  }, []);

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

    const payload = {
      ...form,
      closesAt: new Date(form.closesAt).toISOString(),
      questions: form.questions.map((question) => ({
        text: question.text,
        options: question.options,
        correctIndex: Number(question.correctIndex),
        points: Number(question.points)
      }))
    };

    const done = await run(
      () =>
        editingId
          ? api.put(`/quizzes/${editingId}`, payload)
          : api.post("/quizzes", payload)
    );

    if (done) resetForm();
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

    try {
      const response = await api.get(
        `/quizzes/${item._id}/play`
      );

      setPlaying(response.data);
      setAnswers({});
    } catch (error) {
      setNotice({
        type: "error",
        text: errorText(error)
      });
    } finally {
      setBusy(false);
    }
  }

  async function submitQuiz(event) {
    event.preventDefault();

    if (!playing) return;

    const selected = playing.questions.map(
      (question) => ({
        questionId: question._id,
        selectedIndex: answers[question._id]
      })
    );

    if (
      selected.some(
        (answer) =>
          answer.selectedIndex === undefined
      )
    ) {
      setNotice({
        type: "error",
        text: "Answer every question first."
      });
      return;
    }

    if (
      !window.confirm(
        "Submit the quiz? You can attempt it only once."
      )
    ) return;

    const done = await run(() =>
      api.post(`/quizzes/${playing._id}/submit`, {
        answers: selected
      })
    );

    if (done) {
      setPlaying(null);
      setAnswers({});
    }
  }

  async function openReview(item) {
    setBusy(true);

    try {
      const [quizResponse, attemptResponse] =
        await Promise.all([
          api.get(`/quizzes/${item._id}`),
          api.get(
            `/quizzes/${item._id}/attempts`
          )
        ]);

      setReview({
        quiz: quizResponse.data,
        attempts: attemptResponse.data
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

    const done = await run(() =>
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

    if (done) {
      await openReview({
        _id: review.quiz._id
      });
    }
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
                ? "See how many enrolled students submitted each published quiz."
                : reportRole
                ? "View aggregate quiz activity."
                : faculty
                ? "Create MCQs, review submissions and publish results."
                : "Attempt enrolled-course quizzes and view published results."}
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
          <div className="panel">
            Loading quizzes...
          </div>
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
                <span>Submissions</span>
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
                        {!staff && (
                          <th>Average marks</th>
                        )}
                      </tr>
                    </thead>

                    <tbody>
                      {report.rows.map((row) => (
                        <tr key={row.id}>
                          <td>
                            <strong>
                              {row.courseCode} Â· {row.title}
                            </strong>
                            <small>
                              {row.courseTitle}
                            </small>
                          </td>

                          <td>{row.enrolled}</td>
                          <td>{row.submitted}</td>
                          <td>{row.notSubmitted}</td>

                          <td>
                            {row.participationPercent === null
                              ? "â€”"
                              : `${row.participationPercent}%`}
                          </td>

                          {!staff && (
                            <td>
                              {row.averagePercent === null
                                ? "Not published"
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
                Create your course first to add
                a quiz.
              </p>
            ) : (
              <form
                className="lq-form"
                onSubmit={save}
              >
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
                      <option value="">
                        Select course
                      </option>

                      {courses.map((course) => (
                        <option
                          key={course._id}
                          value={course._id}
                        >
                          {course.code} â€” {course.title}
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
                    Closing date and time
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
                </div>

                {form.questions.map(
                  (question, index) => (
                    <div
                      className="lq-question"
                      key={question.key}
                    >
                      <div className="lq-section-head">
                        <strong>
                          Question {index + 1}
                        </strong>

                        {form.questions.length > 1 && (
                          <button
                            type="button"
                            className="lq-danger"
                            onClick={() =>
                              setForm({
                                ...form,
                                questions:
                                  form.questions.filter(
                                    (_, position) =>
                                      position !== index
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
                                  const next = [
                                    ...question.options
                                  ];

                                  next[optionIndex] =
                                    event.target.value;

                                  updateQuestion(index, {
                                    options: next
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
                            {[0, 1, 2, 3].map(
                              (number) => (
                                <option
                                  key={number}
                                  value={number}
                                >
                                  Option {number + 1}
                                </option>
                              )
                            )}
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
                  )
                )}

                <div className="lq-actions">
                  <button
                    type="button"
                    className="lq-secondary"
                    disabled={
                      form.questions.length >= 20
                    }
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
                {faculty
                  ? "Your quizzes"
                  : "Available quizzes"}
              </h3>

              <span>{quizzes.length}</span>
            </div>

            {quizzes.length === 0 && (
              <div className="panel">
                {student
                  ? "No published quiz in your enrolled courses yet."
                  : "No quizzes created yet."}
              </div>
            )}

            <div className="lq-grid">
              {quizzes.map((quiz) => {
                const expired =
                  new Date(
                    quiz.closesAt
                  ).getTime() <= Date.now();

                return (
                  <article
                    className="lq-card"
                    key={quiz._id}
                  >
                    <span className="lq-pill">
                      {quiz.course?.code ||
                        "COURSE"}
                    </span>

                    <h3>{quiz.title}</h3>

                    {quiz.instructions && (
                      <p>{quiz.instructions}</p>
                    )}

                    <small>
                      <Clock3 size={15} />
                      Closes {showDate(
                        quiz.closesAt
                      )}
                    </small>

                    <small>
                      <BookOpen size={15} />
                      {quiz.questionCount} questions Â·{" "}
                      {quiz.maxScore} marks
                    </small>

                    {faculty ? (
                      <>
                        <small>
                          {quiz.attemptCount} attempts Â·{" "}
                          {quiz.isPublished
                            ? "Published"
                            : "Draft"}
                        </small>

                        <div className="lq-actions">
                          {!quiz.isPublished && (
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
                              Publish
                            </button>
                          )}

                          <button
                            type="button"
                            className="lq-secondary"
                            onClick={() =>
                              openReview(quiz)
                            }
                          >
                            Review
                          </button>

                          {quiz.attemptCount > 0 &&
                            !quiz.resultsPublished && (
                              <button
                                type="button"
                                className="lq-primary"
                                disabled={busy}
                                onClick={() =>
                                  run(() =>
                                    api.post(
                                      `/quizzes/${quiz._id}/results`
                                    )
                                  )
                                }
                              >
                                Publish results
                              </button>
                            )}

                          <button
                            type="button"
                            className="lq-secondary"
                            disabled={
                              busy ||
                              quiz.attemptCount > 0
                            }
                            onClick={() =>
                              edit(quiz)
                            }
                          >
                            <Pencil size={15} />
                            Edit
                          </button>

                          <button
                            type="button"
                            className="lq-danger"
                            disabled={
                              busy ||
                              quiz.attemptCount > 0
                            }
                            onClick={() => {
                              if (
                                window.confirm(
                                  `Delete "${quiz.title}"?`
                                )
                              ) {
                                run(() =>
                                  api.delete(
                                    `/quizzes/${quiz._id}`
                                  )
                                );
                              }
                            }}
                          >
                            <Trash2 size={15} />
                            Delete
                          </button>
                        </div>
                      </>
                    ) : (
                      <div className="lq-actions">
                        {quiz.attempted ? (
                          quiz.result ? (
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
                              Submitted Â· Result
                              pending
                            </span>
                          )
                        ) : (
                          <button
                            type="button"
                            className="lq-primary"
                            disabled={
                              busy || expired
                            }
                            onClick={() =>
                              openQuiz(quiz)
                            }
                          >
                            {expired
                              ? "Closed"
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
                onClick={() =>
                  setPlaying(null)
                }
              >
                Close
              </button>
            </div>

            <p>
              One attempt only. Closes{" "}
              {showDate(playing.closesAt)}.
            </p>

            <form onSubmit={submitQuiz}>
              {playing.questions.map(
                (question, index) => (
                  <fieldset
                    className="lq-question"
                    key={question._id}
                  >
                    <legend>
                      {index + 1}.{" "}
                      {question.text} (
                      {question.points} marks)
                    </legend>

                    {question.options.map(
                      (option, optionIndex) => (
                        <label
                          className="lq-answer"
                          key={optionIndex}
                        >
                          <input
                            type="radio"
                            name={
                              question._id
                            }
                            checked={
                              answers[
                                question._id
                              ] === optionIndex
                            }
                            onChange={() =>
                              setAnswers({
                                ...answers,
                                [question._id]:
                                  optionIndex
                              })
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
                disabled={busy}
              >
                Submit quiz
              </button>
            </form>
          </section>
        )}

        {faculty && review && (
          <section className="panel lq-current">
            <div className="lq-section-head">
              <h3>
                Attempts Â·{" "}
                {review.quiz.title}
              </h3>

              <button
                type="button"
                className="lq-secondary"
                onClick={() =>
                  setReview(null)
                }
              >
                Close
              </button>
            </div>

            {review.attempts.length === 0 && (
              <p>
                No student has submitted yet.
              </p>
            )}

            {review.attempts.map(
              (attempt) => (
                <div
                  className="lq-question"
                  key={attempt._id}
                >
                  <strong>
                    {attempt.student?.name ||
                      "Student"}
                  </strong>

                  <small>
                    {attempt.student?.studentId ||
                      attempt.student?.email ||
                      ""}
                  </small>

                  <p>
                    Auto-marked:{" "}
                    {attempt.score}/
                    {attempt.maxScore}
                  </p>

                  <details>
                    <summary>
                      Review selected answers
                    </summary>

                    {review.quiz.questions.map(
                      (question, index) => {
                        const answer =
                          attempt.answers.find(
                            (item) =>
                              idOf(
                                item.questionId
                              ) ===
                              idOf(
                                question._id
                              )
                          );

                        return (
                          <p
                            key={
                              question._id
                            }
                          >
                            {index + 1}.{" "}
                            {question.text}
                            <br />
                            Selected:{" "}
                            {question.options[
                              answer?.selectedIndex
                            ] || "â€”"}
                            <br />
                            Correct:{" "}
                            {question.options[
                              question.correctIndex
                            ]}
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
                        feedback[
                          attempt._id
                        ] ??
                        attempt.feedback ??
                        ""
                      }
                      onChange={(
                        event
                      ) =>
                        setFeedback({
                          ...feedback,
                          [attempt._id]:
                            event.target.value
                        })
                      }
                    />
                  </label>

                  <button
                    type="button"
                    className="lq-secondary"
                    disabled={busy}
                    onClick={() =>
                      saveFeedback(
                        attempt
                      )
                    }
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