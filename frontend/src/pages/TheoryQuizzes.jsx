import React, { useEffect, useRef, useState } from "react";
import { Clock3, FileText, Pencil, Timer, Trash2 } from "lucide-react";
import Layout from "../components/Layout.jsx";
import api from "../api/api";
import "../styles/theory-quizzes.css";

const idOf = (value) => String(value?._id || value || "");

const errorText = (error) =>
  error.response?.data?.message || error.message || "Request failed.";

const newTheoryQuestion = () => ({
  key: `${Date.now()}-${Math.random()}`,
  _id: "",
  promptText: "",
  points: 10,
  promptFile: null,
  referenceFile: null,
  promptFileName: "",
  referenceFileName: ""
});

const emptyTheoryForm = () => ({
  course: "",
  title: "",
  instructions: "",
  closesAt: "",
  durationMinutes: 15,
  questions: [newTheoryQuestion()]
});

function localDateTime(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 16);
}

export default function TheoryQuizzes({ embedded = false }) {
  const user = JSON.parse(localStorage.getItem("user") || "{}");
  const faculty = user.role === "faculty";
  const student = user.role === "student";
  const userId = idOf(user.id || user._id);

  const [courses, setCourses] = useState([]);
  const [theoryItems, setTheoryItems] = useState([]);
  const [theoryForm, setTheoryForm] = useState(emptyTheoryForm);
  const [theoryEditingId, setTheoryEditingId] = useState(null);

  const [theoryActive, setTheoryActive] = useState(null);
  const [theoryAnswers, setTheoryAnswers] = useState({});
  const [theoryTimerEnd, setTheoryTimerEnd] = useState(null);
  const [theorySecondsLeft, setTheorySecondsLeft] = useState(null);

  const [theoryReview, setTheoryReview] = useState(null);
  const [theoryGradeDrafts, setTheoryGradeDrafts] = useState({});

  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState(null);

  const theoryTimeoutLock = useRef(false);

  async function loadPage() {
    const [theoryResponse, courseResponse] = await Promise.all([
      api.get("/theory-quizzes"),
      faculty ? api.get("/courses") : Promise.resolve({ data: [] })
    ]);

    setTheoryItems(Array.isArray(theoryResponse.data) ? theoryResponse.data : []);

    if (faculty) {
      setCourses(
        courseResponse.data.filter((course) => idOf(course.faculty) === userId)
      );
    }
  }

  useEffect(() => {
    loadPage()
      .catch((error) => setNotice({ type: "error", text: errorText(error) }))
      .finally(() => setLoading(false));
  }, []);

  function resetTheoryForm() {
    setTheoryForm(emptyTheoryForm());
    setTheoryEditingId(null);
  }

  function updateTheoryQuestion(index, changes) {
    setTheoryForm((current) => ({
      ...current,
      questions: current.questions.map((question, pos) =>
        pos === index ? { ...question, ...changes } : question
      )
    }));
  }

  async function uploadQuestionFile(quizId, questionId, kind, file) {
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) {
      throw new Error("File must be 10 MB or smaller.");
    }
    const body = new FormData();
    body.append("file", file);
    await api.put(
      `/theory-quizzes/${quizId}/questions/${questionId}/files/${kind}`,
      body
    );
  }

  async function saveTheoryQuiz(event) {
    event.preventDefault();
    let closesAt;
    try {
      closesAt = new Date(theoryForm.closesAt).toISOString();
    } catch {
      setNotice({ type: "error", text: "Choose a valid closing date and time." });
      return;
    }

    const payload = {
      course: theoryForm.course,
      title: theoryForm.title.trim(),
      instructions: theoryForm.instructions.trim(),
      closesAt,
      durationMinutes: Number(theoryForm.durationMinutes),
      questions: theoryForm.questions.map((question) => ({
        ...(question._id ? { _id: question._id } : {}),
        promptText: question.promptText.trim(),
        points: Number(question.points)
      }))
    };

    setBusy(true);
    setNotice(null);

    try {
      const response = theoryEditingId
        ? await api.put(`/theory-quizzes/${theoryEditingId}`, payload)
        : await api.post("/theory-quizzes", payload);

      const quizId = theoryEditingId || response.data.id;
      const questionIds = response.data.questionIds || [];

      for (let i = 0; i < theoryForm.questions.length; i++) {
        const q = theoryForm.questions[i];
        const qId = q._id || questionIds[i];
        if (q.promptFile && qId) {
          await uploadQuestionFile(quizId, qId, "prompt", q.promptFile);
        }
        if (q.referenceFile && qId) {
          await uploadQuestionFile(quizId, qId, "reference", q.referenceFile);
        }
      }

      const wasEditing = Boolean(theoryEditingId);
      resetTheoryForm();
      await loadPage();
      setNotice({
        type: "success",
        text: wasEditing
          ? "Theory assessment updated."
          : "Theory assessment saved as draft."
      });
    } catch (error) {
      setNotice({ type: "error", text: errorText(error) });
    } finally {
      setBusy(false);
    }
  }

  async function editTheoryQuiz(item) {
    setBusy(true);
    setNotice(null);
    try {
      const response = await api.get(`/theory-quizzes/${item._id}`);
      const quiz = response.data;
      setTheoryEditingId(idOf(quiz._id));
      setTheoryForm({
        course: idOf(quiz.course),
        title: quiz.title || "",
        instructions: quiz.instructions || "",
        closesAt: localDateTime(quiz.closesAt),
        durationMinutes: quiz.durationMinutes || 15,
        questions: (quiz.questions || []).map((q) => ({
          key: idOf(q._id),
          _id: idOf(q._id),
          promptText: q.promptText || "",
          points: q.points,
          promptFile: null,
          referenceFile: null,
          promptFileName: q.promptFileName || "",
          referenceFileName: q.referenceFileName || ""
        }))
      });
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (error) {
      setNotice({ type: "error", text: errorText(error) });
    } finally {
      setBusy(false);
    }
  }

  async function publishTheoryQuiz(item) {
    if (!window.confirm(`Publish "${item.title}" to enrolled students?`)) return;
    setBusy(true);
    try {
      const response = await api.post(`/theory-quizzes/${item._id}/publish`);
      await loadPage();
      setNotice({ type: "success", text: response.data.message });
    } catch (error) {
      setNotice({ type: "error", text: errorText(error) });
    } finally {
      setBusy(false);
    }
  }

  async function deleteTheoryQuiz(item) {
    if (!window.confirm(`Delete "${item.title}"?`)) return;
    setBusy(true);
    try {
      const response = await api.delete(`/theory-quizzes/${item._id}`);
      if (theoryEditingId === item._id) resetTheoryForm();
      await loadPage();
      setNotice({ type: "success", text: response.data.message });
    } catch (error) {
      setNotice({ type: "error", text: errorText(error) });
    } finally {
      setBusy(false);
    }
  }

  async function startTheoryAttempt(item) {
    setBusy(true);
    setNotice(null);
    theoryTimeoutLock.current = false;

    try {
      const response = await api.get(`/theory-quizzes/${item._id}/play`);
      const data = response.data;

      if (data.closed) {
        setNotice({ type: "error", text: data.message || "Deadline passed." });
        await loadPage();
        return;
      }

      if (data.attempted || !Array.isArray(data.questions)) {
        setNotice({
          type: "error",
          text: "Attempt is complete. Results show after Faculty publishes."
        });
        await loadPage();
        return;
      }

      const drafts = {};
      for (const q of data.questions) {
        const text = q.answerText || "";
        const fileName = q.answerFileName || "";
        drafts[idOf(q._id)] = {
          text,
          savedText: text,
          file: null,
          fileName,
          removeFile: false,
          saved: Boolean(text.trim() || fileName),
          inputKey: 0
        };
      }

      const remainingMs = Math.max(0, Number(data.secondsLeft || 0) * 1000);
      setTheoryAnswers(drafts);
      setTheoryActive(data);
      setTheoryTimerEnd(Date.now() + remainingMs);
      setTheorySecondsLeft(Math.ceil(remainingMs / 1000));
    } catch (error) {
      setNotice({ type: "error", text: errorText(error) });
    } finally {
      setBusy(false);
    }
  }

  function changeTheoryDraft(questionId, changes) {
    setTheoryAnswers((current) => ({
      ...current,
      [questionId]: {
        ...(current[questionId] || {
          text: "",
          savedText: "",
          file: null,
          fileName: "",
          removeFile: false,
          saved: false,
          inputKey: 0
        }),
        ...changes,
        saved: false
      }
    }));
  }

  async function saveTheoryAnswer(question) {
    if (!theoryActive) return;
    const questionId = idOf(question._id);
    const draft = theoryAnswers[questionId];
    if (!draft) return;

    if (!draft.text.trim() && !draft.file && !draft.fileName && !draft.removeFile) {
      setNotice({
        type: "error",
        text: "Type an answer or select a file before saving."
      });
      return;
    }

    if (draft.file && draft.file.size > 10 * 1024 * 1024) {
      setNotice({ type: "error", text: "Answer file must be 10 MB or smaller." });
      return;
    }

    setBusy(true);
    try {
      const body = new FormData();
      body.append("text", draft.text);
      if (draft.file) body.append("file", draft.file);
      if (draft.removeFile) body.append("removeFile", "true");

      const response = await api.patch(
        `/theory-quizzes/${theoryActive._id}/answers/${questionId}`,
        body
      );

      setTheoryAnswers((current) => ({
        ...current,
        [questionId]: {
          ...current[questionId],
          savedText: current[questionId].text,
          file: null,
          fileName: response.data.answerFileName || "",
          removeFile: false,
          saved: Boolean(
            current[questionId].text.trim() || response.data.answerFileName
          ),
          inputKey: (current[questionId].inputKey || 0) + 1
        }
      }));

      setNotice({ type: "success", text: response.data.message });
    } catch (error) {
      setNotice({ type: "error", text: errorText(error) });
    } finally {
      setBusy(false);
    }
  }

  async function timeoutTheory(quizId) {
    if (theoryTimeoutLock.current) return;
    theoryTimeoutLock.current = true;

    try {
      const response = await api.post(`/theory-quizzes/${quizId}/timeout`);
      setTheoryActive(null);
      setTheoryTimerEnd(null);
      setTheorySecondsLeft(null);
      setTheoryAnswers({});
      await loadPage();
      setNotice({ type: "success", text: response.data.message });
    } catch (error) {
      const remaining = error.response?.data?.secondsLeft;
      if (error.response?.status === 409 && Number(remaining) > 0) {
        theoryTimeoutLock.current = false;
        setTheoryTimerEnd(Date.now() + Number(remaining) * 1000);
        setTheorySecondsLeft(Number(remaining));
        return;
      }
      setTheoryActive(null);
      setTheoryTimerEnd(null);
      setTheorySecondsLeft(null);
      setNotice({ type: "error", text: errorText(error) });
    }
  }

  const activeTheoryId = theoryActive?._id || "";

  useEffect(() => {
    if (!activeTheoryId || theoryTimerEnd === null) return undefined;

    const tick = () => {
      const remaining = Math.max(
        0,
        Math.ceil((theoryTimerEnd - Date.now()) / 1000)
      );
      setTheorySecondsLeft(remaining);
      if (remaining === 0) {
        timeoutTheory(activeTheoryId);
      }
    };

    tick();
    const timer = window.setInterval(tick, 250);
    return () => window.clearInterval(timer);
  }, [activeTheoryId, theoryTimerEnd]);

  async function submitTheoryAttempt(event) {
    event.preventDefault();
    if (!theoryActive) return;

    if (theorySecondsLeft === 0) {
      await timeoutTheory(theoryActive._id);
      return;
    }

    const unanswered = theoryActive.questions.some((question) => {
      const answer = theoryAnswers[idOf(question._id)];
      return !answer?.saved || !(answer.savedText?.trim() || answer.fileName);
    });

    if (unanswered) {
      setNotice({
        type: "error",
        text: "Save a text answer or file for every question before submitting."
      });
      return;
    }

    if (!window.confirm("Submit your Theory answers?")) return;

    setBusy(true);
    try {
      const response = await api.post(
        `/theory-quizzes/${theoryActive._id}/submit`
      );
      setTheoryActive(null);
      setTheoryTimerEnd(null);
      setTheorySecondsLeft(null);
      setTheoryAnswers({});
      await loadPage();
      setNotice({ type: "success", text: response.data.message });
    } catch (error) {
      setNotice({ type: "error", text: errorText(error) });
    } finally {
      setBusy(false);
    }
  }

  async function openFacultyTheoryReview(item) {
    setBusy(true);
    setNotice(null);
    try {
      const response = await api.get(`/theory-quizzes/${item._id}/attempts`);
      setTheoryReview(response.data);

      const drafts = {};
      for (const attempt of response.data.attempts || []) {
        const gradeMap = new Map(
          (attempt.grades || []).map((g) => [idOf(g.questionId), g])
        );
        drafts[idOf(attempt._id)] = Object.fromEntries(
          response.data.quiz.questions.map((question) => {
            const g = gradeMap.get(idOf(question._id));
            return [
              idOf(question._id),
              {
                score: g && Number.isFinite(g.score) ? String(g.score) : "",
                feedback: g?.feedback || ""
              }
            ];
          })
        );
      }
      setTheoryGradeDrafts(drafts);
    } catch (error) {
      setNotice({ type: "error", text: errorText(error) });
    } finally {
      setBusy(false);
    }
  }

  function changeTheoryGrade(attemptId, questionId, field, value) {
    setTheoryGradeDrafts((current) => ({
      ...current,
      [attemptId]: {
        ...(current[attemptId] || {}),
        [questionId]: {
          ...(current[attemptId]?.[questionId] || {}),
          [field]: value
        }
      }
    }));
  }

  async function saveTheoryGrades(attempt) {
    if (!theoryReview) return;
    const attemptId = idOf(attempt._id);
    const current = theoryGradeDrafts[attemptId] || {};

    const grades = theoryReview.quiz.questions.map((question) => {
      const item = current[idOf(question._id)];
      return {
        questionId: idOf(question._id),
        score: item?.score ?? "",
        feedback: item?.feedback || ""
      };
    });

    const invalid = grades.findIndex((grade, idx) => {
      const score = Number(grade.score);
      const max = theoryReview.quiz.questions[idx].points;
      return (
        grade.score === "" ||
        !Number.isFinite(score) ||
        score < 0 ||
        score > max
      );
    });

    if (invalid >= 0) {
      setNotice({
        type: "error",
        text: "Grade every question; enter 0 when an answer is empty."
      });
      return;
    }

    setBusy(true);
    try {
      const response = await api.put(
        `/theory-quizzes/${theoryReview.quiz._id}/attempts/${attemptId}/grades`,
        {
          grades: grades.map((item) => ({
            ...item,
            score: Number(item.score)
          }))
        }
      );
      await openFacultyTheoryReview({ _id: theoryReview.quiz._id });
      await loadPage();
      setNotice({ type: "success", text: response.data.message });
    } catch (error) {
      setNotice({ type: "error", text: errorText(error) });
    } finally {
      setBusy(false);
    }
  }

  async function publishTheoryResults(item) {
    if (!window.confirm("Publish Theory marks and feedback to students?")) return;
    setBusy(true);
    try {
      const response = await api.post(`/theory-quizzes/${item._id}/results`);
      await loadPage();
      setNotice({ type: "success", text: response.data.message });
    } catch (error) {
      setNotice({ type: "error", text: errorText(error) });
    } finally {
      setBusy(false);
    }
  }

  async function downloadTheoryFile(url, filename) {
    try {
      const response = await api.get(url, { responseType: "blob" });
      const objectUrl = URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement("a");
      link.href = objectUrl;
      link.download = filename || "theory-file";
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(objectUrl), 60000);
    } catch (error) {
      setNotice({ type: "error", text: errorText(error) });
    }
  }

  const content = (
      <div className="theory-page">
        <section className="panel theory-hero">
          <div>
            <span className="theory-eyebrow">WRITTEN ASSESSMENTS</span>
            <h2>{faculty ? "Theory assessments" : "Your Theory assessments"}</h2>
            <p>
              {faculty
                ? "Create written questions, optionally attach prompt or reference files, and grade student responses."
                : "Write your response, attach a file, or submit both before the timer expires."}
            </p>
          </div>
          <FileText size={30} />
        </section>

        {notice && (
          <div className={`theory-message ${notice.type}`} role="alert">
            {notice.text}
          </div>
        )}

        {loading && <section className="panel">Loading Theory assessments...</section>}

        {faculty && !loading && (
          <section className="panel">
            <div className="theory-heading">
              <div>
                <span className="theory-eyebrow">FACULTY WORKSPACE</span>
                <h3>
                  {theoryEditingId
                    ? "Edit Theory assessment"
                    : "Create Theory assessment"}
                </h3>
              </div>
              {theoryEditingId && (
                <button
                  type="button"
                  className="theory-secondary"
                  onClick={resetTheoryForm}
                >
                  Cancel edit
                </button>
              )}
            </div>

            {courses.length === 0 ? (
              <p>Create a course before adding a Theory assessment.</p>
            ) : (
              <form className="theory-form" onSubmit={saveTheoryQuiz}>
                <div className="theory-two">
                  <label>
                    Course
                    <select
                      value={theoryForm.course}
                      disabled={Boolean(theoryEditingId)}
                      onChange={(event) =>
                        setTheoryForm({ ...theoryForm, course: event.target.value })
                      }
                      required
                    >
                      <option value="">Select course</option>
                      {courses.map((course) => (
                        <option key={course._id} value={course._id}>
                          {course.code} - {course.title}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label>
                    Assessment title
                    <input
                      value={theoryForm.title}
                      maxLength="120"
                      onChange={(event) =>
                        setTheoryForm({ ...theoryForm, title: event.target.value })
                      }
                      required
                    />
                  </label>
                </div>

                <div className="theory-two">
                  <label>
                    Closing date and time
                    <input
                      type="datetime-local"
                      value={theoryForm.closesAt}
                      onChange={(event) =>
                        setTheoryForm({ ...theoryForm, closesAt: event.target.value })
                      }
                      required
                    />
                  </label>

                  <label>
                    Time limit in minutes
                    <input
                      type="number"
                      min="1"
                      max="600"
                      value={theoryForm.durationMinutes}
                      onChange={(event) =>
                        setTheoryForm({
                          ...theoryForm,
                          durationMinutes: event.target.value
                        })
                      }
                      required
                    />
                  </label>
                </div>

                <label>
                  Instructions | optional
                  <textarea
                    rows="2"
                    maxLength="1000"
                    value={theoryForm.instructions}
                    onChange={(event) =>
                      setTheoryForm({
                        ...theoryForm,
                        instructions: event.target.value
                      })
                    }
                  />
                </label>

                {theoryForm.questions.map((question, index) => (
                  <section className="theory-question-editor" key={question.key}>
                    <div className="theory-heading">
                      <strong>Theory question {index + 1}</strong>
                      {theoryForm.questions.length > 1 && (
                        <button
                          type="button"
                          className="theory-danger"
                          onClick={() =>
                            setTheoryForm({
                              ...theoryForm,
                              questions: theoryForm.questions.filter(
                                (_, pos) => pos !== index
                              )
                            })
                          }
                        >
                          Remove
                        </button>
                      )}
                    </div>

                    <label>
                      Question text | optional if prompt file is attached
                      <textarea
                        rows="4"
                        maxLength="2000"
                        value={question.promptText}
                        onChange={(event) =>
                          updateTheoryQuestion(index, {
                            promptText: event.target.value
                          })
                        }
                        placeholder="Type the Theory question here"
                      />
                    </label>

                    <div className="theory-two">
                      <label>
                        Marks
                        <input
                          type="number"
                          min="1"
                          max="100"
                          value={question.points}
                          onChange={(event) =>
                            updateTheoryQuestion(index, {
                              points: Number(event.target.value)
                            })
                          }
                          required
                        />
                      </label>

                      <label>
                        Prompt attachment | optional
                        <input
                          type="file"
                          accept=".pdf,.docx,.pptx,.jpg,.jpeg,.png"
                          onChange={(event) =>
                            updateTheoryQuestion(index, {
                              promptFile: event.target.files?.[0] || null
                            })
                          }
                        />
                        {question.promptFileName && (
                          <small>Existing: {question.promptFileName}</small>
                        )}
                        {question.promptFile && (
                          <small>Selected: {question.promptFile.name}</small>
                        )}
                      </label>
                    </div>

                    <label>
                      Reference/model answer file | Faculty only | optional
                      <input
                        type="file"
                        accept=".pdf,.docx,.pptx,.jpg,.jpeg,.png"
                        onChange={(event) =>
                          updateTheoryQuestion(index, {
                            referenceFile: event.target.files?.[0] || null
                          })
                        }
                      />
                      {question.referenceFileName && (
                        <small>Existing: {question.referenceFileName}</small>
                      )}
                      {question.referenceFile && (
                        <small>Selected: {question.referenceFile.name}</small>
                      )}
                    </label>
                  </section>
                ))}

                <div className="theory-actions">
                  <button
                    type="button"
                    className="theory-secondary"
                    disabled={theoryForm.questions.length >= 10}
                    onClick={() =>
                      setTheoryForm({
                        ...theoryForm,
                        questions: [...theoryForm.questions, newTheoryQuestion()]
                      })
                    }
                  >
                    + Add Theory question
                  </button>

                  <button type="submit" className="theory-primary" disabled={busy}>
                    {busy
                      ? "Saving..."
                      : theoryEditingId
                      ? "Save changes"
                      : "Save as draft"}
                  </button>
                </div>
              </form>
            )}
          </section>
        )}

        {!loading && (
          <section className="panel">
            <div className="theory-heading">
              <h3>
                {faculty
                  ? "Your Theory assessments"
                  : "Available Theory assessments"}
              </h3>
              <span>{theoryItems.length}</span>
            </div>

            {theoryItems.length === 0 && (
              <p>
                {student
                  ? "No published Theory assessment is available in your enrolled courses."
                  : "No Theory assessment has been created."}
              </p>
            )}

            <div className="theory-grid">
              {theoryItems.map((item) => {
                const closed =
                  item.closed ||
                  new Date(item.closesAt).getTime() <= Date.now();

                return (
                  <article className="theory-card" key={item._id}>
                    <span className="theory-tag">
                      {item.course?.code || "COURSE"}
                    </span>
                    <h4>{item.title}</h4>
                    {item.instructions && <p>{item.instructions}</p>}
                    <small>
                      <Clock3 size={14} /> Deadline:{" "}
                      {new Date(item.closesAt).toLocaleString()}
                    </small>
                    <small>
                      <Timer size={14} /> Time allowed: {item.durationMinutes}{" "}
                      minutes | {item.questionCount} questions | {item.maxScore}{" "}
                      marks
                    </small>

                    {faculty ? (
                      <>
                        <small>
                          {item.attemptCount || 0} final attempts |{" "}
                          {item.isPublished ? "Published" : "Draft"}
                        </small>
                        <div className="theory-actions">
                          <button
                            type="button"
                            className="theory-secondary"
                            onClick={() => editTheoryQuiz(item)}
                            disabled={busy || item.attemptCount > 0}
                          >
                            <Pencil size={14} /> Edit
                          </button>

                          <button
                            type="button"
                            className="theory-secondary"
                            onClick={() => openFacultyTheoryReview(item)}
                            disabled={busy}
                          >
                            Review & grade
                          </button>

                          {item.attemptCount > 0 && !item.resultsPublished && (
                            <button
                              type="button"
                              className="theory-primary"
                              onClick={() => publishTheoryResults(item)}
                              disabled={busy}
                            >
                              Publish results
                            </button>
                          )}

                          {!item.isPublished && (
                            <button
                              type="button"
                              className="theory-primary"
                              onClick={() => publishTheoryQuiz(item)}
                              disabled={busy || closed}
                            >
                              Publish assessment
                            </button>
                          )}

                          <button
                            type="button"
                            className="theory-danger"
                            onClick={() => deleteTheoryQuiz(item)}
                            disabled={busy || item.attemptCount > 0}
                          >
                            <Trash2 size={14} /> Delete
                          </button>
                        </div>
                      </>
                    ) : (
                      <div className="theory-actions">
                        {item.attempted ? (
                          item.result ? (
                            <div className="theory-published-result">
                              <strong>
                                Result: {item.result.score}/{item.result.maxScore}
                              </strong>
                              {item.result.questions?.map((question) => (
                                <p key={question.questionNumber}>
                                  Question {question.questionNumber}:{" "}
                                  {question.score}/{question.points}
                                  {question.feedback
                                    ? ` | ${question.feedback}`
                                    : ""}
                                </p>
                              ))}
                            </div>
                          ) : (
                            <span>
                              Submitted | result pending Faculty publication
                            </span>
                          )
                        ) : (
                          <button
                            type="button"
                            className="theory-primary"
                            onClick={() => startTheoryAttempt(item)}
                            disabled={busy || closed}
                          >
                            {closed
                              ? "Deadline passed"
                              : item.inProgress
                              ? "Resume assessment"
                              : "Start assessment"}
                          </button>
                        )}
                      </div>
                    )}
                  </article>
                );
              })}
            </div>
          </section>
        )}

        {student && theoryActive && (
          <section className="panel theory-active">
            <div className="theory-heading">
              <div>
                <span className="theory-eyebrow">THEORY ASSESSMENT</span>
                <h3>{theoryActive.title}</h3>
              </div>

              <span
                className={
                  theorySecondsLeft !== null && theorySecondsLeft <= 60
                    ? "theory-timer danger"
                    : "theory-timer"
                }
              >
                Time left:{" "}
                {theorySecondsLeft === null
                  ? "..."
                  : `${Math.floor(theorySecondsLeft / 60)}:${String(
                      theorySecondsLeft % 60
                    ).padStart(2, "0")}`}
              </span>
            </div>

            <p className="theory-help">
              Type your response, attach a file, or do both. Press Save answer
              for each question before submitting. Saved answers auto-submit if
              the timer reaches zero.
            </p>

            <form onSubmit={submitTheoryAttempt}>
              {theoryActive.questions.map((question, index) => {
                const questionId = idOf(question._id);
                const answer = theoryAnswers[questionId] || {
                  text: "",
                  file: null,
                  fileName: "",
                  removeFile: false,
                  saved: false,
                  inputKey: 0
                };

                return (
                  <article className="theory-question-editor" key={questionId}>
                    <h4>
                      Question {index + 1} | {question.points} marks
                    </h4>

                    {question.promptText && (
                      <p className="theory-prompt">{question.promptText}</p>
                    )}

                    {question.promptFileName && (
                      <button
                        type="button"
                        className="theory-secondary"
                        onClick={() =>
                          downloadTheoryFile(
                            `/theory-quizzes/${theoryActive._id}/questions/${questionId}/files/prompt`,
                            question.promptFileName
                          )
                        }
                      >
                        Download question file: {question.promptFileName}
                      </button>
                    )}

                    <label>
                      Your written answer | optional if you attach a file
                      <textarea
                        rows="5"
                        maxLength="10000"
                        value={answer.text}
                        onChange={(event) =>
                          changeTheoryDraft(questionId, {
                            text: event.target.value
                          })
                        }
                        placeholder="Write your answer here..."
                      />
                    </label>

                    <label>
                      Attach answer file | optional
                      <input
                        key={answer.inputKey}
                        type="file"
                        accept=".pdf,.docx,.pptx,.jpg,.jpeg,.png"
                        onChange={(event) =>
                          changeTheoryDraft(questionId, {
                            file: event.target.files?.[0] || null
                          })
                        }
                      />
                      <small>PDF, DOCX, PPTX, JPG, PNG | maximum 10 MB</small>
                    </label>

                    {answer.file && (
                      <small>Selected file: {answer.file.name}</small>
                    )}

                    {answer.fileName && !answer.removeFile && (
                      <div className="theory-file-row">
                        <span>Saved file: {answer.fileName}</span>
                        <button
                          type="button"
                          className="theory-danger"
                          onClick={() =>
                            changeTheoryDraft(questionId, {
                              fileName: "",
                              removeFile: true,
                              inputKey: answer.inputKey + 1
                            })
                          }
                        >
                          Remove saved file
                        </button>
                      </div>
                    )}

                    <div className="theory-actions">
                      <button
                        type="button"
                        className="theory-primary"
                        disabled={busy}
                        onClick={() => saveTheoryAnswer(question)}
                      >
                        {answer.saved ? "Save changes" : "Save answer"}
                      </button>
                      <span>{answer.saved ? "Saved" : "Unsaved changes"}</span>
                    </div>
                  </article>
                );
              })}

              <button type="submit" className="theory-primary" disabled={busy}>
                Submit Theory assessment
              </button>
            </form>
          </section>
        )}

        {faculty && theoryReview && (
          <section className="panel theory-active">
            <div className="theory-heading">
              <div>
                <span className="theory-eyebrow">FACULTY GRADING</span>
                <h3>Student answers - {theoryReview.quiz.title}</h3>
              </div>

              <button
                type="button"
                className="theory-secondary"
                onClick={() => setTheoryReview(null)}
              >
                Close
              </button>
            </div>

            {theoryReview.attempts.length === 0 && (
              <p>No submitted Theory answers yet.</p>
            )}

            {theoryReview.attempts.map((attempt) => {
              const attemptId = idOf(attempt._id);
              const grades = theoryGradeDrafts[attemptId] || {};
              const answerMap = new Map(
                attempt.answers.map((a) => [idOf(a.questionId), a])
              );

              return (
                <article className="theory-question-editor" key={attemptId}>
                  <div className="theory-heading">
                    <div>
                      <strong>{attempt.student?.name || "Student"}</strong>
                      <small>
                        {attempt.student?.studentId ||
                          attempt.student?.email ||
                          ""}
                      </small>
                    </div>
                    <span>
                      {attempt.status} | {attempt.score}/{attempt.maxScore}
                    </span>
                  </div>

                  {theoryReview.quiz.questions.map((question, index) => {
                    const questionId = idOf(question._id);
                    const answer = answerMap.get(questionId);
                    const grade = grades[questionId] || {
                      score: "",
                      feedback: ""
                    };

                    return (
                      <div className="theory-grade-question" key={questionId}>
                        <h4>
                          Question {index + 1} | maximum {question.points} marks
                        </h4>

                        {question.promptText && <p>{question.promptText}</p>}

                        <div className="theory-actions">
                          {question.promptFileName && (
                            <button
                              type="button"
                              className="theory-secondary"
                              onClick={() =>
                                downloadTheoryFile(
                                  `/theory-quizzes/${theoryReview.quiz._id}/questions/${questionId}/files/prompt`,
                                  question.promptFileName
                                )
                              }
                            >
                              Download prompt: {question.promptFileName}
                            </button>
                          )}

                          {question.referenceFileName && (
                            <button
                              type="button"
                              className="theory-secondary"
                              onClick={() =>
                                downloadTheoryFile(
                                  `/theory-quizzes/${theoryReview.quiz._id}/questions/${questionId}/files/reference`,
                                  question.referenceFileName
                                )
                              }
                            >
                              Download reference answer
                            </button>
                          )}
                        </div>

                        {answer?.text && (
                          <div className="theory-answer-text">
                            <strong>Student text answer</strong>
                            <p>{answer.text}</p>
                          </div>
                        )}

                        {answer?.fileName && (
                          <div className="theory-actions">
                            <button
                              type="button"
                              className="theory-secondary"
                              onClick={() =>
                                downloadTheoryFile(
                                  `/theory-quizzes/${theoryReview.quiz._id}/attempts/${attemptId}/answers/${questionId}/file`,
                                  answer.fileName
                                )
                              }
                            >
                              Download student file: {answer.fileName}
                            </button>
                          </div>
                        )}

                        {!answer?.text && !answer?.fileName && (
                          <p>No answer submitted for this question.</p>
                        )}

                        <div className="theory-two">
                          <label>
                            Marks | 0 to {question.points}
                            <input
                              type="number"
                              min="0"
                              max={question.points}
                              value={grade.score}
                              onChange={(event) =>
                                changeTheoryGrade(
                                  attemptId,
                                  questionId,
                                  "score",
                                  event.target.value
                                )
                              }
                              required
                            />
                          </label>

                          <label>
                            Feedback | optional
                            <textarea
                              rows="2"
                              maxLength="1000"
                              value={grade.feedback}
                              onChange={(event) =>
                                changeTheoryGrade(
                                  attemptId,
                                  questionId,
                                  "feedback",
                                  event.target.value
                                )
                              }
                            />
                          </label>
                        </div>
                      </div>
                    );
                  })}

                  <button
                    type="button"
                    className="theory-primary"
                    disabled={busy}
                    onClick={() => saveTheoryGrades(attempt)}
                  >
                    Save marks & feedback
                  </button>
                </article>
              );
            })}
          </section>
        )}
      </div>
    );
  return embedded ? content : <Layout title="Theory Assessments">{content}</Layout>;
}
