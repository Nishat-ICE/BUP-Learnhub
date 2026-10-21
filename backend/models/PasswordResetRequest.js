const mongoose = require("mongoose");

const schema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true
    },
    status: {
      type: String,
      enum: [
        "pending",
        "approved",
        "rejected",
        "completed",
        "expired"
      ],
      default: "pending",
      index: true
    },
    codeHash: {
      type: String,
      default: null,
      select: false
    },
    attempts: {
      type: Number,
      default: 0
    },
    approvedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null
    },
    approvedAt: Date,
    expiresAt: Date
  },
  { timestamps: true }
);

schema.index({ status: 1, createdAt: -1 });

module.exports = mongoose.model("PasswordResetRequest", schema);