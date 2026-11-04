$ErrorActionPreference = "Stop"

$desktop = [Environment]::GetFolderPath("Desktop")
$root = Join-Path $desktop "BUP-LearnHub"
$utf8 = New-Object System.Text.UTF8Encoding($false)

$files = @(
  "backend\models\Quiz.js",
  "backend\services\quizRules.js",
  "backend\routes\quizRoutes.js",
  "backend\tests\quizRules.test.js",
  "frontend\src\pages\Quizzes.jsx"
)

foreach ($f in $files) {
  if (-not (Test-Path (Join-Path $root $f))) {
    throw "Missing: $f. Age Quiz module install koro. Kichu change hoyni."
  }
}

$backup = Join-Path $desktop (
  "BUP-LearnHub\local-setup-files\backups\quiz-timer-backup-" +
  (Get-Date -Format "yyyyMMdd-HHmmss")
)

foreach ($f in $files) {
  $dest = Join-Path $backup $f
  New-Item -ItemType Directory -Path (Split-Path $dest -Parent) -Force | Out-Null
  Copy-Item (Join-Path $root $f) $dest -Force
}

function W($rel, $content) {
  $p = Join-Path $root $rel
  New-Item -ItemType Directory -Path (Split-Path $p -Parent) -Force | Out-Null
  [System.IO.File]::WriteAllText($p, $content, $utf8)
  Write-Host "Written: $rel" -ForegroundColor Cyan
}

try {

# ============ MODEL: timeLimitMinutes + startTimes ============

W "backend\models\Quiz.js" @'
const mongoose = require("mongoose");

const questionSchema = new mongoose.Schema({
  text: { type: String, required: true },
  options: { type: [String], required: true },
  correctIndex: { type: Number, required: true },
  points: { type: Number, required: true }
});

const quizSchema = new mongoose.Schema(
  {
    course: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Course",
      required: true,
      index: true
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true
    },
    title: { type: String, required: true, trim: true },
    instructions: { type: String, default: "" },
    closesAt: { type: Date, required: true },

    // 0 = no time limit. Otherwise student must submit within
    // this many minutes after starting the quiz.
    timeLimitMinutes: {
      type: Number,
      default: 0,
      min: 0,
      max: 600
    },

    isPublished: { type: Boolean, default: false },
    resultsPublished: { type: Boolean, default: false },
    questions: { type: [questionSchema], default: [] },

    // When each student first opened the quiz (per-student timer)
    startTimes: [
      {
        student: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "User"
        },
        startedAt: { type: Date }
      }
    ]
  },
  { timestamps: true }
);

module.exports = mongoose.model("Quiz", quizSchema);
'@

# ============ RULES ============

W "backend\services\quizRules.js" @'
function validateQuiz(body) {
  const title =
    typeof body?.title === "string" ? body.title.trim() : "";

  const instructions =
    typeof body?.instructions === "string"
      ? body.instructions.trim()
      : "";

  const closesAt = new Date(body?.closesAt);

  if (!title || title.length > 120) {
    throw new Error("Quiz title must be 1-120 characters.");
  }

  if (instructions.length > 1000) {
    throw new Error("Instructions are too long.");
  }

  if (
    Number.isNaN(closesAt.getTime()) ||
    closesAt.getTime() <= Date.now()
  ) {
    throw new Error("Choose a future closing date and time.");
  }

  let timeLimitMinutes = 0;

  if (
    body?.timeLimitMinutes !== undefined &&
    body?.timeLimitMinutes !== null &&
    body?.timeLimitMinutes !== ""
  ) {
    const t = Number(body.timeLimitMinutes);

    if (!Number.isInteger(t) || t < 0 || t > 600) {
      throw new Error(
        "Time limit must be 0-600 minutes (0 means no limit)."
      );
    }

    timeLimitMinutes = t;
  }

  if (
    !Array.isArray(body?.questions) ||
    body.questions.length < 1 ||
    body.questions.length > 20
  ) {
    throw new Error("A quiz needs 1-20 MCQ questions.");
  }

  const questions = body.questions.map((item, index) => {
    const text =
      typeof item?.text === "string" ? item.text.trim() : "";
    const options = item?.options;
    const correctIndex = Number(item?.correctIndex);
    const points = Number(item?.points);

    if (!text || text.length > 500) {
      throw new Error(`Question ${index + 1}: invalid text.`);
    }

    if (
      !Array.isArray(options) ||
      options.length !== 4 ||
      options.some(
        (option) =>
          typeof option !== "string" ||
          !option.trim() ||
          option.trim().length > 200
      )
    ) {
      throw new Error(
        `Question ${index + 1}: provide four options.`
      );
    }

    if (
      !Number.isInteger(correctIndex) ||
      correctIndex < 0 ||
      correctIndex > 3
    ) {
      throw new Error(
        `Question ${index + 1}: select the correct option.`
      );
    }

    if (!Number.isInteger(points) || points < 1 || points > 20) {
      throw new Error(
        `Question ${index + 1}: marks must be 1-20.`
      );
    }

    return {
      text,
      options: options.map((option) => option.trim()),
      correctIndex,
      points
    };
  });

  const totalMarks = questions.reduce(
    (sum, item) => sum + item.points,
    0
  );

  if (totalMarks > 100) {
    throw new Error("Total quiz marks cannot exceed 100.");
  }

  return {
    title,
    instructions,
    closesAt,
    timeLimitMinutes,
    questions
  };
}

function visibleQuestions(questions) {
  // Explicit allowlist: correct answer never reaches students.
  return questions.map((question) => ({
    _id: String(question._id),
    text: question.text,
    options: [...question.options],
    points: question.points
  }));
}

function markQuiz(questions, answers) {
  if (
    !Array.isArray(answers) ||
    answers.length !== questions.length
  ) {
    throw new Error("Answer every question exactly once.");
  }

  const selections = new Map();

  for (const answer of answers) {
    const id =
      typeof answer?.questionId === "string"
        ? answer.questionId
        : "";

    if (
      !id ||
      selections.has(id) ||
      !Number.isInteger(answer.selectedIndex)
    ) {
      throw new Error("Invalid or duplicate answer.");
    }

    selections.set(id, answer.selectedIndex);
  }

  let score = 0;
  let maxScore = 0;

  const accepted = questions.map((question) => {
    const id = String(question._id);
    const selectedIndex = selections.get(id);

    if (
      selectedIndex === undefined ||
      selectedIndex < 0 ||
      selectedIndex >= question.options.length
    ) {
      throw new Error("Invalid answer selection.");
    }

    maxScore += question.points;

    if (selectedIndex === question.correctIndex) {
      score += question.points;
    }

    return {
      questionId: question._id,
      selectedIndex
    };
  });

  return { answers: accepted, score, maxScore };
}

// Per-student deadline: earlier of global close time and
// startedAt + time limit. No limit = global close time only.
function attemptDeadline(closesAt, startedAt, timeLimitMinutes) {
  const closing = new Date(closesAt).getTime();

  if (!timeLimitMinutes || timeLimitMinutes <= 0) {
    return closing;
  }

  return Math.min(
    closing,
    new Date(startedAt).getTime() + timeLimitMinutes * 60000
  );
}

module.exports = {
  validateQuiz,
  visibleQuestions,
  markQuiz,
  attemptDeadline
};
'@

# ============ ROUTES: auto marks + timer ============

W "backend\routes\quizRoutes.js" @'
const express = require("express");
const mongoose = require("mongoose");

const Quiz = require("../models/Quiz");
const QuizAttempt = require("../models/QuizAttempt");
const Course = require("../models/Course");
const {
  protect,
  authorize
} = require("../middleware/authMiddleware");

const {
  validateQuiz,
  visibleQuestions,
  markQuiz,
  attemptDeadline
} = require("../services/quizRules");

const router = express.Router();
router.use(protect);

const wrap = (handler) => (req, res, next) =>
  Promise.resolve(handler(req, res, next)).catch(next);

const isId = (value) => mongoose.isValidObjectId(value);

async function ownFacultyQuiz(req, res) {
  if (!isId(req.params.id)) {
    res.status(400).json({ message: "Invalid quiz ID." });
    return null;
  }

  const quiz = await Quiz.findById(req.params.id);

  if (!quiz) {
    res.status(404).json({ message: "Quiz not found." });
    return null;
  }

  const owner = await Course.exists({
    _id: quiz.course,
    faculty: req.user._id
  });

  if (!owner) {
    res.status(403).json({
      message: "You can manage only your own course quizzes."
    });
    return null;
  }

  return quiz;
}

async function ownStudentQuiz(req, res) {
  if (!isId(req.params.id)) {
    res.status(400).json({ message: "Invalid quiz ID." });
    return null;
  }

  const quiz = await Quiz.findOne({
    _id: req.params.id,
    isPublished: true
  });

  if (!quiz) {
    res.status(404).json({
      message: "Published quiz not found."
    });
    return null;
  }

  const enrolled = await Course.exists({
    _id: quiz.course,
    students: req.user._id
  });

  if (!enrolled) {
    res.status(403).json({
      message: "Enroll in this course to access its quiz."
    });
    return null;
  }

  return quiz;
}

function listing(quiz) {
  return {
    _id: quiz._id,
    course: quiz.course,
    title: quiz.title,
    instructions: quiz.instructions,
    closesAt: quiz.closesAt,
    timeLimitMinutes: quiz.timeLimitMinutes || 0,
    isPublished: quiz.isPublished,
    resultsPublished: quiz.resultsPublished,
    questionCount: quiz.questions.length,
    maxScore: quiz.questions.reduce(
      (sum, question) => sum + question.points,
      0
    )
  };
}

// Staff: participation counts only.
// Admin/Authority: aggregate report, no individual answers.
router.get(
  "/report",
  authorize("staff", "admin", "authority"),
  wrap(async (req, res) => {
    const staff = req.user.role === "staff";

    const quizzes = await Quiz.find(
      staff ? { isPublished: true } : {}
    )
      .populate("course", "code title students")
      .lean();

    const ids = quizzes.map((quiz) => quiz._id);

    const aggregates = ids.length
      ? await QuizAttempt.aggregate([
          { $match: { quiz: { $in: ids } } },
          {
            $group: {
              _id: "$quiz",
              submitted: { $sum: 1 },
              averageScore: { $avg: "$score" }
            }
          }
        ])
      : [];

    const counts = new Map(
      aggregates.map((item) => [String(item._id), item])
    );

    const rows = quizzes.map((quiz) => {
      const count = counts.get(String(quiz._id));
      const submitted = count?.submitted || 0;
      const enrolled = quiz.course?.students?.length || 0;
      const maxScore = quiz.questions.reduce(
        (sum, question) => sum + question.points,
        0
      );

      const basic = {
        id: quiz._id,
        title: quiz.title,
        courseCode: quiz.course?.code || "Unknown",
        courseTitle: quiz.course?.title || "Course unavailable",
        enrolled,
        submitted,
        notSubmitted: Math.max(0, enrolled - submitted),
        participationPercent: enrolled
          ? Math.min(
              100,
              Math.round((submitted / enrolled) * 100)
            )
          : null,
        resultsPublished: quiz.resultsPublished
      };

      if (staff) return basic;

      return {
        ...basic,
        averagePercent:
          submitted > 0 && maxScore > 0
            ? Math.round((count.averageScore / maxScore) * 100)
            : null
      };
    });

    return res.json({
      total: quizzes.length,
      submissions: rows.reduce(
        (sum, item) => sum + item.submitted,
        0
      ),
      rows
    });
  })
);

// Faculty: own courses. Student: published quizzes of enrolled courses.
router.get(
  "/",
  authorize("student", "faculty"),
  wrap(async (req, res) => {
    const student = req.user.role === "student";

    const courseIds = await Course.distinct(
      "_id",
      student
        ? { students: req.user._id }
        : { faculty: req.user._id }
    );

    const quizzes = await Quiz.find({
      course: { $in: courseIds },
      ...(student ? { isPublished: true } : {})
    })
      .populate("course", "code title")
      .sort({ createdAt: -1 })
      .lean();

    const ids = quizzes.map((quiz) => quiz._id);

    if (student) {
      const attempts = ids.length
        ? await QuizAttempt.find({
            student: req.user._id,
            quiz: { $in: ids }
          })
            .select("quiz score maxScore feedback")
            .lean()
        : [];

      const byQuiz = new Map(
        attempts.map((attempt) => [
          String(attempt.quiz),
          attempt
        ])
      );

      return res.json(
        quizzes.map((quiz) => {
          const attempt = byQuiz.get(String(quiz._id));

          return {
            ...listing(quiz),
            attempted: Boolean(attempt),
            // AUTO MARKS: result is visible immediately after submit
            result: attempt
              ? {
                  score: attempt.score,
                  maxScore: attempt.maxScore,
                  feedback: attempt.feedback || ""
                }
              : null
          };
        })
      );
    }

    const counts = ids.length
      ? await QuizAttempt.aggregate([
          { $match: { quiz: { $in: ids } } },
          { $group: { _id: "$quiz", count: { $sum: 1 } } }
        ])
      : [];

    const byQuiz = new Map(
      counts.map((item) => [String(item._id), item.count])
    );

    return res.json(
      quizzes.map((quiz) => ({
        ...listing(quiz),
        attemptCount: byQuiz.get(String(quiz._id)) || 0
      }))
    );
  })
);

router.post(
  "/",
  authorize("faculty"),
  wrap(async (req, res) => {
    if (!isId(req.body?.course)) {
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
        message: "Create quizzes only for your own course."
      });
    }

    let fields;

    try {
      fields = validateQuiz(req.body);
    } catch (error) {
      return res.status(400).json({ message: error.message });
    }

    const quiz = await Quiz.create({
      ...fields,
      course: course._id,
      createdBy: req.user._id
    });

    return res.status(201).json({
      message: "Quiz saved as draft.",
      id: quiz._id
    });
  })
);

// Student opens quiz: timer starts here (first open only)
router.get(
  "/:id/play",
  authorize("student"),
  wrap(async (req, res) => {
    const quiz = await ownStudentQuiz(req, res);
    if (!quiz) return;

    const submitted = await QuizAttempt.findOne({
      quiz: quiz._id,
      student: req.user._id
    }).select("score maxScore feedback submittedAt");

    if (submitted) {
      return res.json({
        _id: quiz._id,
        title: quiz.title,
        attempted: true,
        open: false,
        expired: false,
        questions: [],
        result: {
          score: submitted.score,
          maxScore: submitted.maxScore,
          feedback: submitted.feedback || ""
        }
      });
    }

    const now = Date.now();

    if (quiz.closesAt.getTime() <= now) {
      return res.json({
        _id: quiz._id,
        title: quiz.title,
        attempted: false,
        open: false,
        expired: true,
        questions: []
      });
    }

    let start = (quiz.startTimes || []).find(
      (entry) =>
        String(entry.student) === String(req.user._id)
    );

    if (!start) {
      start = {
        student: req.user._id,
        startedAt: new Date()
      };

      quiz.startTimes.push(start);
      await quiz.save();
    }

    const deadline = attemptDeadline(
      quiz.closesAt,
      start.startedAt,
      quiz.timeLimitMinutes
    );

    if (now > deadline) {
      return res.json({
        _id: quiz._id,
        title: quiz.title,
        attempted: false,
        open: false,
        expired: true,
        deadline: new Date(deadline).toISOString(),
        questions: []
      });
    }

    return res.json({
      _id: quiz._id,
      title: quiz.title,
      instructions: quiz.instructions,
      closesAt: quiz.closesAt,
      timeLimitMinutes: quiz.timeLimitMinutes || 0,
      startedAt: start.startedAt,
      deadline: new Date(deadline).toISOString(),
      attempted: false,
      open: true,
      expired: false,
      questions: visibleQuestions(quiz.questions)
    });
  })
);

router.post(
  "/:id/submit",
  authorize("student"),
  wrap(async (req, res) => {
    const quiz = await ownStudentQuiz(req, res);
    if (!quiz) return;

    const now = Date.now();

    if (quiz.closesAt.getTime() <= now) {
      return res.status(409).json({
        message: "Quiz deadline has passed."
      });
    }

    // Time limit enforcement (server side)
    if ((quiz.timeLimitMinutes || 0) > 0) {
      const start = (quiz.startTimes || []).find(
        (entry) =>
          String(entry.student) === String(req.user._id)
      );

      if (!start) {
        return res.status(409).json({
          message: "Open the quiz first, then submit."
        });
      }

      const deadline = attemptDeadline(
        quiz.closesAt,
        start.startedAt,
        quiz.timeLimitMinutes
      );

      if (now > deadline) {
        return res.status(409).json({
          message:
            "Time limit expired. You can no longer submit."
        });
      }
    }

    let marked;

    try {
      marked = 