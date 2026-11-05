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

    department: { type: String, default: "ICT", index: true },
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

const materialDocumentSchema = courseSchema.path("materials").schema;

materialDocumentSchema.add({
  category: {
    type: String,
    enum: ["lecture", "slides", "reading", "other"],
    default: "other"
  },
  description: { type: String, default: "" },
  storedName: { type: String, default: "" },
  originalName: { type: String, default: "" },
  mimeType: { type: String, default: "" },
  size: { type: Number, default: 0 },
  uploadedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    default: null
  }
});
module.exports = mongoose.model("Course", courseSchema);
