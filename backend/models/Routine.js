const mongoose = require("mongoose");

const routineSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: true,
      trim: true,
      maxlength: 120
    },
    description: {
      type: String,
      default: "",
      maxlength: 700
    },
    department: {
      type: String,
      required: true
    },
    departmentKey: {
      type: String,
      required: true,
      index: true
    },
    // Kept internally for compatibility with old routines.
    // New uploads are always available to all sections.
    section: {
      type: String,
      default: "All"
    },
    sectionKey: {
      type: String,
      default: "ALL",
      index: true
    },
    term: {
      type: String,
      default: "",
      maxlength: 80
    },
    storedName: {
      type: String,
      required: true
    },
    originalName: {
      type: String,
      required: true
    },
    mimeType: {
      type: String,
      required: true
    },
    size: {
      type: Number,
      required: true
    },
    isPublished: {
      type: Boolean,
      default: true,
      index: true
    },
    uploadedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true
    },
    updatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null
    }
  },
  { timestamps: true }
);

routineSchema.index({
  isPublished: 1,
  departmentKey: 1,
  updatedAt: -1
});

module.exports = mongoose.model("Routine", routineSchema);