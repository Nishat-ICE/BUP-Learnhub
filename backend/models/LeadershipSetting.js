const mongoose = require("mongoose");

const schema = new mongoose.Schema(
  {
    key: { type: String, required: true, unique: true },
    value: { type: Boolean, required: true },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" }
  },
  { timestamps: true }
);

module.exports = mongoose.model("LeadershipSetting", schema);