const express = require("express");
const Announcement = require("../models/Announcement");
const { protect, authorize } = require("../middleware/authMiddleware");

const router = express.Router();

router.post("/", protect, authorize("faculty", "staff", "admin"), async (req, res) => {
  try {
    const { title, message, course } = req.body;

    const announcement = await Announcement.create({
      title,
      message,
      course: course || null,
      createdBy: req.user._id
    });

    res.status(201).json(announcement);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

router.get("/", protect, async (req, res) => {
  try {
    const announcements = await Announcement.find()
      .populate("course", "title code")
      .populate("createdBy", "name role")
      .sort({ createdAt: -1 });

    res.json(announcements);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

module.exports = router;
