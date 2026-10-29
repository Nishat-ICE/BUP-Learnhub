const express = require("express");
const mongoose = require("mongoose");

const Quiz = require("../models/Quiz");
const QuizAttempt = require("../models/QuizAttempt");
const Course = require("../models/Course");
const { protect, authorize } = require("../middleware/authMiddleware");

const {
  validateQuiz,
  visibleQuestions,
  markQuiz
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
    isPublished: quiz.isPublished,
    resultsPublished: quiz.resultsPublished,
    questionCount: quiz.questions.length,
    maxScore: quiz.questions.reduce(
      (sum, question) => sum + question.points, 0
    )
  };
}

// Staff: participation numbers only.
// Admin/Authority: aggregate report; no student names or answers.
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
      aggregates.map((item) => [
        String(item._id),
        item
      ])
    );

    const rows = quizzes.map((quiz) => {
      const count = counts.get(String(quiz._id));
      const submitted = count?.submitted || 0;
      const enrolled = quiz.course?.students?.length || 0;
      const maxScore = quiz.questions.reduce(
        (sum, question) => sum + question.points, 0
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
          quiz.resultsPublished &&
          submitted > 0 &&
          maxScore > 0
            ? Math.round(
                (count.averageScore / maxScore) * 100
              )
            : null
      };
    });

    return res.json({
      total: quizzes.length,
      submissions: rows.reduce(
        (sum, item) => sum + item.submitted, 0
      ),
      rows
    });
  })
);

// Faculty: own courses. Student: enrolled courses' published quizzes.
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
            result:
              attempt && quiz.resultsPublished
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
          {
            $group: {
              _id: "$quiz",
              count: { $sum: 1 }
            }
          }
        ])
      : [];

    const byQuiz = new Map(
      counts.map((item) => [
        String(item._id),
        item.count
      ])
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

// Student receives questions WITHOUT correct answers.
router.get(
  "/:id/play",
  authorize("student"),
  wrap(async (req, res) => {
    const quiz = await ownStudentQuiz(req, res);
    if (!quiz) return;

    const attempt = await QuizAttempt.findOne({
      quiz: quiz._id,
      student: req.user._id
    }).select("score maxScore feedback");

    const open = quiz.closesAt.getTime() > Date.now();

    return res.json({
      _id: quiz._id,
      title: quiz.title,
      instructions: quiz.instructions,
      closesAt: quiz.closesAt,
      attempted: Boolean(attempt),
      open,
      questions:
        !attempt && open
          ? visibleQuestions(quiz.questions)
          : [],
      result:
        attempt && quiz.resultsPublished
          ? {
              score: attempt.score,
              maxScore: attempt.maxScore,
              feedback: attempt.feedback || ""
            }
          : null
    });
  })
);

router.post(
  "/:id/submit",
  authorize("student"),
  wrap(async (req, res) => {
    const quiz = await ownStudentQuiz(req, res);
    if (!quiz) return;

    if (quiz.closesAt.getTime() <= Date.now()) {
      return res.status(409).json({
        message: "Quiz deadline has passed."
      });
    }

    let marked;

    try {
      marked = markQuiz(
        quiz.questions,
        req.body?.answers
      );
    } catch (error) {
      return res.status(400).json({
        message: error.message
      });
    }

    // Database unique index also prevents concurrent double attempts.
    await QuizAttempt.init();

    await QuizAttempt.create({
      quiz: quiz._id,
      course: quiz.course,
      student: req.user._id,
      ...marked
    });

    return res.status(201).json({
      message:
        "Submitted. Faculty will publish the result."
    });
  })
);

router.get(
  "/:id/attempts",
  authorize("faculty"),
  wrap(async (req, res) => {
    const quiz = await ownFacultyQuiz(req, res);
    if (!quiz) return;

    const attempts = await QuizAttempt.find({
      quiz: quiz._id
    })
      .populate(
        "student",
        "name email studentId"
      )
      .sort({ submittedAt: -1 });

    return res.json(
      attempts.map((attempt) => ({
        _id: attempt._id,
        student: attempt.student,
        answers: attempt.answers,
        score: attempt.score,
        maxScore: attempt.maxScore,
        feedback: attempt.feedback,
        submittedAt: attempt.submittedAt
      }))
    );
  })
);

router.put(
  "/:id/attempts/:attemptId/feedback",
  authorize("faculty"),
  wrap(async (req, res) => {
    const quiz = await ownFacultyQuiz(req, res);
    if (!quiz) return;

    if (!isId(req.params.attemptId)) {
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
        message: "Feedback is too long."
      });
    }

    const attempt = await QuizAttempt.findOneAndUpdate(
      {
        _id: req.params.attemptId,
        quiz: quiz._id
      },
      { $set: { feedback } },
      { new: true }
    );

    if (!attempt) {
      return res.status(404).json({
        message: "Attempt not found."
      });
    }

    return res.json({ message: "Feedback saved." });
  })
);

router.get(
  "/:id",
  authorize("faculty"),
  wrap(async (req, res) => {
    const quiz = await ownFacultyQuiz(req, res);
    if (quiz) return res.json(quiz);
  })
);

router.put(
  "/:id",
  authorize("faculty"),
  wrap(async (req, res) => {
    const quiz = await ownFacultyQuiz(req, res);
    if (!quiz) return;

    if (await QuizAttempt.exists({ quiz: quiz._id })) {
      return res.status(409).json({
        message:
          "Students have attempted this quiz; editing is locked."
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
    const quiz = await ownFacultyQuiz(req, res);
    if (!quiz) return;

    if (await QuizAttempt.exists({ quiz: quiz._id })) {
      return res.status(409).json({
        message:
          "Quiz has student attempts and cannot be deleted."
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
    const quiz = await ownFacultyQuiz(req, res);
    if (!quiz) return;

    if (quiz.closesAt.getTime() <= Date.now()) {
      return res.status(409).json({
        message:
          "Closing time passed. Edit it before publishing."
      });
    }

    quiz.isPublished = true;
    await quiz.save();

    return res.json({
      message: "Quiz published to enrolled students."
    });
  })
);

router.post(
  "/:id/results",
  authorize("faculty"),
  wrap(async (req, res) => {
    const quiz = await ownFacultyQuiz(req, res);
    if (!quiz) return;

    if (!quiz.isPublished) {
      return res.status(409).json({
        message: "Publish the quiz first."
      });
    }

    if (!(await QuizAttempt.exists({ quiz: quiz._id }))) {
      return res.status(409).json({
        message: "No attempts to publish yet."
      });
    }

    quiz.resultsPublished = true;
    await quiz.save();

    return res.json({
      message: "Quiz results published."
    });
  })
);

router.use((error, _req, res, _next) => {
  if (error.code === 11000) {
    return res.status(409).json({
      message: "You have already attempted this quiz."
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

  console.error("Quiz error:", error);

  return res.status(500).json({
    message: "Quiz request failed."
  });
});

module.exports = router;