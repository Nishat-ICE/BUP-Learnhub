const mongoose = require("mongoose");

const schema = new mongoose.Schema(
  {
    actor: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true
    },
    action: { type: String, required: true },
    target: { type: String, default: "" },
    detail: { type: String, default: "" }
  },
  { timestamps: true }
);

module.exports = mongoose.model("LeadershipAudit", schema);