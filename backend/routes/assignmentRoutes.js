const express = require("express");
const mongoose = require("mongoose");
const Assignment = require("../models/Assignment");
const Course = require("../models/Course");
const { protect, authorize } = require("../middleware/authMiddleware");

const router = express.Router();

const canManage = (course, user) =>
  user.role === "admin" ||
  (user.role === "faculty" &&
    String(course.faculty) === String(user._id));

const sendError = (res, error) => {
  if (error.name === "ValidationError" || error.name === "CastError") {
    return res.status(400).json({ message: error.message });
  }

  console.error(error);
  return res.status(500).json({ message: "Could not complete this request." });
};

router.get("/", protect, async (req, res) => {
  try {
    let filter = {};

    if (req.user.role === "student" || req.user.role === "faculty") {
      const courseFilter =
        req.user.role === "student"
          ? { students: req.user._id }
          : { faculty: req.user._id };

      const courses = await Course.find(courseFilter).select("_id");
      filter = { course: { $in: courses.map((course) => course._id) } };
    }

    const assignments = await Assignment.find(filter)
      .populate("course", "title code faculty")
      .populate("createdBy", "name")
      .sort({ createdAt: -1 });

    if (req.user.role === "student") {
      const own = assignments.map((assignment) => {
        const item = assignment.toObject();
        item.submissions = item.submissions.filter(
          (submission) =>
            String(submission.student) === String(req.user._id)
        );
        return item;
      });

      return res.json(own);
    }

    if (req.user.role === "staff" || req.user.role === "authority") {
      const summaries = assignments.map((assignment) => {
        const item = assignment.toObject();
        item.submissionCount = item.submissions.length;
        item.submissions = [];
        return item;
      });

      return res.json(summaries);
    }

    return res.json(assignments);
  } catch (error) {
    return sendError(res, error);
  }
});

router.post("/", protect, authorize("faculty"), async (req, res) => {
  try {
    const { title, instructions, course: courseId, deadline } = req.body;

    if (typeof title !== "string" || !title.trim()) {
      return res.status(400).json({ message: "Assignment title is required." });
    }

    if (!mongoose.isValidObjectId(courseId)) {
      return res.status(400).json({ message: "Choose a valid course." });
    }

    const course = await Course.findById(courseId);

    if (!course) {
      return res.status(404).json({ message: "Course not found." });
    }

    if (!canManage(course, req.user)) {
      return res.status(403).json({
        message: "You can add assignments only to your own course."
      });
    }

    if (deadline && Number.isNaN(Date.parse(deadline))) {
      return res.status(400).json({ message: "Invalid deadline." });
    }

    const assignment = await Assignment.create({
      title: title.trim(),
      instructions:
        typeof instructions === "string" ? instructions.trim() : "",
      course: course._id,
      deadline: deadline ? new Date(deadline) : null,
      createdBy: req.user._id
    });

    return res.status(201).json(assignment);
  } catch (error) {
    return sendError(res, error);
  }
});

router.put("/:id", protect, authorize("faculty"), async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json({ message: "Invalid assignment ID." });
    }

    const assignment = await Assignment.findById(req.params.id);

    if (!assignment) {
      return res.status(404).json({ message: "Assignment not found." });
    }

    const originalCourse = await Course.findById(assignment.course);

    if (!originalCourse || !canManage(originalCourse, req.user)) {
      return res.status(403).json({
        message: "You cannot edit this assignment."
      });
    }

    if (assignment.submissions.length > 0) {
      return res.status(409).json({
        message: "An assignment with student submissions cannot be edited."
      });
    }

    const { title, instructions, course: courseId, deadline } = req.body;

    if (typeof title !== "string" || !title.trim()) {
      return res.status(400).json({ message: "Assignment title is required." });
    }

    if (!mongoose.isValidObjectId(courseId)) {
      return res.status(400).json({ message: "Choose a valid course." });
    }

    const newCourse = await Course.findById(courseId);

    if (!newCourse || !canManage(newCourse, req.user)) {
      return res.status(403).json({
        message: "You cannot move the assignment to this course."
      });
    }

    if (deadline && Number.isNaN(Date.parse(deadline))) {
      return res.status(400).json({ message: "Invalid deadline." });
    }

    assignment.title = title.trim();
    assignment.instructions =
      typeof instructions === "string" ? instructions.trim() : "";
    assignment.course = newCourse._id;
    assignment.deadline = deadline ? new Date(deadline) : null;

    await assignment.save();

    return res.json({
      message: "Assignment updated successfully.",
      assignment
    });
  } catch (error) {
    return sendError(res, error);
  }
});

router.delete("/:id", protect, authorize("faculty"), async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json({ message: "Invalid assignment ID." });
    }

    const assignment = await Assignment.findById(req.params.id);

    if (!assignment) {
      return res.status(404).json({ message: "Assignment not found." });
    }

    const course = await Course.findById(assignment.course);

    if (!course || !canManage(course, req.user)) {
      return res.status(403).json({
        message: "You cannot delete this assignment."
      });
    }

    if (assignment.submissions.length > 0) {
      return res.status(409).json({
        message:
          "This assignment has student submissions. It cannot be deleted because grades or academic work may be lost."
      });
    }

    await assignment.deleteOne();
    return res.json({ message: "Assignment deleted successfully." });
  } catch (error) {
    return sendError(res, error);
  }
});

router.post("/:id/submit", protect, authorize("student"), async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json({ message: "Invalid assignment ID." });
    }

    const assignment = await Assignment.findById(req.params.id);

    if (!assignment) {
      return res.status(404).json({ message: "Assignment not found." });
    }

    const course = await Course.findById(assignment.course);
    const enrolled = course?.students.some(
      (id) => String(id) === String(req.user._id)
    );

    if (!enrolled) {
      return res.status(403).json({
        message: "Enroll in the course before submitting."
      });
    }

    const alreadySubmitted = assignment.submissions.some(
      (submission) =>
        String(submission.student) === String(req.user._id)
    );

    if (alreadySubmitted) {
      return res.status(409).json({
        message: "You have already submitted this assignment."
      });
    }

    const text =
      typeof req.body.text === "string" ? req.body.text.trim() : "";

    if (!text) {
      return res.status(400).json({
        message: "Submission text or link is required."
      });
    }

    assignment.submissions.push({
      student: req.user._id,
      text
    });

    await assignment.save();
    return res.json({ message: "Assignment submitted successfully." });
  } catch (error) {
    return sendError(res, error);
  }
});

module.exports = router;