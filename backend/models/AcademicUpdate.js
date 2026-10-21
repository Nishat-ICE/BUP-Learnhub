const mongoose = require("mongoose");

const academicUpdateSchema = new mongoose.Schema(
  {
    kind: {
      type: String,
      enum: ["calendar", "reschedule"],
      required: true
    },

    title: {
      type: String,
      required: true,
      trim: true,
      maxlength: 120
    },

    // Academic calendar fields
    category: {
      type: String,
      default: ""
    },
    date: {
      type: String,
      default: ""
    },
    endDate: {
      type: String,
      default: ""
    },
    description: {
      type: String,
      default: ""
    },

    // Class reschedule fields
    course: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Course",
      default: null
    },
    courseCode: {
      type: String,
      default: ""
    },
    courseTitle: {
      type: String,
      default: ""
    },
    section: {
      type: String,
      default: ""
    },
    oldDate: {
      type: String,
      default: ""
    },
    oldStart: {
      type: String,
      default: ""
    },
    oldEnd: {
      type: String,
      default: ""
    },
    newDate: {
      type: String,
      default: ""
    },
    newStart: {
      type: String,
      default: ""
    },
    newEnd: {
      type: String,
      default: ""
    },
    reason: {
      type: String,
      default: ""
    },

    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true
    }
  },
  { timestamps: true }
);

academicUpdateSchema.index({ kind: 1, date: 1 });
academicUpdateSchema.index({ kind: 1, course: 1, section: 1 });

module.exports = mongoose.model("AcademicUpdate", academicUpdateSchema);