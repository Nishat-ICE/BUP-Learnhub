const express = require("express");
const Course = require("../models/Course");
const { protect, authorize } = require("../middleware/authMiddleware");

const router = express.Router();

router.post("/", protect, authorize("faculty", "admin"), async (req, res) => {
  try {
    const { title, code, description, credit } = req.body;

    const course = await Course.create({
      title,
      code,
      description,
      credit,
      faculty: req.user._id
    });

    res.status(201).json(course);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

router.get("/", protect, async (req, res) => {
  try {
    const courses = await Course.find()
      .populate("faculty", "name email")
      .populate("students", "name email studentId")
      .sort({ createdAt: -1 });

    res.json(courses);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

router.post("/:id/enroll", protect, authorize("student"), async (req, res) => {
  try {
    const course = await Course.findById(req.params.id);

    if (!course) {
      return res.status(404).json({ message: "Course not found." });
    }

    const alreadyEnrolled = course.students.some(
      (id) => id.toString() === req.user._id.toString()
    );

    if (!alreadyEnrolled) {
      course.students.push(req.user._id);
      await course.save();
    }

    res.json({ message: "Course enrolled successfully.", course });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

module.exports = router;
