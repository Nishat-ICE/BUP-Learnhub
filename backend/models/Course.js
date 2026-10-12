const mongoose = require("mongoose");

const courseSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: true
    },

    code: {
      type: String,
      required: true,
      unique: true
    },

    description: String,

    credit: {
      type: Number,
      default: 3
    },

    faculty: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User"
    },

    students: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User"
      }
    ],

    materials: [
      {
        title: String,
        url: String,
        uploadedAt: {
          type: Date,
          default: Date.now
        }
      }
    ]
  },
  { timestamps: true }
);

module.exports = mongoose.model("Course", courseSchema);
