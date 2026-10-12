const express = require("express");
const Assignment = require("../models/Assignment");
const { protect, authorize } = require("../middleware/authMiddleware");

const router = express.Router();

router.post("/", protect, authorize("faculty", "admin"), async (req, res) => {
  try {
    const { title, instructions, course, deadline } = req.body;

    const assignment = await Assignment.create({
      title,
      instructions,
      course,
      deadline,
      createdBy: req.user._id
    });

    res.status(201).json(assignment);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

router.get("/", protect, async (req, res) => {
  try {
    const assignments = await Assignment.find()
      .populate("course", "title code")
      .populate("createdBy", "name email")
      .populate("submissions.student", "name email studentId")
      .sort({ createdAt: -1 });

    res.json(assignments);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

router.post("/:id/submit", protect, authorize("student"), async (req, res) => {
  try {
    const { text } = req.body;

    const assignment = await Assignment.findById(req.params.id);

    if (!assignment) {
      return res.status(404).json({ message: "Assignment not found." });
    }

    assignment.submissions.push({
      student: req.user._id,
      text
    });

    await assignment.save();

    res.json({ message: "Assignment submitted successfully.", assignment });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

module.exports = router;
