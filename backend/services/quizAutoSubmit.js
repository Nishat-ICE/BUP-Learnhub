const mongoose = require("mongoose");
const Quiz = require("../models/Quiz");
const QuizAttempt = require("../models/QuizAttempt");
const { markQuiz } = require("./quizRules");

async function finalizeExpiredAttempt(attemptId) {
  const now = new Date();

  const attempt = await QuizAttempt.findOne({
    _id: attemptId,
    status: "in_progress",
    expiresAt: { $lte: now }
  }).lean();

  if (!attempt) return false;

  const quiz = await Quiz.findById(attempt.quiz)
    .select("questions")
    .lean();

  const marked = quiz
    ? markQuiz(
        quiz.questions,
        attempt.answers || [],
        true
      )
    : {
        answers: attempt.answers || [],
        score: 0,
        maxScore: 0
      };

  const result = await QuizAttempt.updateOne(
    {
      _id: attempt._id,
      status: "in_progress",
      expiresAt: { $lte: new Date() }
    },
    {
      $set: {
        answers: marked.answers,
        score: marked.score,
        maxScore: marked.maxScore,
        status: "expired",
        submittedAt: attempt.expiresAt || new Date()
      }
    }
  );

  return result.modifiedCount > 0;
}

async function finalizeExpiredAttempts() {
  if (mongoose.connection.readyState !== 1) return;

  const expired = await QuizAttempt.find({
    status: "in_progress",
    expiresAt: { $lte: new Date() }
  })
    .select("_id")
    .sort({ expiresAt: 1 })
    .limit(100)
    .lean();

  for (const attempt of expired) {
    try {
      await finalizeExpiredAttempt(attempt._id);
    } catch (error) {
      console.error(
        "Quiz auto-submit failed:",
        String(attempt._id),
        error.message
      );
    }
  }
}

let worker = null;

function startQuizAutoSubmit() {
  if (worker) return worker;

  worker = setInterval(() => {
    finalizeExpiredAttempts().catch((error) => {
      console.error("Quiz timer worker failed:", error.message);
    });
  }, 2000);

  if (worker.unref) worker.unref();

  finalizeExpiredAttempts().catch((error) => {
    console.error("Initial quiz timer check failed:", error.message);
  });

  return worker;
}

module.exports = {
  finalizeExpiredAttempt,
  finalizeExpiredAttempts,
  startQuizAutoSubmit
};