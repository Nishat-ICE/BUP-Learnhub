const mongoose = require("mongoose");

const slotEntrySchema = new mongoose.Schema(
  {
    day: { type: String, required: true },
    slot: { type: String, required: true },
    courseCode: { type: String, default: "" },
    courseTitle: { type: String, default: "" },
    facultyName: { type: String, default: "" },
    room: { type: String, default: "" }
  },
  { _id: false }
);

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
    kind: {
      type: String,
      enum: ["file", "generated"],
      default: "file"
    },
    slots: {
      type: [String],
      default: []
    },
    days: {
      type: [String],
      default: []
    },
    entries: {
      type: [slotEntrySchema],
      default: []
    },
    storedName: {
      type: String,
      default: ""
    },
    originalName: {
      type: String,
      default: ""
    },
    mimeType: {
      type: String,
      default: ""
    },
    size: {
      type: Number,
      default: 0
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