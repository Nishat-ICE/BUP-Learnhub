const express = require("express");
const mongoose = require("mongoose");
const Course = require("../models/Course");
const Assignment = require("../models/Assignment");
const Announcement = require("../models/Announcement");
const { protect, authorize } = require("../middleware/authMiddleware");

const router = express.Router();

const canManage = (course, user) =>
  user.role === "admin" ||
  (user.role === "faculty" &&
    String(course.faculty) === String(user._id));

const sendError = (res, error) => {
  if (error.code === 11000) {
    return res.status(409).json({ message: "This course code already exists." });
  }

  if (error.name === "ValidationError" || error.name === "CastError") {
    return res.status(400).json({ message: error.message });
  }

  console.error(error);
  return res.status(500).json({ message: "Could not complete this request." });
};

router.get("/", protect, async (req, res) => {
  try {
    const courses = await Course.find()
      .populate("faculty", "name email")
      .populate("students", "_id")
      .sort({ createdAt: -1 });

    return res.json(courses);
  } catch (error) {
    return sendError(res, error);
  }
});

router.post("/", protect, authorize("faculty", "admin"), async (req, res) => {
  try {
    const { title, code, description, credit } = req.body;

    if (
      typeof title !== "string" ||
      !title.trim() ||
      typeof code !== "string" ||
      !code.trim()
    ) {
      return res.status(400).json({
        message: "Course title and code are required."
      });
    }

    const creditValue = credit === "" || credit == null ? 3 : Number(credit);

    if (!Number.isFinite(creditValue) || creditValue <= 0 || creditValue > 8) {
      return res.status(400).json({
        message: "Credit must be greater than 0 and at most 8."
      });
    }

    const course = await Course.create({
      title: title.trim(),
      code: code.trim().toUpperCase(),
      description: typeof description === "string" ? description.trim() : "",
      credit: creditValue,
      faculty: req.user._id
    });

    return res.status(201).json(course);
  } catch (error) {
    return sendError(res, error);
  }
});

router.put("/:id", protect, authorize("faculty", "admin"), async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json({ message: "Invalid course ID." });
    }

    const course = await Course.findById(req.params.id);

    if (!course) {
      return res.status(404).json({ message: "Course not found." });
    }

    if (!canManage(course, req.user)) {
      return res.status(403).json({
        message: "You can edit only your own course."
      });
    }

    const { title, code, description, credit } = req.body;

    if (
      typeof title !== "string" ||
      !title.trim() ||
      typeof code !== "string" ||
      !code.trim()
    ) {
      return res.status(400).json({
        message: "Course title and code are required."
      });
    }

    const creditValue = Number(credit);

    if (!Number.isFinite(creditValue) || creditValue <= 0 || creditValue > 8) {
      return res.status(400).json({ message: "Invalid course credit." });
    }

    course.title = title.trim();
    course.code = code.trim().toUpperCase();
    course.description =
      typeof description === "string" ? description.trim() : "";
    course.credit = creditValue;

    await course.save();
    return res.json({ message: "Course updated successfully.", course });
  } catch (error) {
    return sendError(res, error);
  }
});

router.delete("/:id", protect, authorize("faculty", "admin"), async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json({ message: "Invalid course ID." });
    }

    const course = await Course.findById(req.params.id);

    if (!course) {
      return res.status(404).json({ message: "Course not found." });
    }

    if (!canManage(course, req.user)) {
      return res.status(403).json({
        message: "You can delete only your own course."
      });
    }

    const [assignment, announcement] = await Promise.all([
      Assignment.exists({ course: course._id }),
      Announcement.exists({ course: course._id })
    ]);

    if (assignment || announcement || course.materials?.length) {
      return res.status(409).json({
        message:
          "This course has assignments, announcements or materials. Remove its dependent content first. Submitted work cannot be deleted."
      });
    }

    await course.deleteOne();
    return res.json({ message: "Course deleted successfully." });
  } catch (error) {
    return sendError(res, error);
  }
});

router.post("/:id/enroll", protect, authorize("student"), async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json({ message: "Invalid course ID." });
    }

    const course = await Course.findById(req.params.id);

    if (!course) {
      return res.status(404).json({ message: "Course not found." });
    }

    const enrolled = course.students.some(
      (id) => String(id) === String(req.user._id)
    );

    if (enrolled) {
      return res.json({ message: "Already enrolled.", course });
    }

    course.students.push(req.user._id);
    await course.save();

    return res.json({ message: "Enrolled successfully.", course });
  } catch (error) {
    return sendError(res, error);
  }
});

module.exports = router;