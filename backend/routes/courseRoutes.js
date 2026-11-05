const express = require("express");
const fs = require("fs");
const path = require("path");
const mongoose = require("mongoose");
const Course = require("../models/Course");
const User = require("../models/User");
const Assignment = require("../models/Assignment");
const Announcement = require("../models/Announcement");
const { protect, authorize } = require("../middleware/authMiddleware");
const {
  sameDepartment,
  getDepartmentCourseIds
} = require("../services/departmentScope");

const router = express.Router();

const canManage = (course, user) =>
  (user.role === "staff" &&
    sameDepartment(
      course.department || course.faculty?.department,
      user.department
    )) ||
  (user.role === "faculty" &&
    String(course.faculty?._id || course.faculty) === String(user._id));

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

async function resolveCourseAssignment(req, res) {
  // If Faculty is creating/editing:
  // - Faculty is automatically req.user
  // - Department comes from the form selection (or defaults to faculty's department)
  if (req.user.role === "faculty") {
    const selectedDept =
      typeof req.body?.department === "string" && req.body.department.trim()
        ? req.body.department.trim()
        : req.user.department || "ICT";

    return {
      facultyUser: req.user,
      courseDepartment: selectedDept
    };
  }

  // If Staff is creating/editing:
  // - Department is strictly Staff's registered department
  // - Faculty is looked up by the email entered by Staff (any department allowed)
  const rawEmail =
    typeof req.body?.facultyEmail === "string"
      ? req.body.facultyEmail.trim().toLowerCase()
      : "";

  if (!rawEmail) {
    res.status(400).json({
      message: "Please enter the Faculty email to assign this course."
    });
    return null;
  }

  const facultyUser = await User.findOne({
    email: rawEmail,
    role: "faculty",
    isActive: { $ne: false }
  });

  if (!facultyUser) {
    res.status(404).json({
      message: `No active Faculty account found with email "${rawEmail}".`
    });
    return null;
  }

  return {
    facultyUser,
    courseDepartment: req.user.department || "ICT"
  };
}

// GET /api/courses
// - Student: sees ONLY courses of their own registered department
// - Faculty: sees ONLY courses assigned to their own account
// - Staff: sees ONLY courses of their own registered department
router.get("/", protect, async (req, res) => {
  try {
    let filter = {};

    if (req.user.role === "faculty") {
      filter = { faculty: req.user._id };
    } else if (req.user.role === "student" || req.user.role === "staff") {
      const deptCourseIds = await getDepartmentCourseIds(req.user.department);
      filter = { _id: { $in: deptCourseIds } };
    }

    const courses = await Course.find(filter)
      .populate("faculty", "name email department")
      .populate("students", "_id")
      .sort({ createdAt: -1 });

    return res.json(courses);
  } catch (error) {
    return sendError(res, error);
  }
});

// POST /api/courses (Faculty & Staff)
router.post(
  "/",
  protect,
  authorize("faculty", "staff"),
  async (req, res) => {
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

      const resolved = await resolveCourseAssignment(req, res);
      if (!resolved) return;

      const course = await Course.create({
        title: title.trim(),
        code: code.trim().toUpperCase(),
        description: typeof description === "string" ? description.trim() : "",
        credit: creditValue,
        department: resolved.courseDepartment,
        faculty: resolved.facultyUser._id
      });

      const populated = await Course.findById(course._id)
        .populate("faculty", "name email department")
        .populate("students", "_id");

      return res.status(201).json(populated);
    } catch (error) {
      return sendError(res, error);
    }
  }
);

// PUT /api/courses/:id (Faculty own course & Staff own department course)
router.put(
  "/:id",
  protect,
  authorize("faculty", "staff"),
  async (req, res) => {
    try {
      if (!mongoose.isValidObjectId(req.params.id)) {
        return res.status(400).json({ message: "Invalid course ID." });
      }

      const course = await Course.findById(req.params.id).populate(
        "faculty",
        "department"
      );

      if (!course) {
        return res.status(404).json({ message: "Course not found." });
      }

      if (!canManage(course, req.user)) {
        return res.status(403).json({
          message: "You do not have permission to edit this course."
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

      const resolved = await resolveCourseAssignment(req, res);
      if (!resolved) return;

      course.title = title.trim();
      course.code = code.trim().toUpperCase();
      course.description =
        typeof description === "string" ? description.trim() : "";
      course.credit = creditValue;
      course.department = resolved.courseDepartment;
      course.faculty = resolved.facultyUser._id;

      await course.save();

      const populated = await Course.findById(course._id)
        .populate("faculty", "name email department")
        .populate("students", "_id");

      return res.json({
        message: "Course updated successfully.",
        course: populated
      });
    } catch (error) {
      return sendError(res, error);
    }
  }
);

// DELETE /api/courses/:id
router.delete(
  "/:id",
  protect,
  authorize("faculty", "staff"),
  async (req, res) => {
    try {
      if (!mongoose.isValidObjectId(req.params.id)) {
        return res.status(400).json({ message: "Invalid course ID." });
      }

      const course = await Course.findById(req.params.id).populate(
        "faculty",
        "department"
      );

      if (!course) {
        return res.status(404).json({ message: "Course not found." });
      }

      if (!canManage(course, req.user)) {
        return res.status(403).json({
          message: "You do not have permission to delete this course."
        });
      }

      const QuizModel = fs.existsSync(path.join(__dirname, "../models/Quiz.js"))
        ? require("../models/Quiz")
        : null;
      const TheoryQuizModel = fs.existsSync(
        path.join(__dirname, "../models/TheoryQuiz.js")
      )
        ? require("../models/TheoryQuiz")
        : null;

      const [assignment, announcement, linkedQuiz, linkedTheory] =
        await Promise.all([
          Assignment.exists({ course: course._id }),
          Announcement.exists({ course: course._id }),
          QuizModel ? QuizModel.exists({ course: course._id }) : false,
          TheoryQuizModel
            ? TheoryQuizModel.exists({ course: course._id })
            : false
        ]);

      if (
        assignment ||
        announcement ||
        linkedQuiz ||
        linkedTheory ||
        course.materials?.length
      ) {
        return res.status(409).json({
          message:
            "This course has assignments, announcements, quizzes or materials. Remove its dependent content first."
        });
      }

      await course.deleteOne();
      return res.json({ message: "Course deleted successfully." });
    } catch (error) {
      return sendError(res, error);
    }
  }
);

// POST /api/courses/:id/enroll (Student can enroll ONLY in courses of their own department)
router.post("/:id/enroll", protect, authorize("student"), async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json({ message: "Invalid course ID." });
    }

    const course = await Course.findById(req.params.id).populate(
      "faculty",
      "department"
    );

    if (!course) {
      return res.status(404).json({ message: "Course not found." });
    }

    const courseDept = course.department || course.faculty?.department || "";
    if (!sameDepartment(courseDept, req.user.department)) {
      return res.status(403).json({
        message: "This course belongs to another department."
      });
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