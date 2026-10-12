const mongoose = require("mongoose");

const assignmentSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: true
    },

    instructions: String,

    course: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Course",
      required: true
    },

    deadline: Date,

    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User"
    },

    submissions: [
      {
        student: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "User"
        },

        text: String,

        grade: {
          type: Number,
          default: null
        },

        feedback: {
          type: String,
          default: ""
        },

        submittedAt: {
          type: Date,
          default: Date.now
        }
      }
    ]
  },
  { timestamps: true }
);

module.exports = mongoose.model("Assignment", assignmentSchema);
