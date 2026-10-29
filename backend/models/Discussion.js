const mongoose = require("mongoose");

const replySchema = new mongoose.Schema(
  {
    author: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true
    },
    body: {
      type: String,
      required: true,
      maxlength: 1200
    },
    removedAt: {
      type: Date,
      default: null
    },
    removedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null
    }
  },
  { timestamps: true }
);

const discussionSchema = new mongoose.Schema(
  {
    course: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Course",
      required: true,
      index: true
    },
    author: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true
    },
    title: {
      type: String,
      required: true,
      maxlength: 120
    },
    body: {
      type: String,
      required: true,
      maxlength: 2000
    },
    removedAt: {
      type: Date,
      default: null
    },
    removedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null
    },
    lastActivityAt: {
      type: Date,
      default: Date.now
    },
    replies: {
      type: [replySchema],
      default: []
    }
  },
  { timestamps: true }
);

discussionSchema.index({
  course: 1,
  lastActivityAt: -1
});

module.exports = mongoose.model(
  "Discussion",
  discussionSchema
);