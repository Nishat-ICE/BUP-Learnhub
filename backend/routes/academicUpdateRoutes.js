const express = require("express");
const mongoose = require("mongoose");
const Course = require("../models/Course");
const AcademicUpdate = require("../models/AcademicUpdate");
const { protect, authorize } = require("../middleware/authMiddleware");

const router = express.Router();

router.use(protect);

router.use((req, res, next) => {
  if (req.user.isActive === false) {
    return res.status(403).json({ message: "Account is inactive." });
  }

  next();
});

const text = (value) =>
  typeof value === "string" ? value.trim() : "";

function fail(message, status = 400) {
  const error = new Error(message);
  error.status = status;
  throw error;
}

function validDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;

  const parsed = new Date(`${value}T00:00:00Z`);

  return (
    !Number.isNaN(parsed.getTime()) &&
    parsed.toISOString().slice(0, 10) === value
  );
}

function validTime(value) {
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(value);
}

function handleError(res, error) {
  if (error.status) {
    return res.status(error.status).json({ message: error.message });
  }

  if (error.name === "ValidationError") {
    return res.status(400).json({ message: error.message });
  }

  console.error("Academic update error:", error);

  return res.status(500).json({
    message: "Could not complete the academic update request."
  });
}

async function validatedData(body) {
  const kind = text(body?.kind);

  if (kind === "calendar") {
    const title = text(body.title);
    const category = text(body.category);
    const date = text(body.date);
    const endDate = text(body.endDate);
    const description = text(body.description);

    const categories = [
      "semester",
      "exam",
      "deadline",
      "holiday",
      "other"
    ];

    if (!title || title.length > 120) {
      fail("Calendar title must be between 1 and 120 characters.");
    }

    if (!categories.includes(category)) {
      fail("Select a valid event category.");
    }

    if (!validDate(date) || (endDate && !validDate(endDate))) {
      fail("Enter valid calendar dates.");
    }

    if (endDate && endDate < date) {
      fail("End date cannot be before start date.");
    }

    if (description.length > 1500) {
      fail("Description is too long.");
    }

    return {
      kind: "calendar",
      title,
      category,
      date,
      endDate,
      description,
      course: null,
      courseCode: "",
      courseTitle: "",
      section: "",
      oldDate: "",
      oldStart: "",
      oldEnd: "",
      newDate: "",
      newStart: "",
      newEnd: "",
      reason: ""
    };
  }

  if (kind === "reschedule") {
    const courseId = text(body.course);

    if (!mongoose.isValidObjectId(courseId)) {
      fail("Select a valid course.");
    }

    const course = await Course.findById(courseId);

    if (!course) {
      fail("Course not found.", 404);
    }

    const rawSection = text(body.section);
    const section =
      rawSection.toLowerCase() === "all"
        ? "All"
        : rawSection.toUpperCase();

    const oldDate = text(body.oldDate);
    const newDate = text(body.newDate);
    const oldStart = text(body.oldStart);
    const oldEnd = text(body.oldEnd);
    const newStart = text(body.newStart);
    const newEnd = text(body.newEnd);
    const reason = text(body.reason);

    if (!section || section.length > 24) {
      fail('Enter a section, for example "B" or "All".');
    }

    if (!validDate(oldDate) || !validDate(newDate)) {
      fail("Enter valid old and new class dates.");
    }

    if (
      !validTime(oldStart) ||
      !validTime(oldEnd) ||
      !validTime(newStart) ||
      !validTime(newEnd)
    ) {
      fail("Enter all four class times in 24-hour format.");
    }

    if (oldEnd <= oldStart || newEnd <= newStart) {
      fail("Class end time must be after its start time.");
    }

    if (
      oldDate === newDate &&
      oldStart === newStart &&
      oldEnd === newEnd
    ) {
      fail("New class schedule must differ from the old schedule.");
    }

    if (reason.length > 700) {
      fail("Reason is too long.");
    }

    return {
      kind: "reschedule",
      title: `Class rescheduled: ${course.code}`,
      category: "",
      date: "",
      endDate: "",
      description: "",
      course: course._id,
      courseCode: course.code,
      courseTitle: course.title,
      section,
      oldDate,
      oldStart,
      oldEnd,
      newDate,
      newStart,
      newEnd,
      reason
    };
  }

  fail("Invalid academic update type.");
}

// Everyone logged in can read, but students/faculty only receive
// their relevant course reschedules. Calendar is university-wide.
router.get("/", async (req, res) => {
  try {
    const role = req.user.role;
    let filter = {};

    if (role === "student" || role === "faculty") {
      const courseFilter =
        role === "student"
          ? { students: req.user._id }
          : { faculty: req.user._id };

      const courses = await Course.find(courseFilter).select("_id");
      const courseIds = courses.map((course) => course._id);

      const rescheduleFilter = {
        kind: "reschedule",
        course: { $in: courseIds }
      };

      if (role === "student") {
        const section = text(req.user.section).toUpperCase();

        rescheduleFilter.section = {
          $in: section ? ["All", section] : ["All"]
        };
      }

      filter = {
        $or: [
          { kind: "calendar" },
          rescheduleFilter
        ]
      };
    }

    const updates = await AcademicUpdate.find(filter)
      .populate("course", "title code")
      .populate("createdBy", "name role")
      .sort({ createdAt: -1 });

    return res.json(updates);
  } catch (error) {
    return handleError(res, error);
  }
});

router.post(
  "/",
  authorize("staff"),
  async (req, res) => {
    try {
      const data = await validatedData(req.body);

      const update = await AcademicUpdate.create({
        ...data,
        createdBy: req.user._id
      });

      return res.status(201).json({
        message: "Academic update published.",
        update
      });
    } catch (error) {
      return handleError(res, error);
    }
  }
);

router.put(
  "/:id",
  authorize("staff"),
  async (req, res) => {
    try {
      if (!mongoose.isValidObjectId(req.params.id)) {
        fail("Invalid update ID.");
      }

      const update = await AcademicUpdate.findById(req.params.id);

      if (!update) {
        fail("Academic update not found.", 404);
      }

      if (
        req.user.role !== "admin" &&
        String(update.createdBy) !== String(req.user._id)
      ) {
        fail("You can edit only your own academic update.", 403);
      }

      const data = await validatedData(req.body);

      if (data.kind !== update.kind) {
        fail("Changing the update type is not supported.");
      }

      update.set(data);
      await update.save();

      return res.json({
        message: "Academic update saved.",
        update
      });
    } catch (error) {
      return handleError(res, error);
    }
  }
);

router.delete(
  "/:id",
  authorize("staff"),
  async (req, res) => {
    try {
      if (!mongoose.isValidObjectId(req.params.id)) {
        fail("Invalid update ID.");
      }

      const update = await AcademicUpdate.findById(req.params.id);

      if (!update) {
        fail("Academic update not found.", 404);
      }

      if (
        req.user.role !== "admin" &&
        String(update.createdBy) !== String(req.user._id)
      ) {
        fail("You can delete only your own academic update.", 403);
      }

      await update.deleteOne();

      return res.json({
        message: "Academic update deleted."
      });
    } catch (error) {
      return handleError(res, error);
    }
  }
);

module.exports = router;