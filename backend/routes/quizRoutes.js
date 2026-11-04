const { getDepartmentCourseIds } = require("../services/departmentScope");
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
  normalizeAnswers,
  markQuiz,
  studentReview
} = require("../services/quizRules");

const {
  finalizeExpiredAttempt,
  finalizeExpiredAttempts
} = require("../services/quizAutoSubmit");

const router = express.Router();
router.use(protect);

const wrap = (handler) => (req, res, next) =>
  Promise.resolve(handler(req, res, next)).catch(next);

const validId = (value) =>
  mongoose.isValidObjectId(value);

const quizDuration = (quiz) =>
  Math.max(
    1,
    Math.min(600, Number(quiz.durationMinutes) || 15)
  );

function isFinal(attempt) {
  return Boolean(
    attempt &&
    (
      !attempt.status ||
      ["submitted", "expired"].includes(attempt.status)
    )
  );
}

function publishedResult(quiz, attempt) {
  if (!quiz.resultsPublished || !isFinal(attempt)) {
    return null;
  }

  return {
    score: attempt.score,
    maxScore: attempt.maxScore,
    feedback: attempt.feedback || ""
  };
}

function summary(quiz) {
  return {
    _id: quiz._id,
    course: quiz.course,
    title: quiz.title,
    instructions: quiz.instructions,
    closesAt: quiz.closesAt,
    durationMinutes: quizDuration(quiz),
    isPublished: quiz.isPublished,
    resultsPublished: quiz.resultsPublished,
    questionCount: quiz.questions.length,
    maxScore: quiz.questions.reduce(
      (sum, question) => sum + question.points,
      0
    )
  };
}

const finalFilter = reportFilter;
function reportFilter() {
  return {
    $or: [
      { status: { $in: ["submitted", "expired"] } },
      { status: { $exists: false } }
    ]
  };
}

function errorResponse(res, error) {
  if (error.code === 11000) {
    return res.status(409).json({
      message: "Only one attempt is allowed per student."
    });
  }

  if (
    error.name === "ValidationError" ||
    error.name === "CastError"
  ) {
    return res.status(400).json({
      message: error.message
    });
  }

  console.error("Quiz request failed:", error);

  return res.status(500).json({
    message: "Quiz request failed."
  });
}

async function getFacultyQuiz(req, res) {
  if (!validId(req.params.id)) {
    res.status(400).json({ message: "Invalid quiz ID." });
    return null;
  }

  const quiz = await Quiz.findById(req.params.id);

  if (!quiz) {
    res.status(404).json({ message: "Quiz not found." });
    return null;
  }

  const owned = await Course.exists({
    _id: quiz.course,
    faculty: req.user._id
  });

  if (!owned) {
    res.status(403).json({
      message: "Only this course's faculty can manage the quiz."
    });
    return null;
  }

  return quiz;
}

async function getStudentQuiz(req, res) {
  if (!validId(req.params.id)) {
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

async function findAttempt(quizId, studentId) {
  return QuizAttempt.findOne({
    quiz: quizId,
    student: studentId
  });
}

// Staff gets participation counts only.
// Admin and Authority get aggregate reports.
router.get(
  "/report",
  authorize("staff", "admin", "authority"),
  wrap(async (req, res) => {
    await finalizeExpiredAttempts();

    const staff = req.user.role === "staff";

    const staffCourseIds = staff
      ? await getDepartmentCourseIds(req.user.department)
      : [];

    const quizzes = await Quiz.find(
      staff ? { isPublished: true, course: { $in: staffCourseIds } } : {}
    )
      .populate("course", "code title students")
      .lean();

    const quizIds = quizzes.map((quiz) => quiz._id);

    const groups = quizIds.length
      ? await QuizAttempt.aggregate([
          {
            $match: {
              quiz: { $in: quizIds },
              ...reportFilter()
            }
          },
          {
            $group: {
              _id: "$quiz",
              count: { $sum: 1 },
              averageScore: { $avg: "$score" }
            }
          }
        ])
      : [];

    const groupMap = new Map(
      groups.map((item) => [
        String(item._id),
        item
      ])
    );

    const rows = quizzes.map((quiz) => {
      const group = groupMap.get(String(quiz._id));
      const submitted = group?.count || 0;
      const enrolled = quiz.course?.students?.length || 0;

      const maxScore = quiz.questions.reduce(
        (sum, question) => sum + question.points,
        0
      );

      const row = {
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
          : null
      };

      if (staff) return row;

      return {
        ...row,
        averagePercent:
          quiz.resultsPublished &&
          submitted > 0 &&
          maxScore > 0
            ? Math.round(
                (group.averageScore / maxScore) * 100
              )
            : null
      };
    });

    return res.json({
      total: quizzes.length,
      submissions: rows.reduce(
        (sum, row) => sum + row.submitted,
        0
      ),
      rows
    });
  })
);

// Student gets published quizzes in enrolled courses.
// Faculty gets quizzes for own courses.
router.get(
  "/",
  authorize("student", "faculty"),
  wrap(async (req, res) => {
    await finalizeExpiredAttempts();

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

    const quizIds = quizzes.map((quiz) => quiz._id);

    if (student) {
      const attempts = quizIds.length
        ? await QuizAttempt.find({
            quiz: { $in: quizIds },
            student: req.user._id
          })
            .select(
              "quiz score maxScore feedback status expiresAt"
            )
            .lean()
        : [];

      const attemptMap = new Map(
        attempts.map((attempt) => [
          String(attempt.quiz),
          attempt
        ])
      );

      return res.json(
        quizzes.map((quiz) => {
          const attempt = attemptMap.get(String(quiz._id));
          const final = isFinal(attempt);

          return {
            ...summary(quiz),
            attempted: final,
            inProgress: Boolean(
              attempt?.status === "in_progress" &&
              attempt.expiresAt &&
              new Date(attempt.expiresAt).getTime() > Date.now()
            ),
            closed:
              new Date(quiz.closesAt).getTime() <= Date.now() &&
              !attempt,
            reviewAvailable: Boolean(
              quiz.resultsPublished && final
            ),
            result: publishedResult(quiz, attempt)
          };
        })
      );
    }

    const groups = quizIds.length
      ? await QuizAttempt.aggregate([
          {
            $match: {
              quiz: { $in: quizIds },
              ...reportFilter()
            }
          },
          {
            $group: {
              _id: "$quiz",
              count: { $sum: 1 }
            }
          }
        ])
      : [];

    const countMap = new Map(
      groups.map((item) => [
        String(item._id),
        item.count
      ])
    );

    return res.json(
      quizzes.map((quiz) => ({
        ...summary(quiz),
        attemptCount: countMap.get(String(quiz._id)) || 0
      }))
    );
  })
);

router.post(
  "/",
  authorize("faculty"),
  wrap(async (req, res) => {
    if (!validId(req.body?.course)) {
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
        message: "Create quizzes only for your own courses."
      });
    }

    let fields;

    try {
      fields = validateQuiz(req.body);
    } catch (error) {
      return res.status(400).json({
        message: error.message
      });
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

// Start or resume the server-timed attempt.
router.get(
  "/:id/play",
  authorize("student"),
  wrap(async (req, res) => {
    const quiz = await getStudentQuiz(req, res);
    if (!quiz) return;

    let attempt = await findAttempt(
      quiz._id,
      req.user._id
    );

    if (
      attempt?.status === "in_progress" &&
      attempt.expiresAt &&
      attempt.expiresAt.getTime() <= Date.now()
    ) {
      await finalizeExpiredAttempt(attempt._id);
      attempt = await findAttempt(quiz._id, req.user._id);
    }

    if (isFinal(attempt)) {
      return res.json({
        _id: quiz._id,
        title: quiz.title,
        closesAt: quiz.closesAt,
        attempted: true,
        expired: attempt.status === "expired",
        result: publishedResult(quiz, attempt),
        reviewAvailable: Boolean(quiz.resultsPublished),
        questions: []
      });
    }

    if (
      !attempt &&
      quiz.closesAt.getTime() <= Date.now()
    ) {
      return res.json({
        _id: quiz._id,
        closed: true,
        message: "The quiz deadline has passed."
      });
    }

    if (!attempt) {
      const now = new Date();

      const durationMinutes = Math.max(
        1,
        Math.min(600, Number(quiz.durationMinutes) || 15)
      );

      // The earlier of duration expiry and Faculty-set deadline wins.
      const expiresAt = new Date(
        Math.min(
          now.getTime() + durationMinutes * 60000,
          quiz.closesAt.getTime()
        )
      );

      await QuizAttempt.init();

      try {
        attempt = await QuizAttempt.create({
          quiz: quiz._id,
          course: quiz.course,
          student: req.user._id,
          answers: [],
          score: 0,
          maxScore: quiz.questions.reduce(
            (sum, question) => sum + question.points,
            0
          ),
          status: "in_progress",
          startedAt: now,
          expiresAt,
          submittedAt: expiresAt
        });
      } catch (error) {
        if (error.code !== 11000) throw error;

        attempt = await findAttempt(
          quiz._id,
          req.user._id
        );
      }
    }

    if (
      !attempt ||
      attempt.status !== "in_progress" ||
      !attempt.expiresAt
    ) {
      return res.status(409).json({
        message: "This attempt is no longer active."
      });
    }

    const serverNow = Date.now();

    return res.json({
      _id: quiz._id,
      title: quiz.title,
      instructions: quiz.instructions,
      closesAt: quiz.closesAt,
      durationMinutes: quizDuration(quiz),
      expiresAt: attempt.expiresAt,
      serverNow: new Date(serverNow).toISOString(),
      secondsLeft: Math.max(
        0,
        Math.ceil(
          (attempt.expiresAt.getTime() - serverNow) / 1000
        )
      ),
      savedAnswers: (attempt.answers || []).map((answer) => ({
        questionId: String(answer.questionId),
        selectedIndex: answer.selectedIndex
      })),
      questions: visibleQuestions(quiz.questions)
    });
  })
);

// Save each answer so server can submit answers if timer expires.
router.patch(
  "/:id/answers",
  authorize("student"),
  wrap(async (req, res) => {
    const quiz = await getStudentQuiz(req, res);
    if (!quiz) return;

    let attempt = await findAttempt(quiz._id, req.user._id);

    if (!attempt) {
      return res.status(409).json({
        message: "Start the quiz before answering."
      });
    }

    if (attempt.status === "in_progress") {
      await finalizeExpiredAttempt(attempt._id);
      attempt = await findAttempt(quiz._id, req.user._id);
    }

    if (
      !attempt ||
      attempt.status !== "in_progress" ||
      !attempt.expiresAt ||
      attempt.expiresAt.getTime() <= Date.now()
    ) {
      return res.status(409).json({
        message: "The quiz timer ended. Saved answers are submitted."
      });
    }

    const questionId =
      typeof req.body?.questionId === "string"
        ? req.body.questionId
        : "";

    const question = quiz.questions.id(questionId);
    const selectedIndex = Number(req.body?.selectedIndex);

    if (
      !question ||
      !Number.isInteger(selectedIndex) ||
      selectedIndex < 0 ||
      selectedIndex >= question.options.length
    ) {
      return res.status(400).json({
        message: "Invalid answer selection."
      });
    }

    const answerArray = [...(attempt.answers || [])];

    const existingIndex = answerArray.findIndex(
      (answer) =>
        String(answer.questionId) === questionId
    );

    const updatedAnswer = {
      questionId: question._id,
      selectedIndex
    };

    if (existingIndex >= 0) {
      answerArray[existingIndex] = updatedAnswer;
    } else {
      answerArray.push(updatedAnswer);
    }

    const updated = await QuizAttempt.findOneAndUpdate(
      {
        _id: attempt._id,
        status: "in_progress",
        expiresAt: { $gt: new Date() }
      },
      { $set: { answers: answerArray } },
      { new: true }
    );

    if (!updated) {
      await finalizeExpiredAttempt(attempt._id);

      return res.status(409).json({
        message: "The quiz timer ended. Saved answers are submitted."
      });
    }

    return res.json({
      message: "Answer saved.",
      secondsLeft: Math.max(
        0,
        Math.ceil(
          (updated.expiresAt.getTime() - Date.now()) / 1000
        )
      )
    });
  })
);

// Browser calls this at zero. Server timer remains authoritative.
router.post(
  "/:id/timeout",
  authorize("student"),
  wrap(async (req, res) => {
    const quiz = await getStudentQuiz(req, res);
    if (!quiz) return;

    const attempt = await findAttempt(
      quiz._id,
      req.user._id
    );

    if (!attempt) {
      return res.status(404).json({
        message: "Quiz attempt not found."
      });
    }

    if (isFinal(attempt)) {
      return res.json({
        message:
          "Attempt submitted. Marks appear after Faculty publishes results."
      });
    }

    if (
      !attempt.expiresAt ||
      attempt.expiresAt.getTime() > Date.now()
    ) {
      return res.status(409).json({
        message: "The quiz timer is still running.",
        secondsLeft: attempt.expiresAt
          ? Math.ceil(
              (attempt.expiresAt.getTime() - Date.now()) / 1000
            )
          : null
      });
    }

    await finalizeExpiredAttempt(attempt._id);

    return res.json({
      message:
        "Time expired. Saved answers were auto-submitted; marks appear after Faculty publishes results."
    });
  })
);

// Manual submission requires every question to be answered.
router.post(
  "/:id/submit",
  authorize("student"),
  wrap(async (req, res) => {
    const quiz = await getStudentQuiz(req, res);
    if (!quiz) return;

    const attempt = await findAttempt(
      quiz._id,
      req.user._id
    );

    if (!attempt) {
      return res.status(409).json({
        message: "Start the quiz before submitting."
      });
    }

    if (isFinal(attempt)) {
      return res.status(409).json({
        message:
          "This attempt is already submitted. Marks appear after Faculty publishes results."
      });
    }

    if (
      !attempt.expiresAt ||
      attempt.expiresAt.getTime() <= Date.now()
    ) {
      await finalizeExpiredAttempt(attempt._id);

      return res.status(409).json({
        message: "Time expired. Saved answers were auto-submitted."
      });
    }

    let marked;

    try {
      marked = markQuiz(
        quiz.questions,
        req.body?.answers,
        false
      );
    } catch (error) {
      return res.status(400).json({
        message: error.message
      });
    }

    const completed = await QuizAttempt.findOneAndUpdate(
      {
        _id: attempt._id,
        status: "in_progress",
        expiresAt: { $gt: new Date() }
      },
      {
        $set: {
          answers: marked.answers,
          score: marked.score,
          maxScore: marked.maxScore,
          status: "submitted",
          submittedAt: new Date()
        }
      },
      { new: true }
    );

    if (!completed) {
      await finalizeExpiredAttempt(attempt._id);

      return res.status(409).json({
        message: "Time expired. Saved answers were auto-submitted."
      });
    }

    // Do not return marks to the student before Faculty publishes.
    return res.status(201).json({
      message:
        "Quiz submitted. Marks and answer review appear after Faculty publishes results."
    });
  })
);

// Student review: correct answers are hidden until Faculty publishes.
router.get(
  "/:id/review",
  authorize("student"),
  wrap(async (req, res) => {
    const quiz = await getStudentQuiz(req, res);
    if (!quiz) return;

    if (!quiz.resultsPublished) {
      return res.status(403).json({
        message:
          "Answer review is available after Faculty publishes results."
      });
    }

    const attempt = await findAttempt(
      quiz._id,
      req.user._id
    );

    if (!isFinal(attempt)) {
      return res.status(404).json({
        message: "Submitted quiz attempt not found."
      });
    }

    return res.json({
      title: quiz.title,
      score: attempt.score,
      maxScore: attempt.maxScore,
      feedback: attempt.feedback || "",
      questions: studentReview(
        quiz.questions,
        attempt.answers
      )
    });
  })
);

// Faculty can inspect marks and answers before publishing.
router.get(
  "/:id/attempts",
  authorize("faculty"),
  wrap(async (req, res) => {
    const quiz = await getFacultyQuiz(req, res);
    if (!quiz) return;

    await finalizeExpiredAttempts();

    const attempts = await QuizAttempt.find({
      quiz: quiz._id,
      ...finalFilter()
    })
      .populate("student", "name email studentId")
      .sort({ submittedAt: -1 });

    return res.json(
      attempts.map((attempt) => ({
        _id: attempt._id,
        student: attempt.student,
        answers: attempt.answers,
        score: attempt.score,
        maxScore: attempt.maxScore,
        feedback: attempt.feedback || "",
        status: attempt.status || "submitted",
        submittedAt: attempt.submittedAt
      }))
    );
  })
);

router.put(
  "/:id/attempts/:attemptId/feedback",
  authorize("faculty"),
  wrap(async (req, res) => {
    const quiz = await getFacultyQuiz(req, res);
    if (!quiz) return;

    if (!validId(req.params.attemptId)) {
      return res.status(400).json({
        message: "Invalid attempt ID."
      });
    }

    if (typeof req.body?.feedback !== "string") {
      return res.status(400).json({
        message: "Feedback must be text."
      });
    }

    const feedback = req.body.feedback.trim();

    if (feedback.length > 1000) {
      return res.status(400).json({
        message: "Feedback must be at most 1000 characters."
      });
    }

    const attempt = await QuizAttempt.findOneAndUpdate(
      {
        _id: req.params.attemptId,
        quiz: quiz._id,
        ...finalFilter()
      },
      { $set: { feedback } },
      { new: true }
    );

    if (!attempt) {
      return res.status(404).json({
        message: "Submitted attempt not found."
      });
    }

    return res.json({
      message: "Feedback saved."
    });
  })
);

router.post(
  "/:id/results",
  authorize("faculty"),
  wrap(async (req, res) => {
    const quiz = await getFacultyQuiz(req, res);
    if (!quiz) return;

    await finalizeExpiredAttempts();

    if (quiz.closesAt.getTime() > Date.now()) {
      return res.status(409).json({
        message:
          "Wait until the quiz closing deadline has passed before publishing results."
      });
    }

    const activeAttempts = await QuizAttempt.countDocuments({
      quiz: quiz._id,
      status: "in_progress"
    });

    if (activeAttempts > 0) {
      return res.status(409).json({
        message:
          "Some attempts are still active. Wait for them to finish."
      });
    }

    const count = await QuizAttempt.countDocuments({
      quiz: quiz._id,
      ...finalFilter()
    });

    if (!count) {
      return res.status(409).json({
        message: "No submitted quiz attempts yet."
      });
    }

    quiz.resultsPublished = true;
    await quiz.save();

    return res.json({
      message:
        "Marks, feedback and answer review are now available to students."
    });
  })
);

// Faculty quiz details/edit.
router.get(
  "/:id",
  authorize("faculty"),
  wrap(async (req, res) => {
    const quiz = await getFacultyQuiz(req, res);
    if (quiz) return res.json(quiz);
  })
);

router.put(
  "/:id",
  authorize("faculty"),
  wrap(async (req, res) => {
    const quiz = await getFacultyQuiz(req, res);
    if (!quiz) return;

    if (await QuizAttempt.exists({ quiz: quiz._id })) {
      return res.status(409).json({
        message: "A quiz with an attempt cannot be edited."
      });
    }

    if (String(req.body?.course) !== String(quiz.course)) {
      return res.status(400).json({
        message: "Quiz course cannot be changed."
      });
    }

    let fields;

    try {
      fields = validateQuiz(req.body);
    } catch (error) {
      return res.status(400).json({
        message: error.message
      });
    }

    quiz.set(fields);
    await quiz.save();

    return res.json({ message: "Quiz updated." });
  })
);

router.delete(
  "/:id",
  authorize("faculty"),
  wrap(async (req, res) => {
    const quiz = await getFacultyQuiz(req, res);
    if (!quiz) return;

    if (await QuizAttempt.exists({ quiz: quiz._id })) {
      return res.status(409).json({
        message: "A quiz with student attempts cannot be deleted."
      });
    }

    await quiz.deleteOne();

    return res.json({ message: "Quiz deleted." });
  })
);

router.post(
  "/:id/publish",
  authorize("faculty"),
  wrap(async (req, res) => {
    const quiz = await getFacultyQuiz(req, res);
    if (!quiz) return;

    if (quiz.closesAt.getTime() <= Date.now()) {
      return res.status(409).json({
        message:
          "The attempt deadline has passed. Edit the deadline before publishing."
      });
    }

    quiz.isPublished = true;
    await quiz.save();

    return res.json({
      message: "Quiz published to enrolled students."
    });
  })
);

router.use((error, _req, res, _next) => {
  if (error.code === 11000) {
    return res.status(409).json({
      message: "Only one attempt is allowed per student."
    });
  }

  if (
    error.name === "ValidationError" ||
    error.name === "CastError"
  ) {
    return res.status(400).json({
      message: error.message
    });
  }

  console.error("Quiz API error:", error);

  return res.status(500).json({
    message: "Quiz request failed."
  });
});

module.exports = router;