const express = require("express");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const mongoose = require("mongoose");
const multer = require("multer");

const Course = require("../models/Course");
const TheoryQuiz = require("../models/TheoryQuiz");
const TheoryAttempt = require("../models/TheoryAttempt");

const {
  protect,
  authorize
} = require("../middleware/authMiddleware");

const {
  idOf,
  hasAnswer,
  validateTheoryQuiz,
  fileMime,
  safeStoredName,
  safeOriginalName,
  validSignature
} = require("../services/theoryRules");

const {
  finalizeExpiredTheoryAttempt,
  finalizeExpiredTheoryAttempts
} = require("../services/theoryAutoSubmit");

const router = express.Router();
router.use(protect);

const uploadDir = path.join(
  __dirname,
  "..",
  "private_uploads",
  "theory-quizzes"
);

fs.mkdirSync(uploadDir, { recursive: true });

const upload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, callback) =>
      callback(null, uploadDir),

    filename: (_req, file, callback) => {
      const extension =
        path.extname(file.originalname).toLowerCase();

      callback(
        null,
        `${crypto.randomUUID()}${extension}`
      );
    }
  }),

  fileFilter: (_req, file, callback) => {
    if (!fileMime(file.originalname)) {
      return callback(
        new Error(
          "Allowed files: PDF, DOCX, PPTX, JPG and PNG."
        )
      );
    }

    callback(null, true);
  },

  limits: {
    fileSize: 10 * 1024 * 1024,
    files: 1,
    fields: 4,
    parts: 5,
    fieldSize: 12000
  }
}).single("file");

function receiveFile(req, res, next) {
  upload(req, res, (error) => {
    if (!error) return next();

    return res.status(
      error.code === "LIMIT_FILE_SIZE" ? 413 : 400
    ).json({
      message:
        error.code === "LIMIT_FILE_SIZE"
          ? "File must be 10 MB or smaller."
          : error.message
    });
  });
}

async function removeTemp(file) {
  if (file?.path) {
    await fs.promises.unlink(file.path).catch(() => {});
  }
}

async function validUpload(file) {
  const bytes = await fs.promises.readFile(file.path);
  return validSignature(file.originalname, bytes);
}

function fileInfo(file) {
  return {
    storedName: file.filename,
    originalName: safeOriginalName(file.originalname),
    mimeType: fileMime(file.originalname),
    size: file.size
  };
}

function isFinal(attempt) {
  return Boolean(
    attempt &&
    ["submitted", "expired"].includes(attempt.status)
  );
}

const totalMarks = (quiz) => sumPoints(quiz);
function sumPoints(quiz) {
  return quiz.questions.reduce(
    (sum, question) => sum + question.points,
    0
  );
}

function makeResult(quiz, attempt) {
  if (!quiz.resultsPublished || !isFinal(attempt)) {
    return null;
  }

  const gradeMap = new Map(
    (attempt.grades || []).map((grade) => [
      idOf(grade.questionId),
      grade
    ])
  );

  return {
    score: attempt.score,
    maxScore: sumPoints(quiz),
    feedback: attempt.overallFeedback || "",
    questions: quiz.questions.map((question, index) => {
      const grade = gradeMap.get(idOf(question._id));

      return {
        questionNumber: index + 1,
        points: question.points,
        score: grade?.score ?? 0,
        feedback: grade?.feedback || ""
      };
    })
  };
}

function metadata(quiz, facultyView) {
  return {
    _id: quiz._id,
    course: quiz.course,
    title: quiz.title,
    instructions: quiz.instructions || "",
    closesAt: quiz.closesAt,
    durationMinutes: quiz.durationMinutes,
    isPublished: quiz.isPublished,
    resultsPublished: quiz.resultsPublished,
    questionCount: quiz.questions.length,
    maxScore: sumPoints(quiz),
    questions: quiz.questions.map((question) => ({
      _id: question._id,
      promptText: question.promptText || "",
      points: question.points,
      promptFileName:
        question.promptAttachment?.originalName || "",
      // Only Faculty receives reference answer metadata.
      referenceFileName: facultyView
        ? question.referenceAttachment?.originalName || ""
        : undefined
    }))
  };
}

const facultyQuiz = (req, res) => getFacultyQuiz(req, res);
async function getFacultyQuiz(req, res) {
  if (!mongoose.isValidObjectId(req.params.id)) {
    res.status(400).json({ message: "Invalid Theory quiz ID." });
    return null;
  }

  const quiz = await TheoryQuiz.findById(req.params.id);

  if (!quiz) {
    res.status(404).json({ message: "Theory quiz not found." });
    return null;
  }

  const owned = await Course.exists({
    _id: quiz.course,
    faculty: req.user._id
  });

  if (!owned) {
    res.status(403).json({
      message: "Only the course Faculty can manage this assessment."
    });
    return null;
  }

  return quiz;
}

const studentQuiz = (req, res) => getStudentQuiz(req, res);
async function getStudentQuiz(req, res) {
  if (!mongoose.isValidObjectId(req.params.id)) {
    res.status(400).json({ message: "Invalid Theory quiz ID." });
    return null;
  }

  const quiz = await TheoryQuiz.findOne({
    _id: req.params.id,
    isPublished: true
  });

  if (!quiz) {
    res.status(404).json({
      message: "Published Theory assessment not found."
    });
    return null;
  }

  const enrolled = await Course.exists({
    _id: quiz.course,
    students: req.user._id
  });

  if (!enrolled) {
    res.status(403).json({
      message: "Enroll in the course before opening the assessment."
    });
    return null;
  }

  return quiz;
}

async function findAttempt(quizId, studentId) {
  return TheoryAttempt.findOne({
    theoryQuiz: quizId,
    student: studentId
  });
}

function handleError(res, error) {
  if (
    error.name === "ValidationError" ||
    error.name === "CastError"
  ) {
    return res.status(400).json({ message: error.message });
  }

  console.error("Theory quiz API error:", error);

  return res.status(500).json({
    message: "Theory assessment request failed."
  });
}

// Student sees only published results/marks; no Theory answer review.
router.get(
  "/",
  authorize("student", "faculty"),
  async (req, res) => {
    try {
      await finalizeExpiredTheoryAttempts();

      const student = req.user.role === "student";

      const courseIds = await Course.distinct(
        "_id",
        student
          ? { students: req.user._id }
          : { faculty: req.user._id }
      );

      const quizzes = await TheoryQuiz.find({
        course: { $in: courseIds },
        ...(student ? { isPublished: true } : {})
      })
        .populate("course", "code title")
        .sort({ createdAt: -1 })
        .lean();

      const ids = quizzes.map((quiz) => quiz._id);

      const attempts = ids.length
        ? await TheoryAttempt.find({
            theoryQuiz: { $in: ids },
            ...(student ? { student: req.user._id } : {})
          })
            .select(
              "theoryQuiz student score status expiresAt grades overallFeedback"
            )
            .lean()
        : [];

      const byQuiz = new Map();

      for (const attempt of attempts) {
        const key = idOf(attempt.theoryQuiz);

        if (!byQuiz.has(key)) byQuiz.set(key, []);
        byQuiz.get(key).push(attempt);
      }

      return res.json(
        quizzes.map((quiz) => {
          const quizAttempts =
            byQuiz.get(idOf(quiz._id)) || [];

          if (student) {
            const attempt = quizAttempts[0] || null;
            const final = isFinal(attempt);

            return {
              ...metadata(quiz, false),
              course: quiz.course,
              attempted: final,
              inProgress: Boolean(
                attempt?.status === "in_progress" &&
                attempt.expiresAt &&
                new Date(attempt.expiresAt).getTime() > Date.now()
              ),
              closed:
                new Date(quiz.closesAt).getTime() <= Date.now() &&
                !attempt,
              result: makeResult(quiz, attempt)
            };
          }

          return {
            ...metadata(quiz, true),
            course: quiz.course,
            attemptCount: quizAttempts.filter(isFinal).length
          };
        })
      );
    } catch (error) {
      return handleError(res, error);
    }
  }
);

// Faculty creates a draft; prompt and reference files are optional.
router.post(
  "/",
  authorize("faculty"),
  async (req, res) => {
    try {
      if (!mongoose.isValidObjectId(req.body?.course)) {
        return res.status(400).json({
          message: "Select a valid course."
        });
      }

      const course = await Course.findOne({
        _id: req.body.course,
        faculty: req.user._id
      });

      if (!course) {
        return res.status(403).json({
          message: "Create Theory assessments only for your own courses."
        });
      }

      let fields;

      try {
        fields = validateTheoryQuiz(req.body);
      } catch (error) {
        return res.status(400).json({
          message: error.message
        });
      }

      const quiz = await TheoryQuiz.create({
        ...fields,
        course: course._id,
        createdBy: req.user._id
      });

      return res.status(201).json({
        message: "Theory assessment saved as draft.",
        id: quiz._id,
        questionIds: quiz.questions.map(
          (question) => String(question._id)
        )
      });
    } catch (error) {
      return handleError(res, error);
    }
  }
);

// Faculty can view/edit only own Theory assessment.
router.get(
  "/:id",
  authorize("faculty"),
  async (req, res) => {
    try {
      const quiz = await getFacultyQuiz(req, res);
      if (!quiz) return;

      return res.json(metadata(quiz, true));
    } catch (error) {
      return handleError(res, error);
    }
  }
);

router.put(
  "/:id",
  authorize("faculty"),
  async (req, res) => {
    try {
      const quiz = await getFacultyQuiz(req, res);
      if (!quiz) return;

      if (await TheoryAttempt.exists({ theoryQuiz: quiz._id })) {
        return res.status(409).json({
          message: "A Theory assessment with attempts cannot be edited."
        });
      }

      if (String(req.body?.course) !== String(quiz.course)) {
        return res.status(400).json({
          message: "Assessment course cannot be changed."
        });
      }

      let fields;

      try {
        fields = validateTheoryQuiz(req.body);
      } catch (error) {
        return res.status(400).json({
          message: error.message
        });
      }

      const oldQuestions = new Map(
        quiz.questions.map((question) => [
          String(question._id),
          question
        ])
      );

      fields.questions = fields.questions.map((question) => {
        const old = question._id
          ? oldQuestions.get(String(question._id))
          : null;

        return {
          ...question,
          promptAttachment:
            old?.promptAttachment || undefined,
          referenceAttachment:
            old?.referenceAttachment || undefined
        };
      });

      quiz.set(fields);
      await quiz.save();

      return res.json({
        message: "Theory assessment updated.",
        id: quiz._id,
        questionIds: quiz.questions.map(
          (question) => String(question._id)
        )
      });
    } catch (error) {
      return handleError(res, error);
    }
  }
);

// Optional Faculty prompt/reference file upload or replacement.
router.put(
  "/:id/questions/:questionId/files/:kind",
  authorize("faculty"),
  receiveFile,
  async (req, res) => {
    let keepFile = false;

    try {
      const quiz = await getFacultyQuiz(req, res);
      if (!quiz) return;

      if (await TheoryAttempt.exists({ theoryQuiz: quiz._id })) {
        return res.status(409).json({
          message: "Question files cannot change after an attempt starts."
        });
      }

      if (!["prompt", "reference"].includes(req.params.kind)) {
        return res.status(400).json({
          message: "File type must be prompt or reference."
        });
      }

      const question = quiz.questions.id(
        req.params.questionId
      );

      if (!question) {
        return res.status(404).json({
          message: "Question not found."
        });
      }

      if (!req.file) {
        return res.status(400).json({
          message: "Select a file first."
        });
      }

      if (!(await verifyUpload(req.file))) {
        return res.status(400).json({
          message: "File contents do not match the file type."
        });
      }

      const field = req.params.kind === "prompt"
        ? "promptAttachment"
        : "referenceAttachment";

      const oldName = question[field]?.storedName;

      question[field] = fileInfo(req.file);
      await quiz.save();

      keepFile = true;

      if (safeStoredName(oldName)) {
        await fs.promises.unlink(
          path.join(uploadDir, oldName)
        ).catch(() => {});
      }

      return res.json({
        message: "Question file uploaded."
      });
    } catch (error) {
      return handleError(res, error);
    } finally {
      if (!keepFile) {
        await removeTemp(req.file);
      }
    }
  }
);

// Faculty-only prompt and reference file access.
// Students may access prompt files only.
router.get(
  "/:id/questions/:questionId/files/:kind",
  authorize("student", "faculty"),
  async (req, res) => {
    try {
      const faculty = req.user.role === "faculty";

      const quiz = faculty
        ? await getFacultyQuiz(req, res)
        : await getStudentQuiz(req, res);

      if (!quiz) return;

      if (
        !mongoose.isValidObjectId(req.params.questionId) ||
        !["prompt", "reference"].includes(req.params.kind)
      ) {
        return res.status(400).json({
          message: "Invalid question file request."
        });
      }

      if (
        req.params.kind === "reference" &&
        !faculty
      ) {
        return res.status(403).json({
          message: "Reference files are Faculty-only."
        });
      }

      const question = quiz.questions.id(
        req.params.questionId
      );

      if (!question) {
        return res.status(404).json({
          message: "Question not found."
        });
      }

      const attachment =
        req.params.kind === "prompt"
          ? question.promptAttachment
          : question.referenceAttachment;

      if (
        !attachment?.storedName ||
        !safeStoredName(attachment.storedName)
      ) {
        return res.status(404).json({
          message: "File is unavailable."
        });
      }

      res.setHeader("Cache-Control", "private, no-store");
      res.setHeader("X-Content-Type-Options", "nosniff");

      return res.download(
        path.join(uploadDir, attachment.storedName),
        attachment.originalName
      );
    } catch (error) {
      return handleError(res, error);
    }
  }
);

// Student starts or resumes a timed Theory attempt.
router.get(
  "/:id/play",
  authorize("student"),
  async (req, res) => {
    try {
      const quiz = await getStudentQuiz(req, res);
      if (!quiz) return;

      let attempt = await findAttempt(quiz._id, req.user._id);

      if (
        attempt?.status === "in_progress" &&
        attempt.expiresAt.getTime() <= Date.now()
      ) {
        await finalizeExpiredTheoryAttempt(attempt._id);
        attempt = await findAttempt(quiz._id, req.user._id);
      }

      if (attempt && attempt.status !== "in_progress") {
        return res.json({
          attempted: true,
          expired: attempt.status === "expired",
          result: quiz.resultsPublished
            ? {
                score: attempt.score,
                maxScore: totalMarks(quiz),
                questions: quiz.questions.map(
                  (question, index) => {
                    const grade = attempt.grades.find(
                      (item) =>
                        idOf(item.questionId) ===
                        idOf(question._id)
                    );

                    return {
                      questionNumber: index + 1,
                      points: question.points,
                      score: grade?.score || 0,
                      feedback: grade?.feedback || ""
                    };
                  }
                )
              }
            : null
        });
      }

      if (
        !attempt &&
        quiz.closesAt.getTime() <= Date.now()
      ) {
        return res.json({
          closed: true,
          message: "Assessment deadline has passed."
        });
      }

      if (!attempt) {
        const now = new Date();
        const end = Math.min(
          now.getTime() +
            quiz.durationMinutes * 60000,
          quiz.closesAt.getTime()
        );

        await TheoryAttempt.init();

        try {
          attempt = await TheoryAttempt.create({
            theoryQuiz: quiz._id,
            course: quiz.course,
            student: req.user._id,
            answers: [],
            grades: [],
            score: 0,
            maxScore: totalMarks(quiz),
            status: "in_progress",
            startedAt: now,
            expiresAt: new Date(end)
          });
        } catch (error) {
          if (error.code !== 11000) throw error;
          attempt = await findAttempt(quiz._id, req.user._id);
        }
      }

      if (!attempt || attempt.status !== "in_progress") {
        return res.status(409).json({
          message: "This attempt is no longer active."
        });
      }

      const answerMap = new Map(
        attempt.answers.map((answer) => [
          idOf(answer.questionId),
          answer
        ])
      );

      const now = Date.now();

      return res.json({
        _id: quiz._id,
        title: quiz.title,
        instructions: quiz.instructions,
        closesAt: quiz.closesAt,
        expiresAt: attempt.expiresAt,
        serverNow: new Date(now).toISOString(),
        secondsLeft: Math.max(
          0,
          Math.ceil(
            (attempt.expiresAt.getTime() - now) / 1000
          )
        ),
        questions: quiz.questions.map((question) => {
          const answer = answerMap.get(idOf(question._id));

          return {
            _id: question._id,
            promptText: question.promptText || "",
            points: question.points,
            promptFileName:
              question.promptAttachment?.originalName || "",
            answerText: answer?.text || "",
            answerFileName:
              answer?.attachment?.originalName || ""
          };
        })
      });
    } catch (error) {
      return handleError(res, error);
    }
  }
);

// Faculty publishes the Theory assessment.
router.post(
  "/:id/publish",
  authorize("faculty"),
  async (req, res) => {
    try {
      const quiz = await facultyQuiz(req, res);
      if (!quiz) return;

      if (quiz.closesAt.getTime() <= Date.now()) {
        return res.status(409).json({
          message: "Deadline must be in the future."
        });
      }

      const incomplete = quiz.questions.some(
        (question) =>
          !String(question.promptText || "").trim() &&
          !question.promptAttachment?.storedName
      );

      if (incomplete) {
        return res.status(409).json({
          message:
            "Every question needs typed prompt text or a prompt file."
        });
      }

      quiz.isPublished = true;
      await quiz.save();

      return res.json({
        message: "Theory assessment published."
      });
    } catch (error) {
      return handleError(res, error);
    }
  }
);

// Save student text answer and/or one file per question.
router.patch(
  "/:id/answers/:questionId",
  authorize("student"),
  receiveFile,
  async (req, res) => {
    let keepFile = false;

    try {
      const quiz = await getStudentQuiz(req, res);
      if (!quiz) return;

      let attempt = await findAttempt(quiz._id, req.user._id);

      if (!attempt) {
        return res.status(409).json({
          message: "Start the assessment first."
        });
      }

      if (
        attempt.status === "in_progress" &&
        attempt.expiresAt.getTime() <= Date.now()
      ) {
        await finalizeExpiredTheoryAttempt(attempt._id);
        attempt = await findAttempt(quiz._id, req.user._id);
      }

      if (
        !attempt ||
        attempt.status !== "in_progress" ||
        attempt.expiresAt.getTime() <= Date.now()
      ) {
        return res.status(409).json({
          message: "Time ended. Saved answers were submitted."
        });
      }

      const question = quiz.questions.id(
        req.params.questionId
      );

      if (!question) {
        return res.status(404).json({
          message: "Question not found."
        });
      }

      const text =
        typeof req.body?.text === "string"
          ? req.body.text.trim()
          : "";

      if (text.length > 10000) {
        return res.status(400).json({
          message: "Answer text must be 10000 characters or less."
        });
      }

      if (req.file && !(await verifyUpload(req.file))) {
        return res.status(400).json({
          message: "File contents do not match the file type."
        });
      }

      let answer = attempt.answers.find(
        (item) =>
          idOf(item.questionId) ===
          idOf(question._id)
      );

      if (!answer) {
        attempt.answers.push({
          questionId: question._id,
          text
        });

        answer = attempt.answers.at(-1);
      } else {
        answer.text = text;
      }

      const oldFile = answer.attachment?.storedName;

      if (req.body?.removeFile === "true") {
        answer.attachment = undefined;
      }

      if (req.file) {
        answer.attachment = fileInfo(req.file);
      }

      await attempt.save();
      keepFile = Boolean(req.file);

      if (
        (req.file || req.body?.removeFile === "true") &&
        safeStoredName(oldFile)
      ) {
        await fs.promises.unlink(
          path.join(uploadDir, oldFile)
        ).catch(() => {});
      }

      return res.json({
        message: "Theory answer saved.",
        answerFileName:
          answer.attachment?.originalName || ""
      });
    } catch (error) {
      return handleError(res, error);
    } finally {
      if (!keepFile) await removeTemp(req.file);
    }
  }
);

// Faculty can view prompt, student answer and reference file.
// Student can view prompt files, but never reference answers.
router.get(
  "/:id/questions/:questionId/files/:kind",
  authorize("student", "faculty"),
  async (req, res) => {
    try {
      const faculty = req.user.role === "faculty";

      const quiz = faculty
        ? await facultyQuiz(req, res)
        : await getStudentQuiz(req, res);

      if (!quiz) return;

      if (
        !mongoose.isValidObjectId(req.params.questionId) ||
        !["prompt", "reference"].includes(req.params.kind)
      ) {
        return res.status(400).json({
          message: "Invalid question-file request."
        });
      }

      if (
        req.params.kind === "reference" &&
        !faculty
      ) {
        return res.status(403).json({
          message: "Reference files are Faculty-only."
        });
      }

      const question = quiz.questions.id(
        req.params.questionId
      );

      if (!question) {
        return res.status(404).json({
          message: "Question not found."
        });
      }

      const attachment =
        req.params.kind === "prompt"
          ? question.promptAttachment
          : question.referenceAttachment;

      if (
        !attachment?.storedName ||
        !safeStoredName(attachment.storedName)
      ) {
        return res.status(404).json({
          message: "Question file unavailable."
        });
      }

      res.setHeader("Cache-Control", "private, no-store");
      res.setHeader("X-Content-Type-Options", "nosniff");

      return res.download(
        path.join(uploadDir, attachment.storedName),
        attachment.originalName
      );
    } catch (error) {
      return handleError(res, error);
    }
  }
);

// Faculty downloads a student's Theory answer file.
router.get(
  "/:id/attempts/:attemptId/answers/:questionId/file",
  authorize("faculty"),
  async (req, res) => {
    try {
      const quiz = await facultyQuiz(req, res);
      if (!quiz) return;

      const attempt = await TheoryAttempt.findOne({
        _id: req.params.attemptId,
        theoryQuiz: quiz._id,
        status: { $in: ["submitted", "expired"] }
      });

      if (!attempt) {
        return res.status(404).json({
          message: "Attempt not found."
        });
      }

      const answer = attempt.answers.find(
        (item) =>
          idOf(item.questionId) ===
          req.params.questionId
      );

      if (
        !answer?.attachment?.storedName ||
        !safeStoredName(answer.attachment.storedName)
      ) {
        return res.status(404).json({
          message: "Student answer file not found."
        });
      }

      res.setHeader("Cache-Control", "private, no-store");
      res.setHeader("X-Content-Type-Options", "nosniff");

      return res.download(
        path.join(uploadDir, answer.attachment.storedName),
        answer.attachment.originalName
      );
    } catch (error) {
      return handleError(res, error);
    }
  }
);

// Student submits; Theory answer marks are not calculated automatically.
router.post(
  "/:id/submit",
  authorize("student"),
  async (req, res) => {
    try {
      const quiz = await getStudentQuiz(req, res);
      if (!quiz) return;

      let attempt = await findAttempt(
        quiz._id,
        req.user._id
      );

      if (!attempt) {
        return res.status(409).json({
          message: "Start the assessment before submitting."
        });
      }

      if (attempt.status !== "in_progress") {
        return res.status(409).json({
          message: "This attempt is already finalized."
        });
      }

      if (attempt.expiresAt.getTime() <= Date.now()) {
        await finalizeExpiredTheoryAttempt(attempt._id);

        return res.status(409).json({
          message: "Time expired. Saved answers were auto-submitted."
        });
      }

      const unanswered = quiz.questions.filter(
        (question) => {
          const answer = attempt.answers.find(
            (item) =>
              idOf(item.questionId) ===
              idOf(question._id)
          );

          return !hasAnswer(answer);
        }
      );

      if (unanswered.length > 0) {
        return res.status(400).json({
          message:
            "For each question, enter text or attach a file. The timer will submit saved answers when it ends."
        });
      }

      attempt.status = "submitted";
      attempt.submittedAt = new Date();
      attempt.maxScore = totalMarks(quiz);

      await attempt.save();

      return res.json({
        message:
          "Theory answers submitted. Faculty will grade and publish the result."
      });
    } catch (error) {
      return handleError(res, error);
    }
  }
);

// Timer expiry finalizes saved Theory answers.
router.post(
  "/:id/timeout",
  authorize("student"),
  async (req, res) => {
    try {
      const quiz = await getStudentQuiz(req, res);
      if (!quiz) return;

      const attempt = await findAttempt(
        quiz._id,
        req.user._id
      );

      if (!attempt) {
        return res.status(404).json({
          message: "Attempt not found."
        });
      }

      if (attempt.status !== "in_progress") {
        return res.json({
          message:
            "Attempt is finalized. Faculty will grade it."
        });
      }

      if (attempt.expiresAt.getTime() > Date.now()) {
        return res.status(409).json({
          message: "Timer is still running.",
          secondsLeft: Math.ceil(
            (attempt.expiresAt.getTime() - Date.now()) / 1000
          )
        });
      }

      await finalizeExpiredTheoryAttempt(attempt._id);

      return res.json({
        message:
          "Time expired. Saved Theory answers were submitted for Faculty grading."
      });
    } catch (error) {
      return handleError(res, error);
    }
  }
);

// Faculty reads submitted Theory answers and optional reference-file names.
router.get(
  "/:id/attempts",
  authorize("faculty"),
  async (req, res) => {
    try {
      const quiz = await facultyQuiz(req, res);
      if (!quiz) return;

      await finalizeExpiredTheoryAttempts();

      const attempts = await TheoryAttempt.find({
        theoryQuiz: quiz._id,
        status: { $in: ["submitted", "expired"] }
      })
        .populate("student", "name email studentId")
        .sort({ submittedAt: -1 });

      return res.json({
        quiz: {
          _id: quiz._id,
          title: quiz.title,
          closesAt: quiz.closesAt,
          resultsPublished: quiz.resultsPublished,
          questions: quiz.questions.map(
            (question, index) => ({
              _id: question._id,
              number: index + 1,
              promptText: question.promptText || "",
              points: question.points,
              promptFileName:
                question.promptAttachment?.originalName || "",
              referenceFileName:
                question.referenceAttachment?.originalName || ""
            })
          )
        },

        attempts: attempts.map((attempt) => ({
          _id: attempt._id,
          student: attempt.student,
          status: attempt.status,
          submittedAt: attempt.submittedAt,
          score: attempt.score,
          maxScore: attempt.maxScore,

          answers: attempt.answers.map(
            (answer) => ({
              questionId: idOf(answer.questionId),
              text: answer.text || "",
              fileName:
                answer.attachment?.originalName || ""
            })
          ),

          grades: attempt.grades.map(
            (grade) => ({
              questionId: idOf(grade.questionId),
              score: grade.score,
              feedback: grade.feedback || ""
            })
          )
        }))
      });
    } catch (error) {
      return handleError(res, error);
    }
  }
);

// Faculty manually grades all Theory questions for one attempt.
router.put(
  "/:id/attempts/:attemptId/grades",
  authorize("faculty"),
  async (req, res) => {
    try {
      const quiz = await facultyQuiz(req, res);
      if (!quiz) return;

      const attempt = await TheoryAttempt.findOne({
        _id: req.params.attemptId,
        theoryQuiz: quiz._id,
        status: { $in: ["submitted", "expired"] }
      });

      if (!attempt) {
        return res.status(404).json({
          message: "Finalized attempt not found."
        });
      }

      if (
        !Array.isArray(req.body?.grades) ||
        req.body.grades.length !== quiz.questions.length
      ) {
        return res.status(400).json({
          message: "Enter a mark and feedback for every Theory question."
        });
      }

      const inputMap = new Map();

      for (const input of req.body.grades) {
        const questionId = String(input?.questionId || "");

        if (
          !mongoose.isValidObjectId(questionId) ||
          inputMap.has(questionId)
        ) {
          return res.status(400).json({
            message: "A question grade is invalid or repeated."
          });
        }

        inputMap.set(questionId, input);
      }

      const savedGrades = [];

      for (const question of quiz.questions) {
        const questionId = idOf(question._id);
        const input = inputMap.get(questionId);

        if (!input) {
          return res.status(400).json({
            message: "A question is missing its grade."
          });
        }

        const mark = Number(input.score);
        const feedback =
          typeof input.feedback === "string"
            ? input.feedback.trim()
            : "";

        if (
          !Number.isFinite(mark) ||
          mark < 0 ||
          mark > question.points
        ) {
          return res.status(400).json({
            message:
              `Question ${quiz.questions.indexOf(question) + 1} mark must be between 0 and ${question.points}.`
          });
        }

        if (feedback.length > 1000) {
          return res.status(400).json({
            message: "Feedback must be 1000 characters or less."
          });
        }

        savedGrades.push({
          questionId: question._id,
          score: mark,
          feedback
        });
      }

      attempt.grades = savedGrades;
      attempt.score = savedGrades.reduce(
        (sum, grade) => sum + grade.score,
        0
      );
      attempt.maxScore = totalMarks(quiz);

      await attempt.save();

      return res.json({
        message: "Theory marks and feedback saved.",
        score: attempt.score,
        maxScore: attempt.maxScore
      });
    } catch (error) {
      return handleError(res, error);
    }
  }
);

// Faculty publishes Theory marks and feedback.
// Theory answer/reference review is intentionally not shown to students.
router.post(
  "/:id/results",
  authorize("faculty"),
  async (req, res) => {
    try {
      const quiz = await facultyQuiz(req, res);
      if (!quiz) return;

      await finalizeExpiredTheoryAttempts();

      if (quiz.closesAt.getTime() > Date.now()) {
        return res.status(409).json({
          message: "Wait until the Theory assessment deadline has passed."
        });
      }

      const active = await TheoryAttempt.countDocuments({
        theoryQuiz: quiz._id,
        status: "in_progress"
      });

      if (active > 0) {
        return res.status(409).json({
          message: "Some Theory attempts are still active."
        });
      }

      const attempts = await TheoryAttempt.find({
        theoryQuiz: quiz._id,
        status: { $in: ["submitted", "expired"] }
      });

      if (!attempts.length) {
        return res.status(409).json({
          message: "No Theory attempts are ready to publish."
        });
      }

      for (const attempt of attempts) {
        const gradedIds = new Set(
          attempt.grades.map((grade) =>
            idOf(grade.questionId)
          )
        );

        if (
          quiz.questions.some(
            (question) =>
              !gradedIds.has(idOf(question._id))
          )
        ) {
          return res.status(409).json({
            message:
              "Grade every Theory question for every submitted attempt before publishing. Use 0 for unanswered questions."
          });
        }
      }

      quiz.resultsPublished = true;
      await quiz.save();

      return res.json({
        message:
          "Theory marks and feedback are now available to students."
      });
    } catch (error) {
      return handleError(res, error);
    }
  }
);

// Student sees marks/feedback only after Faculty publication.
router.get(
  "/:id/result",
  authorize("student"),
  async (req, res) => {
    try {
      const quiz = await studentQuiz(req, res);
      if (!quiz) return;

      if (!quiz.resultsPublished) {
        return res.status(403).json({
          message: "Result is not published yet."
        });
      }

      const attempt = await findAttempt(
        quiz._id,
        req.user._id
      );

      if (!attempt || !isFinal(attempt)) {
        return res.status(404).json({
          message: "Finalized attempt not found."
        });
      }

      const gradeMap = new Map(
        attempt.grades.map((grade) => [
          idOf(grade.questionId),
          grade
        ])
      );

      return res.json({
        title: quiz.title,
        score: attempt.score,
        maxScore: totalMarks(quiz),
        results: quiz.questions.map(
          (question, index) => {
            const grade = gradeMap.get(
              idOf(question._id)
            );

            return {
              questionNumber: index + 1,
              points: question.points,
              score: grade?.score || 0,
              feedback: grade?.feedback || ""
            };
          }
        )
      });
    } catch (error) {
      return handleError(res, error);
    }
  }
);

// Prompt and reference files: reference is Faculty-only.
router.get(
  "/:id/questions/:questionId/files/:kind",
  authorize("student", "faculty"),
  async (req, res) => {
    try {
      const faculty = req.user.role === "faculty";

      const quiz = faculty
        ? await facultyQuiz(req, res)
        : await studentQuiz(req, res);

      if (!quiz) return;

      if (
        !mongoose.isValidObjectId(req.params.questionId) ||
        !["prompt", "reference"].includes(req.params.kind)
      ) {
        return res.status(400).json({
          message: "Invalid question file request."
        });
      }

      if (
        req.params.kind === "reference" &&
        !faculty
      ) {
        return res.status(403).json({
          message: "Reference answer files are Faculty-only."
        });
      }

      const question = quiz.questions.id(
        req.params.questionId
      );

      if (!question) {
        return res.status(404).json({
          message: "Question not found."
        });
      }

      const attachment =
        req.params.kind === "prompt"
          ? question.promptAttachment
          : question.referenceAttachment;

      if (
        !attachment?.storedName ||
        !safeStoredName(attachment.storedName)
      ) {
        return res.status(404).json({
          message: "File unavailable."
        });
      }

      res.setHeader("Cache-Control", "private, no-store");
      res.setHeader("X-Content-Type-Options", "nosniff");

      return res.download(
        path.join(uploadDir, attachment.storedName),
        attachment.originalName
      );
    } catch (error) {
      return handleError(res, error);
    }
  }
);

// Faculty downloads a student's uploaded Theory answer file.
router.get(
  "/:id/attempts/:attemptId/answers/:questionId/file",
  authorize("faculty"),
  async (req, res) => {
    try {
      const quiz = await facultyQuiz(req, res);
      if (!quiz) return;

      const attempt = await TheoryAttempt.findOne({
        _id: req.params.attemptId,
        theoryQuiz: quiz._id,
        status: { $in: ["submitted", "expired"] }
      });

      if (!attempt) {
        return res.status(404).json({
          message: "Theory attempt not found."
        });
      }

      const answer = attempt.answers.find(
        (item) =>
          idOf(item.questionId) ===
          req.params.questionId
      );

      if (
        !answer?.attachment?.storedName ||
        !safeStoredName(answer.attachment.storedName)
      ) {
        return res.status(404).json({
          message: "Student answer file unavailable."
        });
      }

      res.setHeader("Cache-Control", "private, no-store");
      res.setHeader("X-Content-Type-Options", "nosniff");

      return res.download(
        path.join(uploadDir, answer.attachment.storedName),
        answer.attachment.originalName
      );
    } catch (error) {
      return handleError(res, error);
    }
  }
);

// Delete draft Theory assessment only when no attempt exists.
router.delete(
  "/:id",
  authorize("faculty"),
  async (req, res) => {
    try {
      const quiz = await facultyQuiz(req, res);
      if (!quiz) return;

      if (await TheoryAttempt.exists({ theoryQuiz: quiz._id })) {
        return res.status(409).json({
          message: "An assessment with attempts cannot be deleted."
        });
      }

      const storedNames = quiz.questions.flatMap(
        (question) => [
          question.promptAttachment?.storedName,
          question.referenceAttachment?.storedName
        ].filter(Boolean)
      );

      await quiz.deleteOne();

      for (const storedName of storedNames) {
        if (safeStoredName(storedName)) {
          await fs.promises.unlink(
            path.join(uploadDir, storedName)
          ).catch(() => {});
        }
      }

      return res.json({
        message: "Theory assessment deleted."
      });
    } catch (error) {
      return handleError(res, error);
    }
  }
);

router.use((error, _req, res, _next) => {
  console.error("Theory route error:", error);

  return res.status(500).json({
    message: "Theory assessment request failed."
  });
});

module.exports = router;