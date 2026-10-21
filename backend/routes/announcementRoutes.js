const express = require("express");
const mongoose = require("mongoose");
const Announcement = require("../models/Announcement");
const Course = require("../models/Course");
const { protect, authorize } = require("../middleware/authMiddleware");

const router = express.Router();

const sendError = (res, error) => {
  if (error.name === "ValidationError" || error.name === "CastError") {
    return res.status(400).json({ message: error.message });
  }

  console.error(error);
  return res.status(500).json({ message: "Could not complete this request." });
};

async function validTargetCourse(req, res, courseId) {
  if (!courseId) return true;

  if (!mongoose.isValidObjectId(courseId)) {
    res.status(400).json({ message: "Invalid course ID." });
    return false;
  }

  const course = await Course.findById(courseId);

  if (!course) {
    res.status(404).json({ message: "Course not found." });
    return false;
  }

  if (
    req.user.role === "faculty" &&
    String(course.faculty) !== String(req.user._id)
  ) {
    res.status(403).json({
      message: "You can publish to your own course only."
    });
    return false;
  }

  return true;
}

router.get("/", protect, async (req, res) => {
  try {
    let filter = {};

    if (req.user.role === "student" || req.user.role === "faculty") {
      const courseFilter =
        req.user.role === "student"
          ? { students: req.user._id }
          : { faculty: req.user._id };

      const courses = await Course.find(courseFilter).select("_id");
      const ids = courses.map((course) => course._id);

      filter = {
        $or: [{ course: null }, { course: { $in: ids } }]
      };
    }

    const announcements = await Announcement.find(filter)
      .populate("course", "title code")
      .populate("createdBy", "name role")
      .sort({ createdAt: -1 });

    return res.json(announcements);
  } catch (error) {
    return sendError(res, error);
  }
});

router.post(
  "/",
  protect,
  authorize("faculty", "staff"),
  async (req, res) => {
    try {
      const { title, message, course } = req.body;

      if (
        typeof title !== "string" ||
        !title.trim() ||
        typeof message !== "string" ||
        !message.trim()
      ) {
        return res.status(400).json({
          message: "Title and message are required."
        });
      }

      if (!(await validTargetCourse(req, res, course))) return;

      const announcement = await Announcement.create({
        title: title.trim(),
        message: message.trim(),
        course: course || null,
        createdBy: req.user._id
      });

      return res.status(201).json(announcement);
    } catch (error) {
      return sendError(res, error);
    }
  }
);

router.put(
  "/:id",
  protect,
  authorize("faculty", "staff"),
  async (req, res) => {
    try {
      if (!mongoose.isValidObjectId(req.params.id)) {
        return res.status(400).json({ message: "Invalid announcement ID." });
      }

      const announcement = await Announcement.findById(req.params.id);

      if (!announcement) {
        return res.status(404).json({
          message: "Announcement not found."
        });
      }

      if (
        req.user.role !== "admin" &&
        String(announcement.createdBy) !== String(req.user._id)
      ) {
        return res.status(403).json({
          message: "You can edit only your own announcement."
        });
      }

      const { title, message, course } = req.body;

      if (
        typeof title !== "string" ||
        !title.trim() ||
        typeof message !== "string" ||
        !message.trim()
      ) {
        return res.status(400).json({
          message: "Title and message are required."
        });
      }

      if (!(await validTargetCourse(req, res, course))) return;

      announcement.title = title.trim();
      announcement.message = message.trim();
      announcement.course = course || null;

      await announcement.save();

      return res.json({
        message: "Announcement updated successfully.",
        announcement
      });
    } catch (error) {
      return sendError(res, error);
    }
  }
);

router.delete(
  "/:id",
  protect,
  authorize("faculty", "staff"),
  async (req, res) => {
    try {
      if (!mongoose.isValidObjectId(req.params.id)) {
        return res.status(400).json({ message: "Invalid announcement ID." });
      }

      const announcement = await Announcement.findById(req.params.id);

      if (!announcement) {
        return res.status(404).json({
          message: "Announcement not found."
        });
      }

      if (
        req.user.role !== "admin" &&
        String(announcement.createdBy) !== String(req.user._id)
      ) {
        return res.status(403).json({
          message: "You can delete only your own announcement."
        });
      }

      await announcement.deleteOne();
      return res.json({ message: "Announcement deleted successfully." });
    } catch (error) {
      return sendError(res, error);
    }
  }
);

module.exports = router;