const path = require("path");
const fs = require("fs");
require("dotenv").config({ path: path.join(__dirname, "..", ".env") });

const mongoose = require("mongoose");
const User = require("../models/User");
const Course = require("../models/Course");
const Assignment = require("../models/Assignment");
const Quiz = require("../models/Quiz");
const QuizAttempt = require("../models/QuizAttempt");

const TheoryQuiz = fs.existsSync(path.join(__dirname, "../models/TheoryQuiz.js"))
  ? require("../models/TheoryQuiz")
  : null;
const TheoryAttempt = fs.existsSync(path.join(__dirname, "../models/TheoryAttempt.js"))
  ? require("../models/TheoryAttempt")
  : null;

(async () => {
  try {
    await mongoose.connect(process.env.MONGO_URI);

    // Find all seeded courses (from seedAllDepartments) + any ICT courses
    const courses = await Course.find()
      .populate("faculty", "name email department")
      .populate("students", "_id name email department");

    // Clean only previously auto-seeded activities (identified by [Seed] tag not needed; we clean by seeded course IDs where title matches our templates)
    const seededFaculties = await User.find({
      email: /^faculty\.[a-z]+[0-9]+@bup\.edu\.bd$/i
    }).select("_id");
    const seededFacIds = seededFaculties.map((f) => f._id);
    const seededCourses = await Course.find({ faculty: { $in: seededFacIds } }).select("_id");
    const seededCourseIds = seededCourses.map((c) => c._id);

    if (seededCourseIds.length > 0) {
      await Assignment.deleteMany({ course: { $in: seededCourseIds } });
      const oldQuizzes = await Quiz.find({ course: { $in: seededCourseIds } }).select("_id");
      await QuizAttempt.deleteMany({ quiz: { $in: oldQuizzes.map((q) => q._id) } });
      await Quiz.deleteMany({ course: { $in: seededCourseIds } });

      if (TheoryQuiz && TheoryAttempt) {
        const oldT = await TheoryQuiz.find({ course: { $in: seededCourseIds } }).select("_id");
        await TheoryAttempt.deleteMany({ theoryQuiz: { $in: oldT.map((t) => t._id) } });
        await TheoryQuiz.deleteMany({ course: { $in: seededCourseIds } });
      }
    }

    let assignCreated = 0;
    let assignSubs = 0;
    let mcqCreated = 0;
    let mcqSubs = 0;
    let theoryCreated = 0;
    let theorySubs = 0;

    const now = Date.now();
    const DAY = 24 * 60 * 60 * 1000;

    // Group courses by department
    const byDept = new Map();
    for (const c of courses) {
      const dept = c.faculty?.department || "ICT";
      if (!byDept.has(dept)) byDept.set(dept, []);
      byDept.get(dept).push(c);
    }

    for (const [deptName, deptCourses] of byDept.entries()) {
      const isICT =
        deptName.toUpperCase() === "ICT" ||
        deptName.toLowerCase().includes("information and communication");

      // ICT: all courses get full activities; Other depts: first 1-2 courses get activities
      const targetCourses = isICT ? deptCourses : deptCourses.slice(0, 2);

      for (let cIdx = 0; cIdx < targetCourses.length; cIdx++) {
        const course = targetCourses[cIdx];
        const students = course.students || [];
        const facId = course.faculty?._id;
        if (!facId || students.length === 0) continue;

        // --------------------------------------------------------
        // 1. ASSIGNMENTS (ICT gets 2 per course; other depts get 1)
        // --------------------------------------------------------
        const numAssignments = isICT ? 2 : 1;

        for (let aNum = 1; aNum <= numAssignments; aNum++) {
          const submissions = [];

          students.forEach((stu, sIdx) => {
            // In Assignment 2 of ICT, leave 1 student unsubmitted so Pending tasks > 0
            if (isICT && aNum === 2 && sIdx === students.length - 1) return;

            const isGradedSub = !(isICT && aNum === 2 && sIdx === 0);
            const score = 74 + ((cIdx * 7 + aNum * 5 + sIdx * 6) % 23); // 74 to 96

            submissions.push({
              student: stu._id,
              text: `Completed ${course.title} - Assignment ${aNum}. Attached analytical report and implementation notes.`,
              grade: isGradedSub ? score : null,
              feedback: isGradedSub
                ? score >= 85
                  ? "Excellent analytical work and clear presentation."
                  : "Good effort; review the edge-case analysis."
                : "",
              submittedAt: new Date(now - (4 - aNum) * DAY)
            });
            assignSubs++;
          });

          await Assignment.create({
            title:
              aNum === 1
                ? `${course.code}: Lab & Analytical Report 1`
                : `${course.code}: Case Study & Project Task 2`,
            instructions: `Complete the ${course.title} practical tasks, document your findings clearly, and submit before the deadline.`,
            course: course._id,
            deadline: new Date(now + (aNum === 1 ? 5 : 9) * DAY),
            createdBy: facId,
            submissions
          });
          assignCreated++;
        }

        // --------------------------------------------------------
        // 2. MCQ QUIZZES (ICT gets 2 per course: 1 published-results + 1 active; Others get 1)
        // --------------------------------------------------------
        const numMcq = isICT ? 2 : 1;

        for (let qNum = 1; qNum <= numMcq; qNum++) {
          const isCompletedQuiz = qNum === 1;

          const quizDoc = await Quiz.create({
            course: course._id,
            createdBy: facId,
            title:
              qNum === 1
                ? `${course.code} Assessment Quiz 1`
                : `${course.code} Mid-Term MCQ Quiz 2`,
            instructions: `Answer all multiple-choice questions on ${course.title} within the allotted time.`,
            closesAt: isCompletedQuiz
              ? new Date(now - 1 * DAY)
              : new Date(now + 7 * DAY),
            durationMinutes: 15,
            isPublished: true,
            resultsPublished: isCompletedQuiz,
            questions: [
              {
                text: `Which core principle is most essential in ${course.title}?`,
                options: [
                  "Modular architecture & structured design",
                  "Unverified ad-hoc processing",
                  "Redundant manual duplication",
                  "None of the above"
                ],
                correctIndex: 0,
                points: 5
              },
              {
                text: `In ${course.code}, what ensures optimal reliability and performance?`,
                options: [
                  "Ignoring validation checks",
                  "Systematic verification and benchmarking",
                  "Disabling error handling",
                  "Random configuration"
                ],
                correctIndex: 1,
                points: 5
              },
              {
                text: `Which approach is recommended for scalable ${course.title} workflows?`,
                options: [
                  "Single-threaded manual logs",
                  "Hardcoded credentials",
                  "Standardized protocols and automated testing",
                  "Skipping documentation"
                ],
                correctIndex: 2,
                points: 5
              }
            ]
          });
          mcqCreated++;

          const qList = quizDoc.questions;
          const maxScore = 15;

          // Students attempt Quiz 1 (and in ICT Quiz 2, first 2 students attempt)
          for (let sIdx = 0; sIdx < students.length; sIdx++) {
            if (!isCompletedQuiz && sIdx === students.length - 1) continue;

            const stu = students[sIdx];
            const getAllRight = (sIdx + cIdx) % 2 === 0;
            const answers = qList.map((qItem, qIdx) => ({
              questionId: qItem._id,
              selectedIndex:
                getAllRight || qIdx < 2 ? qItem.correctIndex : (qItem.correctIndex + 1) % 4
            }));
            const score = getAllRight ? 15 : 10;

            await QuizAttempt.create({
              quiz: quizDoc._id,
              course: course._id,
              student: stu._id,
              answers,
              score,
              maxScore,
              feedback: isCompletedQuiz
                ? score === 15
                  ? "Outstanding performance!"
                  : "Good job; revise lecture 3."
                : "",
              status: "submitted",
              startedAt: new Date(now - 2 * DAY),
              expiresAt: new Date(now - 2 * DAY + 15 * 60000),
              submittedAt: new Date(now - 2 * DAY + 9 * 60000)
            });
            mcqSubs++;
          }
        }

        // --------------------------------------------------------
        // 3. BROAD & THEORY QUIZZES (ICT courses get 1 Theory Quiz with submissions & grades)
        // --------------------------------------------------------
        if (isICT && TheoryQuiz && TheoryAttempt) {
          const tQuiz = await TheoryQuiz.create({
            course: course._id,
            createdBy: facId,
            title: `${course.code} Broad & Theory Assessment`,
            instructions: `Write clear analytical answers for ${course.title}.`,
            closesAt: new Date(now - 12 * 3600 * 1000),
            durationMinutes: 30,
            isPublished: true,
            resultsPublished: true,
            questions: [
              {
                promptText: `Explain the architecture, key workflows, and real-world applications of ${course.title}.`,
                points: 10
              },
              {
                promptText: `Discuss the security, scalability, and optimization challenges in ${course.code}.`,
                points: 10
              }
            ]
          });
          theoryCreated++;

          const tQuestions = tQuiz.questions;

          for (let sIdx = 0; sIdx < students.length; sIdx++) {
            const stu = students[sIdx];
            const q1Score = 8 + (sIdx % 3); // 8, 9, or 10
            const q2Score = 7 + ((sIdx + 1) % 3); // 7, 8, or 9

            await TheoryAttempt.create({
              theoryQuiz: tQuiz._id,
              course: course._id,
              student: stu._id,
              answers: [
                {
                  questionId: tQuestions[0]._id,
                  text: `In ${course.title}, the layered architecture separates presentation, business logic, and data persistence to ensure maintainability and high availability.`
                },
                {
                  questionId: tQuestions[1]._id,
                  text: `Key optimization strategies in ${course.code} include indexing, caching, role-based access control, and automated monitoring.`
                }
              ],
              grades: [
                {
                  questionId: tQuestions[0]._id,
                  score: q1Score,
                  feedback: "Well-structured explanation with clear examples."
                },
                {
                  questionId: tQuestions[1]._id,
                  score: q2Score,
                  feedback: "Good discussion on scalability and security."
                }
              ],
              score: q1Score + q2Score,
              maxScore: 20,
              status: "submitted",
              startedAt: new Date(now - DAY),
              expiresAt: new Date(now - DAY + 30 * 60000),
              submittedAt: new Date(now - DAY + 22 * 60000)
            });
            theorySubs++;
          }
        }
      }
    }

    console.log("==============================================================");
    console.log("Activities Seeded Successfully (ICT Main Focus + All Depts)!");
    console.log(`Assignments created       : ${assignCreated}`);
    console.log(`Assignment submissions    : ${assignSubs}`);
    console.log(`MCQ Quizzes created       : ${mcqCreated}`);
    console.log(`MCQ Quiz submissions      : ${mcqSubs}`);
    console.log(`Theory Assessments created: ${theoryCreated}`);
    console.log(`Theory submissions        : ${theorySubs}`);
    console.log("==============================================================");
  } catch (err) {
    console.error("Activity seed error:", err);
    process.exitCode = 1;
  } finally {
    await mongoose.disconnect().catch(() => {});
  }
})();