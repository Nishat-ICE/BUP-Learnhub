const express = require("express");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const mongoose = require("mongoose");
const multer = require("multer");
const Assignment = require("../models/Assignment");
const Course = require("../models/Course");
const { protect, authorize } = require("../middleware/authMiddleware");

const router = express.Router();
const uploadDir = path.join(__dirname, "..", "private_uploads", "assignments");
fs.mkdirSync(uploadDir, { recursive: true });

const maxSize = 10 * 1024 * 1024;
const mimeTypes = {
  ".pdf": "application/pdf",
  ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png"
};

const upload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, callback) => callback(null, uploadDir),
    filename: (_req, file, callback) => {
      const ext = path.extname(file.originalname).toLowerCase();
      callback(null, crypto.randomUUID() + ext);
    }
  }),
  fileFilter: (_req, file, callback) => {
    const ext = path.extname(file.originalname).toLowerCase();

    if (!mimeTypes[ext]) {
      return callback(new Error("Only PDF, DOCX, JPG and PNG files are allowed."));
    }

    callback(null, true);
  },
  limits: {
    fileSize: maxSize,
    files: 1,
    fields: 1,
    parts: 2,
    fieldSize: 10000
  }
});

function receiveFile(req, res, next) {
  upload.single("file")(req, res, (error) => {
    if (!error) return next();

    return res.status(error.code === "LIMIT_FILE_SIZE" ? 413 : 400).json({
      message:
        error.code === "LIMIT_FILE_SIZE"
          ? "File must be 10 MB or smaller."
          : error.message
    });
  });
}

function safeOriginalName(name) {
  return path.win32
    .basename(name)
    .replace(/[\x00-\x1f\x7f<>:"/\\|?*]/g, "_")
    .slice(0, 120);
}

async function checkFile(file) {
  const ext = path.extname(file.originalname).toLowerCase();
  const data = await fs.promises.readFile(file.path);

  if (ext === ".pdf") {
    return data.subarray(0, 5).equals(Buffer.from("%PDF-"));
  }

  if (ext === ".png") {
    return data.subarray(0, 8).equals(
      Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])
    );
  }

  if (ext === ".jpg" || ext === ".jpeg") {
    return data[0] === 255 && data[1] === 216 && data[2] === 255;
  }

  if (ext === ".docx") {
    return (
      data.subarray(0, 4).equals(Buffer.from([80, 75, 3, 4])) &&
      data.includes(Buffer.from("[Content_Types].xml")) &&
      data.includes(Buffer.from("word/document.xml"))
    );
  }

  return false;
}

async function getAssignmentAndCourse(id) {
  if (!mongoose.isValidObjectId(id)) return null;
  const assignment = await Assignment.findById(id);
  if (!assignment) return null;
  const course = await Course.findById(assignment.course);
  if (!course) return null;
  return { assignment, course };
}

function canManage(course, user) {
  return user.role === "faculty" &&
    String(course.faculty) === String(user._id);
}

// Student: submit optional text and/or one attached file.
router.post(
  "/:assignmentId/submit",
  protect,
  authorize("student"),
  receiveFile,
  async (req, res) => {
    let keepFile = false;

    try {
      const result = await getAssignmentAndCourse(req.params.assignmentId);

      if (!result) {
        return res.status(404).json({ message: "Assignment not found." });
      }

      const { assignment, course } = result;
      const text =
        typeof req.body.text === "string" ? req.body.text.trim() : "";

      if (!text && !req.file) {
        return res.status(400).json({
          message: "Add submission text or select a file."
        });
      }

      const enrolled = course.students.some(
        (id) => String(id) === String(req.user._id)
      );

      if (!enrolled) {
        return res.status(403).json({
          message: "Enroll in the course before submitting."
        });
      }

      const submitted = assignment.submissions.some(
        (item) => String(item.student) === String(req.user._id)
      );

      if (submitted) {
        return res.status(409).json({
          message: "You have already submitted this assignment."
        });
      }

      if (req.file && !(await checkFile(req.file))) {
        return res.status(400).json({
          message: "File content does not match an allowed file format."
        });
      }

      const submission = {
        student: req.user._id,
        text
      };

      if (req.file) {
        const ext = path.extname(req.file.originalname).toLowerCase();

        submission.attachment = {
          storedName: req.file.filename,
          originalName: safeOriginalName(req.file.originalname),
          mimeType: mimeTypes[ext],
          size: req.file.size
        };
      }

      assignment.submissions.push(submission);
      await assignment.save();

      keepFile = true;
      return res.status(201).json({
        message: "Assignment submitted successfully."
      });
    } catch (error) {
      console.error(error);
      return res.status(500).json({
        message: "Could not submit assignment."
      });
    } finally {
      if (req.file && !keepFile) {
        await fs.promises.unlink(req.file.path).catch(() => {});
      }
    }
  }
);

// Faculty sees submissions only for their own course; admin sees all.
router.get(
  "/:assignmentId/submissions",
  protect,
  authorize("faculty"),
  async (req, res) => {
    try {
      const result = await getAssignmentAndCourse(req.params.assignmentId);

      if (!result) {
        return res.status(404).json({ message: "Assignment not found." });
      }

      if (!canManage(result.course, req.user)) {
        return res.status(403).json({ message: "Access denied." });
      }

      await result.assignment.populate(
        "submissions.student",
        "name email studentId"
      );

      return res.json(
        result.assignment.submissions.map((item) => ({
          _id: item._id,
          student: item.student,
          text: item.text,
          grade: item.grade,
          submittedAt: item.submittedAt,
          attachment: item.attachment?.storedName
            ? {
                originalName: item.attachment.originalName,
                size: item.attachment.size
              }
            : null
        }))
      );
    } catch (error) {
      console.error(error);
      return res.status(500).json({
        message: "Could not load submissions."
      });
    }
  }
);

// Files are private: only the student who submitted, owning faculty or admin.
router.get(
  "/:assignmentId/submissions/:submissionId/file",
  protect,
  async (req, res) => {
    try {
      const result = await getAssignmentAndCourse(req.params.assignmentId);

      if (!result || !mongoose.isValidObjectId(req.params.submissionId)) {
        return res.status(404).json({ message: "File not found." });
      }

      const submission = result.assignment.submissions.id(
        req.params.submissionId
      );

      if (!submission?.attachment?.storedName) {
        return res.status(404).json({ message: "File not found." });
      }

      const ownsSubmission =
        req.user.role === "student" &&
        String(submission.student) === String(req.user._id);

      if (!ownsSubmission && !canManage(result.course, req.user)) {
        return res.status(403).json({ message: "Access denied." });
      }

      const storedName = submission.attachment.storedName;

      if (!/^[0-9a-f-]{36}\.(pdf|docx|jpg|jpeg|png)$/i.test(storedName)) {
        return res.status(404).json({ message: "File not found." });
      }

      res.setHeader("Cache-Control", "private, no-store");
      res.setHeader("X-Content-Type-Options", "nosniff");

      return res.download(
        path.join(uploadDir, storedName),
        submission.attachment.originalName,
        (error) => {
          if (error && !res.headersSent) {
            res.status(404).json({ message: "File is unavailable." });
          }
        }
      );
    } catch (error) {
      console.error(error);
      return res.status(500).json({
        message: "Could not download file."
      });
    }
  }
);

module.exports = router;