const mongoose = require("mongoose");
const TheoryQuiz = require("../models/TheoryQuiz");
const TheoryAttempt = require("../models/TheoryAttempt");

async function finalizeExpiredTheoryAttempt(attemptId) {
  const attempt = await TheoryAttempt.findOne({
    _id: attemptId,
    status: "in_progress",
    expiresAt: { $lte: new Date() }
  }).lean();

  if (!attempt) return false;

  const quiz = await TheoryQuiz.findById(attempt.theoryQuiz)
    .select("questions")
    .lean();

  const maxScore = quiz
    ? quiz.questions.reduce(
        (sum, question) => sum + question.points,
        0
      )
    : 0;

  const updated = await TheoryAttempt.updateOne(
    {
      _id: attempt._id,
      status: "in_progress",
      expiresAt: { $lte: new Date() }
    },
    {
      $set: {
        maxScore,
        status: "expired",
        submittedAt: attempt.expiresAt || new Date()
      }
    }
  );

  return updated.modifiedCount > 0;
}

async function finalizeExpiredTheoryAttempts() {
  if (mongoose.connection.readyState !== 1) return;

  const attempts = await TheoryAttempt.find({
    status: "in_progress",
    expiresAt: { $lte: new Date() }
  })
    .select("_id")
    .sort({ expiresAt: 1 })
    .limit(100)
    .lean();

  for (const attempt of attempts) {
    try {
      await finalizeExpiredTheoryAttempt(attempt._id);
    } catch (error) {
      console.error(
        "Theory auto-submit failed:",
        String(attempt._id),
        error.message
      );
    }
  }
}

let worker = null;

function startTheoryAutoSubmit() {
  if (worker) return worker;

  worker = setInterval(() => {
    finalizeExpiredTheoryAttempts().catch((error) => {
      console.error(
        "Theory timer worker failed:",
        error.message
      );
    });
  }, 2000);

  if (worker.unref) worker.unref();

  finalizeExpiredTheoryAttempts().catch((error) => {
    console.error(
      "Initial Theory timer check failed:",
      error.message
    );
  });

  return worker;
}

module.exports = {
  finalizeExpiredTheoryAttempt,
  finalizeExpiredTheoryAttempts,
  startTheoryAutoSubmit
};