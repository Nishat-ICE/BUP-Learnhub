const express = require("express");
const Assignment = require("../models/Assignment");
const Course = require("../models/Course");
const { protect, authorize } = require("../middleware/authMiddleware");

const router = express.Router();

// Student: my grades + course progress
router.get("/my", protect, async (req, res) => {
  try {
    const userId = req.user._id.toString();

    const courses = await Course.find({ students: req.user._id }).populate("faculty", "name");
    const courseIds = courses.map((c) => c._id);

    const assignments = await Assignment.find({ course: { $in: courseIds } })
      .populate("course", "title code")
      .sort({ createdAt: -1 });

    const grades = [];

    const progress = courses.map((course) => {
      const list = assignments.filter(
        (a) => a.course && a.course._id.toString() === course._id.toString()
      );

      let submitted = 0;
      let graded = 0;
      let sum = 0;

      list.forEach((a) => {
        const sub = a.submissions.find((s) => s.student && s.student.toString() === userId);

        if (sub) {
          submitted++;
          const hasGrade = sub.grade !== null && sub.grade !== undefined;
          if (hasGrade) {
            graded++;
            sum += sub.grade;
          }
          grades.push({
            assignmentId: a._id,
            assignment: a.title,
            course: a.course.title,
            code: a.course.code,
            grade: hasGrade ? sub.grade : null,
            feedback: sub.feedback || "",
            submittedAt: sub.submittedAt
          });
        }
      });

      const total = list.length;

      return {
        courseId: course._id,
        title: course.title,
        code: course.code,
        faculty: course.faculty ? course.faculty.name : "Not assigned",
        totalAssignments: total,
        submitted,
        graded,
        average: graded ? Math.round(sum / graded) : null,
        percent: total ? Math.round((submitted / total) * 100) : 0
      };
    });

    res.json({ grades, progress });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Faculty/Admin: all submissions for grading
router.get("/submissions", protect, authorize("faculty", "admin"), async (req, res) => {
  try {
    const assignments = await Assignment.find()
      .populate("course", "title code")
      .populate("submissions.student", "name email studentId")
      .sort({ createdAt: -1 });

    const list = [];

    assignments.forEach((a) => {
      a.submissions.forEach((s) => {
        list.push({
          assignmentId: a._id,
          submissionId: s._id,
          assignment: a.title,
          course: a.course ? a.course.title : "",
          code: a.course ? a.course.code : "",
          student: s.student,
          text: s.text,
          grade: s.grade,
          feedback: s.feedback || "",
          submittedAt: s.submittedAt
        });
      });
    });

    res.json(list);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Faculty/Admin: grade a submission
router.put("/:assignmentId/:submissionId", protect, authorize("faculty", "admin"), async (req, res) => {
  try {
    const { grade, feedback } = req.body;

    const assignment = await Assignment.findById(req.params.assignmentId);
    if (!assignment) return res.status(404).json({ message: "Assignment not found." });

    const submission = assignment.submissions.id(req.params.submissionId);
    if (!submission) return res.status(404).json({ message: "Submission not found." });

    submission.grade = Number(grade);
    submission.feedback = feedback || "";

    await assignment.save();

    res.json({ message: "Grade published successfully." });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

module.exports = router;