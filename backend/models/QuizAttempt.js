const mongoose = require("mongoose");

const answerSchema = new mongoose.Schema(
  {
    questionId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true
    },
    selectedIndex: { type: Number, required: true }
  },
  { _id: false }
);

const attemptSchema = new mongoose.Schema(
  {
    quiz: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Quiz",
      required: true
    },
    course: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Course",
      required: true
    },
    student: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true
    },
    answers: { type: [answerSchema], required: true },
    score: { type: Number, required: true },
    maxScore: { type: Number, required: true },
    feedback: { type: String, default: "" },
    submittedAt: { type: Date, default: Date.now }
  },
  { timestamps: true }
);

attemptSchema.index(
  { quiz: 1, student: 1 },
  { unique: true }
);

module.exports = mongoose.model("QuizAttempt", attemptSchema);