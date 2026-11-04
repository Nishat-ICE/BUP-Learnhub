const mongoose = require("mongoose");

const attachmentSchema = new mongoose.Schema(
  {
    storedName: { type: String, required: true },
    originalName: { type: String, required: true },
    mimeType: { type: String, required: true },
    size: { type: Number, required: true }
  },
  { _id: false }
);

const theoryQuestionSchema = new mongoose.Schema({
  promptText: {
    type: String,
    default: "",
    maxlength: 2000
  },
  points: {
    type: Number,
    required: true,
    min: 1,
    max: 100
  },
  promptAttachment: {
    type: attachmentSchema,
    default: undefined
  },
  // Optional model/reference file. Never sent to students.
  referenceAttachment: {
    type: attachmentSchema,
    default: undefined
  }
});

const theoryQuizSchema = new mongoose.Schema(
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
    title: {
      type: String,
      required: true,
      trim: true,
      maxlength: 120
    },
    instructions: {
      type: String,
      default: "",
      maxlength: 1000
    },
    closesAt: {
      type: Date,
      required: true
    },
    durationMinutes: {
      type: Number,
      required: true,
      min: 1,
      max: 600
    },
    isPublished: {
      type: Boolean,
      default: false
    },
    resultsPublished: {
      type: Boolean,
      default: false
    },
    questions: {
      type: [theoryQuestionSchema],
      default: []
    }
  },
  { timestamps: true }
);

theoryQuizSchema.index({ course: 1, createdAt: -1 });

module.exports = mongoose.model(
  "TheoryQuiz",
  theoryQuizSchema
);