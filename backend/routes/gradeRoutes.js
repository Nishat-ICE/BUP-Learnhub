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
router.get("/submissions", protect, authorize("faculty"), async (req, res) => {
  try {
    const ownedCourseIds = await Course.distinct(
      "_id",
      { faculty: req.user._id }
    );

    const assignments = await Assignment.find({ course: { $in: ownedCourseIds } })
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
router.put("/:assignmentId/:submissionId", protect, authorize("faculty"), async (req, res) => {
  try {
    const { grade, feedback } = req.body;

    const assignment = await Assignment.findById(req.params.assignmentId);
    if (!assignment) return res.status(404).json({ message: "Assignment not found." });

        const course = await Course.findById(assignment.course)
      .select("faculty");

    if (
      !course ||
      String(course.faculty) !== String(req.user._id)
    ) {
      return res.status(403).json({
        message: "Only this course's faculty can grade submissions."
      });
    }

    const mark = Number(grade);

    if (
      grade === null ||
      grade === undefined ||
      String(grade).trim() === "" ||
      !Number.isFinite(mark) ||
      mark < 0 ||
      mark > 100
    ) {
      return res.status(400).json({
        message: "Marks must be between 0 and 100."
      });
    }
    const submission = assignment.submissions.id(req.params.submissionId);
    if (!submission) return res.status(404).json({ message: "Submission not found." });

    submission.grade = mark;
    submission.feedback = feedback || "";

    await assignment.save();

    res.json({ message: "Grade published successfully." });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});


// Faculty: consolidated marksheet ONLY for courses owned by the logged-in faculty
router.get("/marksheet", protect, authorize("faculty"), async (req, res) => {
  try {
    const fs = require("fs");
    const path = require("path");
    const Quiz = fs.existsSync(path.join(__dirname, "../models/Quiz.js"))
      ? require("../models/Quiz")
      : null;
    const QuizAttempt = fs.existsSync(path.join(__dirname, "../models/QuizAttempt.js"))
      ? require("../models/QuizAttempt")
      : null;
    const TheoryQuiz = fs.existsSync(path.join(__dirname, "../models/TheoryQuiz.js"))
      ? require("../models/TheoryQuiz")
      : null;
    const TheoryAttempt = fs.existsSync(path.join(__dirname, "../models/TheoryAttempt.js"))
      ? require("../models/TheoryAttempt")
      : null;

    // Strictly fetch only courses created/owned by this faculty
    const courses = await Course.find({ faculty: req.user._id })
      .populate("students", "name email studentId section department")
      .sort({ createdAt: -1 })
      .lean();

    const courseIds = courses.map((c) => c._id);

    const assignments = await Assignment.find({ course: { $in: courseIds } })
      .populate("submissions.student", "name email studentId section department")
      .sort({ createdAt: 1 })
      .lean();

    const mcqQuizzes = Quiz
      ? await Quiz.find({ course: { $in: courseIds } }).sort({ createdAt: 1 }).lean()
      : [];
    const mcqIds = mcqQuizzes.map((q) => q._id);
    const mcqAttempts = QuizAttempt && mcqIds.length
      ? await QuizAttempt.find({
          quiz: { $in: mcqIds },
          $or: [
            { status: { $in: ["submitted", "expired"] } },
            { status: { $exists: false } }
          ]
        })
          .populate("student", "name email studentId section department")
          .lean()
      : [];

    const theoryQuizzes = TheoryQuiz
      ? await TheoryQuiz.find({ course: { $in: courseIds } }).sort({ createdAt: 1 }).lean()
      : [];
    const theoryIds = theoryQuizzes.map((q) => q._id);
    const theoryAttempts = TheoryAttempt && theoryIds.length
      ? await TheoryAttempt.find({
          theoryQuiz: { $in: theoryIds },
          status: { $in: ["submitted", "expired"] }
        })
          .populate("student", "name email studentId section department")
          .lean()
      : [];

    const result = courses.map((course) => {
      const cId = String(course._id);

      const courseAssignments = assignments.filter(
        (a) => String(a.course) === cId
      );
      const courseMcq = mcqQuizzes.filter((q) => String(q.course) === cId);
      const courseTheory = theoryQuizzes.filter((q) => String(q.course) === cId);

      const studentMap = new Map();
      const registerStudent = (stu) => {
        if (!stu || !stu._id) return;
        const sId = String(stu._id);
        if (!studentMap.has(sId)) {
          studentMap.set(sId, {
            _id: sId,
            name: stu.name || "Unknown",
            studentId: stu.studentId || "-",
            email: stu.email || "-",
            section: stu.section || "-"
          });
        }
      };

      (course.students || []).forEach(registerStudent);
      courseAssignments.forEach((a) =>
        (a.submissions || []).forEach((s) => registerStudent(s.student))
      );
      mcqAttempts
        .filter((att) => String(att.course) === cId)
        .forEach((att) => registerStudent(att.student));
      theoryAttempts
        .filter((att) => String(att.course) === cId)
        .forEach((att) => registerStudent(att.student));

      const quizColumns = [
        ...courseMcq.map((q) => ({
          _id: String(q._id),
          title: q.title,
          kind: "MCQ",
          maxScore: (q.questions || []).reduce((sum, item) => sum + (Number(item.points) || 0), 0)
        })),
        ...courseTheory.map((q) => ({
          _id: String(q._id),
          title: q.title,
          kind: "Theory",
          maxScore: (q.questions || []).reduce((sum, item) => sum + (Number(item.points) || 0), 0)
        }))
      ];

      const assignmentColumns = courseAssignments.map((a) => ({
        _id: String(a._id),
        title: a.title
      }));

      const students = Array.from(studentMap.values()).map((stu) => {
        const assignmentMarks = {};
        let assignmentTotal = 0;

        courseAssignments.forEach((a) => {
          const subs = (a.submissions || []).filter(
            (s) => String(s.student?._id || s.student) === stu._id
          );
          const gradedSub = subs.find(
            (s) => typeof s.grade === "number" && Number.isFinite(s.grade)
          );
          const chosen = gradedSub || subs[subs.length - 1] || null;

          if (chosen && typeof chosen.grade === "number" && Number.isFinite(chosen.grade)) {
            assignmentMarks[String(a._id)] = chosen.grade;
            assignmentTotal += chosen.grade;
          } else if (chosen) {
            assignmentMarks[String(a._id)] = "Pending";
          } else {
            assignmentMarks[String(a._id)] = null;
          }
        });

        const quizMarks = {};
        let quizTotal = 0;

        courseMcq.forEach((q) => {
          const att = mcqAttempts.find(
            (x) =>
              String(x.quiz) === String(q._id) &&
              String(x.student?._id || x.student) === stu._id
          );
          if (att && typeof att.score === "number") {
            quizMarks[String(q._id)] = att.score;
            quizTotal += att.score;
          } else {
            quizMarks[String(q._id)] = null;
          }
        });

        courseTheory.forEach((q) => {
          const att = theoryAttempts.find(
            (x) =>
              String(x.theoryQuiz) === String(q._id) &&
              String(x.student?._id || x.student) === stu._id
          );
          if (att && typeof att.score === "number") {
            quizMarks[String(q._id)] = att.score;
            quizTotal += att.score;
          } else {
            quizMarks[String(q._id)] = null;
          }
        });

        return {
          ...stu,
          assignmentMarks,
          assignmentTotal,
          quizMarks,
          quizTotal,
          grandTotal: assignmentTotal + quizTotal
        };
      });

      students.sort((a, b) =>
        String(a.studentId).localeCompare(String(b.studentId), undefined, {
          numeric: true
        })
      );

      return {
        courseId: cId,
        code: course.code,
        title: course.title,
        assignments: assignmentColumns,
        quizzes: quizColumns,
        students
      };
    });

    return res.json({
      facultyName: req.user.name,
      generatedAt: new Date().toISOString(),
      courses: result
    });
  } catch (error) {
    console.error("Marksheet error:", error);
    return res.status(500).json({ message: "Could not generate marksheet." });
  }
});

module.exports = router;