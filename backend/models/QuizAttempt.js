const mongoose = require("mongoose");

const answerSchema = new mongoose.Schema(
  {
    questionId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true
    },
    selectedIndex: {
      type: Number,
      required: true
    }
  },
  { _id: false }
);

const attemptSchema = new mongoose.Schema(
  {
    quiz: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Quiz",
      required: true,
      index: true
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
    answers: {
      type: [answerSchema],
      default: []
    },
    score: {
      type: Number,
      default: 0
    },
    maxScore: {
      type: Number,
      default: 0
    },
    feedback: {
      type: String,
      default: ""
    },
    status: {
      type: String,
      enum: ["in_progress", "submitted", "expired"],
      default: "submitted"
    },
    startedAt: {
      type: Date,
      default: Date.now
    },
    expiresAt: {
      type: Date,
      default: null
    },
    submittedAt: {
      type: Date,
      default: Date.now
    }
  },
  { timestamps: true }
);

attemptSchema.index(
  { quiz: 1, student: 1 },
  { unique: true }
);

module.exports = mongoose.model(
  "QuizAttempt",
  attemptSchema
);