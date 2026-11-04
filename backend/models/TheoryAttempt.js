const mongoose = require("mongoose");

const attachmentSchema = new mongoose.Schema(
  {
    storedName: String,
    originalName: String,
    mimeType: String,
    size: Number
  },
  { _id: false }
);

const theoryAnswerSchema = new mongoose.Schema(
  {
    questionId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true
    },
    text: {
      type: String,
      default: "",
      maxlength: 10000
    },
    attachment: {
      type: attachmentSchema,
      default: undefined
    }
  },
  { _id: false }
);

const theoryGradeSchema = new mongoose.Schema(
  {
    questionId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true
    },
    score: {
      type: Number,
      required: true,
      min: 0
    },
    feedback: {
      type: String,
      default: "",
      maxlength: 1000
    }
  },
  { _id: false }
);

const theoryAttemptSchema = new mongoose.Schema(
  {
    theoryQuiz: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "TheoryQuiz",
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
      type: [theoryAnswerSchema],
      default: []
    },
    grades: {
      type: [theoryGradeSchema],
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
    status: {
      type: String,
      enum: ["in_progress", "submitted", "expired"],
      default: "in_progress"
    },
    startedAt: {
      type: Date,
      default: Date.now
    },
    expiresAt: {
      type: Date,
      required: true
    },
    submittedAt: {
      type: Date,
      default: null
    }
  },
  { timestamps: true }
);

theoryAttemptSchema.index(
  { theoryQuiz: 1, student: 1 },
  { unique: true }
);

module.exports = mongoose.model(
  "TheoryAttempt",
  theoryAttemptSchema
);