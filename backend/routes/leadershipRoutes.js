const express = require("express");
const crypto = require("crypto");
const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");

const User = require("../models/User");
const Course = require("../models/Course");
const Assignment = require("../models/Assignment");
const Announcement = require("../models/Announcement");
const Setting = require("../models/LeadershipSetting");
const Policy = require("../models/LeadershipPolicy");
const Audit = require("../models/LeadershipAudit");
const { protect, authorize } = require("../middleware/authMiddleware");

const router = express.Router();
router.use(protect);

const wrap = (handler) => (req, res, next) =>
  Promise.resolve(handler(req, res, next)).catch(next);

const roles = ["student", "faculty", "staff", "admin", "authority"];
const clean = (value) => typeof value === "string" ? value.trim() : "";
const validId = (value) => mongoose.isValidObjectId(value);

function error(status, message) {
  const result = new Error(message);
  result.status = status;
  return result;
}

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

async function audit(req, action, target, detail = "") {
  try {
    await Audit.create({
      actor: req.user._id,
      action,
      target: String(target),
      detail: detail.slice(0, 250)
    });
  } catch (err) {
    console.error("Management audit could not be recorded:", err);
  }
}

async function reportData() {
  const fs = require("fs");
  const path = require("path");
  const Quiz = fs.existsSync(path.join(__dirname, "../models/Quiz.js"))
    ? require("../models/Quiz")
    : null;
  const QuizAttempt = fs.existsSync(path.join(__dirname, "../models/QuizAttempt.js"))
    ? require("../models/QuizAttempt")
    : null;
  const Routine = fs.existsSync(path.join(__dirname, "../models/Routine.js"))
    ? require("../models/Routine")
    : null;

  const ALL_BUP_DEPARTMENTS = [
    { key: "ict", label: "ICT" },
    { key: "cse", label: "CSE" },
    { key: "es", label: "ES" },
    { key: "economics", label: "Economics" },
    { key: "english", label: "English" },
    { key: "law", label: "Law" },
    { key: "bba", label: "Business Administration" },
    { key: "publicadministration", label: "Public Administration" },
    { key: "ir", label: "International Relations" },
    { key: "sociology", label: "Sociology" },
    { key: "developmentstudies", label: "Development Studies" },
    { key: "mcj", label: "Mass Communication and Journalism" },
    { key: "dhsm", label: "Disaster and Human Security Management" },
    { key: "pchrs", label: "Peace, Conflict and Human Rights Studies" },
    { key: "universityadministration", label: "University Administration" }
  ];

  const normalizeDeptKey = (val) => {
    const raw = String(val || "").trim().toLowerCase().replace(/[^a-z0-9]/g, "");
    if (!raw) return "unassigned";
    if (raw === "ict" || raw.includes("informationandcommunicationtechnology")) return "ict";
    if (raw === "cse" || raw.includes("computerscienceandengineering")) return "cse";
    if (raw === "es" || raw.includes("environmentalscience")) return "es";
    if (raw === "bba" || raw.includes("businessadministration")) return "bba";
    if (raw === "ir" || raw.includes("internationalrelations")) return "ir";
    if (raw === "mcj" || raw.includes("masscommunicationandjournalism")) return "mcj";
    if (raw === "dhsm" || raw.includes("disasterandhumansecuritymanagement")) return "dhsm";
    if (raw === "pchrs" || raw.includes("peaceconflictandhumanrightsstudies")) return "pchrs";
    if (raw === "administration" || raw.includes("universityadministration")) return "universityadministration";
    return raw;
  };

  const formatDeptName = (val, key) => {
    const found = ALL_BUP_DEPARTMENTS.find((d) => d.key === key);
    if (found) return found.label;
    if (key === "unassigned") return "Unassigned";
    return String(val || "Unassigned").trim();
  };

  const [
    users,
    courses,
    assignments,
    announcementCount,
    policyCount,
    quizzes,
    quizAttempts,
    routines
  ] = await Promise.all([
    User.find().select("role department isActive").lean(),
    Course.find().populate("faculty", "name department").lean(),
    Assignment.find().select("course submissions").lean(),
    Announcement.countDocuments(),
    Policy.countDocuments({ status: "published" }),
    Quiz ? Quiz.find().select("course title questions isPublished resultsPublished").lean() : [],
    QuizAttempt
      ? QuizAttempt.find({
          $or: [
            { status: { $in: ["submitted", "expired"] } },
            { status: { $exists: false } }
          ]
        })
          .select("quiz course score maxScore status")
          .lean()
      : [],
    Routine ? Routine.find().select("department departmentKey").lean() : []
  ]);

  const academicCollection = mongoose.connection.db.collection("academicupdates");
  const [calendarCount, rescheduleCount] = await Promise.all([
    academicCollection.countDocuments({ kind: "calendar" }),
    academicCollection.countDocuments({ kind: "reschedule" })
  ]);

  const roleCounts = roles.map((role) => ({
    role,
    total: users.filter((u) => u.role === role).length,
    active: users.filter((u) => u.role === role && u.isActive !== false).length
  }));

  const deptMap = new Map();
  const ensureDept = (deptRaw) => {
    const key = normalizeDeptKey(deptRaw);
    if (!deptMap.has(key)) {
      deptMap.set(key, {
        key,
        department: formatDeptName(deptRaw, key),
        users: {
          total: 0,
          active: 0,
          byRole: roles.map((r) => ({ role: r, total: 0, active: 0 }))
        },
        students: 0,
        faculty: 0,
        staff: 0,
        courses: 0,
        enrollments: 0,
        materials: 0,
        assignments: 0,
        submissions: 0,
        graded: 0,
        averageGrade: null,
        submissionRate: 0,
        quizzes: 0,
        quizAttempts: 0,
        quizParticipationPercent: 0,
        routines: 0,
        courseRows: [],
        _gradeSum: 0,
        _expectedSubs: 0,
        _expectedQuiz: 0
      });
    }
    return deptMap.get(key);
  };

  // Pre-populate all registration departments so Authority sees every department
  for (const deptItem of ALL_BUP_DEPARTMENTS) {
    ensureDept(deptItem.label);
  }

  for (const u of users) {
    const d = ensureDept(u.department);
    d.users.total += 1;
    if (u.isActive !== false) d.users.active += 1;
    const rObj = d.users.byRole.find((x) => x.role === u.role);
    if (rObj) {
      rObj.total += 1;
      if (u.isActive !== false) rObj.active += 1;
    }
    if (u.role === "student") d.students += 1;
    if (u.role === "faculty") d.faculty += 1;
    if (u.role === "staff") d.staff += 1;
  }

  for (const rt of routines) {
    const d = ensureDept(rt.department || rt.departmentKey);
    d.routines += 1;
  }

  let submissionCount = 0;
  let gradedCount = 0;
  let gradeSum = 0;

  const courseRows = courses.map((course) => {
    const cId = String(course._id);
    const dept = ensureDept(course.department || course.faculty?.department || "Unassigned");

    const relatedAssign = assignments.filter((a) => String(a.course) === cId);
    const subs = relatedAssign.flatMap((a) => a.submissions || []);
    const grades = subs
      .map((s) => s.grade)
      .filter((g) => typeof g === "number" && Number.isFinite(g) && g >= 0 && g <= 100);

    const relatedQuizzes = quizzes.filter((q) => String(q.course) === cId);
    const qIds = new Set(relatedQuizzes.map((q) => String(q._id)));
    const cQuizAttempts = quizAttempts.filter((qa) => qIds.has(String(qa.quiz)));

    const enrolledCount = course.students?.length || 0;
    const matCount = course.materials?.length || 0;
    const expectedAssign = relatedAssign.length * enrolledCount;
    const expectedQuiz = relatedQuizzes.length * enrolledCount;

    const cGradeSum = grades.reduce((sum, g) => sum + g, 0);
    submissionCount += subs.length;
    gradedCount += grades.length;
    gradeSum += cGradeSum;

    const subRate = expectedAssign
      ? Math.min(100, Math.round((subs.length / expectedAssign) * 100))
      : 0;
    const quizPartRate = expectedQuiz
      ? Math.min(100, Math.round((cQuizAttempts.length / expectedQuiz) * 100))
      : 0;

    const row = {
      id: cId,
      department: dept.department,
      departmentKey: dept.key,
      code: course.code,
      title: course.title,
      faculty: course.faculty?.name || "Not assigned",
      students: enrolledCount,
      materials: matCount,
      assignments: relatedAssign.length,
      submissions: subs.length,
      graded: grades.length,
      averageGrade: grades.length ? Math.round(cGradeSum / grades.length) : null,
      submissionRate: expectedAssign ? subRate : null,
      quizzes: relatedQuizzes.length,
      quizAttempts: cQuizAttempts.length,
      quizParticipationPercent: expectedQuiz ? quizPartRate : null
    };

    dept.courses += 1;
    dept.enrollments += enrolledCount;
    dept.materials += matCount;
    dept.assignments += relatedAssign.length;
    dept.submissions += subs.length;
    dept.graded += grades.length;
    dept._gradeSum += cGradeSum;
    dept._expectedSubs += expectedAssign;
    dept.quizzes += relatedQuizzes.length;
    dept.quizAttempts += cQuizAttempts.length;
    dept._expectedQuiz += expectedQuiz;
    dept.courseRows.push(row);

    return row;
  });

  const departmentRows = Array.from(deptMap.values())
    .map((d) => {
      d.averageGrade = d.graded ? Math.round(d._gradeSum / d.graded) : null;
      d.submissionRate = d._expectedSubs
        ? Math.min(100, Math.round((d.submissions / d._expectedSubs) * 100))
        : 0;
      d.quizParticipationPercent = d._expectedQuiz
        ? Math.min(100, Math.round((d.quizAttempts / d._expectedQuiz) * 100))
        : 0;
      delete d._gradeSum;
      delete d._expectedSubs;
      delete d._expectedQuiz;
      return d;
    })
    .filter((d) => d.key !== "unassigned" || d.courses > 0 || d.users.total > 0)
    .sort((a, b) => {
      const idxA = ALL_BUP_DEPARTMENTS.findIndex((d) => d.key === a.key);
      const idxB = ALL_BUP_DEPARTMENTS.findIndex((d) => d.key === b.key);
      const orderA = idxA >= 0 ? idxA : 999;
      const orderB = idxB >= 0 ? idxB : 999;
      return orderA !== orderB
        ? orderA - orderB
        : a.department.localeCompare(b.department);
    });

  return {
    generatedAt: new Date().toISOString(),
    users: {
      total: users.length,
      active: users.filter((u) => u.isActive !== false).length,
      byRole: roleCounts
    },
    courses: courses.length,
    enrollments: courses.reduce((sum, c) => sum + (c.students?.length || 0), 0),
    materials: courses.reduce((sum, c) => sum + (c.materials?.length || 0), 0),
    assignments: assignments.length,
    submissions: submissionCount,
    graded: gradedCount,
    averageGrade: gradedCount ? Math.round(gradeSum / gradedCount) : null,
    quizzes: quizzes.length,
    quizAttempts: quizAttempts.length,
    announcements: announcementCount,
    calendarEvents: calendarCount,
    classReschedules: rescheduleCount,
    publishedPolicies: policyCount,
    courseRows,
    departmentRows
  };
}
function csvValue(value) {
  let result = String(value == null ? "" : value);

  // Prevent spreadsheet formula execution if a course title starts with = etc.
  if (/^[=+\-@]/.test(result)) result = "'" + result;

  return '"' + result.replace(/"/g, '""') + '"';
}

// Aggregated reports: Admin/Authority only. No individual student grades.
router.get(
  "/report",
  authorize("admin", "authority"),
  wrap(async (_req, res) => {
    res.json(await reportData());
  })
);

router.get(
  "/report.csv",
  authorize("admin", "authority"),
  wrap(async (_req, res) => {
    const report = await reportData();
    const rows = [
      ["BUP LearnHub Academic Summary", report.generatedAt],
      ["Metric", "Value"],
      ["Total users", report.users.total],
      ["Active users", report.users.active],
      ["Courses", report.courses],
      ["Enrollments", report.enrollments],
      ["Materials", report.materials],
      ["Assignments", report.assignments],
      ["Submissions", report.submissions],
      ["Graded submissions", report.graded],
      ["Average grade", report.averageGrade ?? ""],
      ["Announcements", report.announcements],
      ["Calendar events", report.calendarEvents],
      ["Class reschedules", report.classReschedules],
      [],
      [
        "Course code", "Course title", "Faculty", "Students",
        "Materials", "Assignments", "Submissions",
        "Graded", "Average grade", "Submission rate %"
      ],
      ...report.courseRows.map((course) => [
        course.code,
        course.title,
        course.faculty,
        course.students,
        course.materials,
        course.assignments,
        course.submissions,
        course.graded,
        course.averageGrade ?? "",
        course.submissionRate ?? ""
      ])
    ];

    res.set("Content-Type", "text/csv; charset=utf-8");
    res.set(
      "Content-Disposition",
      'attachment; filename="learnhub-academic-report.csv"'
    );

    res.send(
      "\uFEFF" +
        rows.map((row) => row.map(csvValue).join(",")).join("\r\n")
    );
  })
);

// ------------------------- ADMIN: USERS -------------------------

router.get(
  "/users",
  authorize("admin"),
  wrap(async (req, res) => {
    const page = Math.max(1, Number.parseInt(req.query.page, 10) || 1);
    const limit = 20;
    const query = clean(req.query.q).slice(0, 80);
    const role = clean(req.query.role);

    const filter = {};

    if (role && roles.includes(role)) filter.role = role;

    if (query) {
      const regex = new RegExp(escapeRegex(query), "i");

      filter.$or = [
        { name: regex },
        { email: regex },
        { studentId: regex }
      ];
    }

    const [items, total] = await Promise.all([
      User.find(filter)
        .select("_id name email role department section studentId isActive createdAt")
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      User.countDocuments(filter)
    ]);

    res.json({
      items,
      total,
      page,
      pages: Math.max(1, Math.ceil(total / limit))
    });
  })
);

router.post(
  "/users",
  authorize("admin"),
  wrap(async (req, res) => {
    const name = clean(req.body.name);
    const email = clean(req.body.email).toLowerCase();
    const role = clean(req.body.role);
    const department = clean(req.body.department);
    const suppliedPassword = clean(req.body.password);

    if (
      !name ||
      name.length > 100 ||
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ||
      !["admin", "authority"].includes(role) ||
      !department
    ) {
      throw error(400, "Enter a valid name, email, role and department.");
    }

    if (suppliedPassword && suppliedPassword.length < 12) {
      throw error(400, "Password must be at least 12 characters.");
    }

    const password =
      suppliedPassword ||
      crypto.randomBytes(18).toString("base64url");

    const user = await User.create({
      name,
      email,
      role,
      department,
      section: clean(req.body.section),
      studentId: role === "student" ? clean(req.body.studentId) : "",
      isActive: true,
      password: await bcrypt.hash(password, 12)
    });

    await audit(req, "user_created", user._id, role);

    res.status(201).json({
      message: "User created.",
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role
      },
      temporaryPassword: password
    });
  })
);

router.put(
  "/users/:id",
  authorize("admin"),
  wrap(async (req, res) => {
    if (!validId(req.params.id)) throw error(400, "Invalid user ID.");

    const user = await User.findById(req.params.id);
    if (!user) throw error(404, "User not found.");

    const name = clean(req.body.name);
    const email = clean(req.body.email).toLowerCase();
    const role = clean(req.body.role);
    const department = clean(req.body.department);

    if (
      !name ||
      name.length > 100 ||
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ||
      !roles.includes(role) ||
      !department
    ) {
      throw error(400, "Enter a valid name, email, role and department.");
    }

    if (
      String(user._id) === String(req.user._id) &&
      role !== user.role
    ) {
      throw error(403, "You cannot change your own admin role.");
    }

    if (user.role === "admin" && role !== "admin" && user.isActive) {
      const activeAdmins = await User.countDocuments({
        role: "admin",
        isActive: true
      });

      if (activeAdmins <= 1) {
        throw error(409, "The final active admin cannot be demoted.");
      }
    }

    if (user.role === "student" && role !== "student") {
      const [enrolled, submitted] = await Promise.all([
        Course.exists({ students: user._id }),
        Assignment.exists({ "submissions.student": user._id })
      ]);

      if (enrolled || submitted) {
        throw error(
          409,
          "Student has academic records. Remove enrollment only when safe before changing role."
        );
      }
    }

    const oldRole = user.role;

    user.name = name;
    user.email = email;
    user.role = role;
    user.department = department;
    user.section = clean(req.body.section);
    user.studentId = role === "student"
      ? clean(req.body.studentId)
      : "";

    await user.save();
    await audit(req, "user_updated", user._id, `${oldRole} -> ${role}`);

    res.json({ message: "User updated." });
  })
);

router.patch(
  "/users/:id/status",
  authorize("admin"),
  wrap(async (req, res) => {
    if (!validId(req.params.id)) throw error(400, "Invalid user ID.");
    if (typeof req.body.isActive !== "boolean") {
      throw error(400, "isActive must be true or false.");
    }

    const user = await User.findById(req.params.id);
    if (!user) throw error(404, "User not found.");

    if (String(user._id) === String(req.user._id)) {
      throw error(403, "You cannot deactivate your own account.");
    }

    if (
      user.role === "admin" &&
      user.isActive &&
      !req.body.isActive
    ) {
      const count = await User.countDocuments({
        role: "admin",
        isActive: true
      });

      if (count <= 1) {
        throw error(409, "The final active admin cannot be deactivated.");
      }
    }

    user.isActive = req.body.isActive;
    await user.save();

    await audit(
      req,
      user.isActive ? "user_activated" : "user_deactivated",
      user._id
    );

    res.json({
      message: user.isActive
        ? "Account activated."
        : "Account deactivated."
    });
  })
);

router.get(
  "/enrollments/:courseId",
  authorize("admin"),
  wrap(async (req, res) => {
    if (!validId(req.params.courseId)) {
      throw error(400, "Invalid course ID.");
    }

    const course = await Course.findById(req.params.courseId)
      .populate("students", "name email section studentId isActive")
      .select("title code students");

    if (!course) throw error(404, "Course not found.");

    res.json(course);
  })
);

router.post(
  "/enrollments",
  authorize("admin"),
  wrap(async (req, res) => {
    const courseId = req.body.courseId;
    const email = clean(req.body.studentEmail).toLowerCase();

    if (!validId(courseId) || !email) {
      throw error(400, "Select a course and enter a student email.");
    }

    const student = await User.findOne({
      email,
      role: "student",
      isActive: true
    });

    if (!student) {
      throw error(404, "Active student account not found.");
    }

    const result = await Course.updateOne(
      { _id: courseId },
      { $addToSet: { students: student._id } }
    );

    if (!result.matchedCount) {
      throw error(404, "Course not found.");
    }

    if (result.modifiedCount) {
      await audit(req, "student_enrolled", courseId, String(student._id));
    }

    res.json({
      message: result.modifiedCount
        ? "Student enrolled."
        : "Student was already enrolled."
    });
  })
);

router.delete(
  "/enrollments/:courseId/:studentId",
  authorize("admin"),
  wrap(async (req, res) => {
    const { courseId, studentId } = req.params;

    if (!validId(courseId) || !validId(studentId)) {
      throw error(400, "Invalid course or student ID.");
    }

    const hasSubmission = await Assignment.exists({
      course: courseId,
      "submissions.student": studentId
    });

    if (hasSubmission) {
      throw error(
        409,
        "Student has submissions in this course. Enrollment cannot be removed because academic records must be preserved."
      );
    }

    const result = await Course.updateOne(
      { _id: courseId },
      { $pull: { students: new mongoose.Types.ObjectId(studentId) } }
    );

    if (!result.matchedCount) throw error(404, "Course not found.");

    if (result.modifiedCount) {
      await audit(req, "student_unenrolled", courseId, studentId);
    }

    res.json({ message: "Enrollment removed." });
  })
);

// ----------------------- ADMIN: SETTINGS / LOG ------------------

router.get(
  "/settings",
  authorize("admin"),
  wrap(async (_req, res) => {
    const setting = await Setting.findOne({
      key: "registrationEnabled"
    }).lean();

    res.json({
      registrationEnabled: setting?.value !== false
    });
  })
);

router.put(
  "/settings",
  authorize("admin"),
  wrap(async (req, res) => {
    if (typeof req.body.registrationEnabled !== "boolean") {
      throw error(400, "Registration setting must be true or false.");
    }

    await Setting.findOneAndUpdate(
      { key: "registrationEnabled" },
      {
        $set: {
          value: req.body.registrationEnabled,
          updatedBy: req.user._id
        }
      },
      { upsert: true, new: true }
    );

    await audit(
      req,
      "registration_setting_changed",
      "registrationEnabled",
      String(req.body.registrationEnabled)
    );

    res.json({
      message: "Registration setting saved.",
      registrationEnabled: req.body.registrationEnabled
    });
  })
);

router.get(
  "/activity",
  authorize("admin"),
  wrap(async (_req, res) => {
    const activity = await Audit.find()
      .populate("actor", "name email")
      .sort({ createdAt: -1 })
      .limit(30)
      .lean();

    res.json(activity);
  })
);

// --------------------- AUTHORITY: POLICIES ----------------------

router.get(
  "/policies",
  authorize("student", "faculty", "staff", "admin", "authority"),
  wrap(async (req, res) => {
    const managementView =
      req.user.role === "admin" ||
      req.user.role === "authority";

    // Students, faculty and staff see only published policies.
    const filter = managementView
      ? {}
      : { status: "published" };

    const policies = await Policy.find(filter)
      .populate("createdBy", "name")
      .sort({ updatedAt: -1 })
      .lean();

    return res.json(policies);
  })
);
router.post(
  "/policies",
  authorize("authority"),
  wrap(async (req, res) => {
    const title = clean(req.body.title);
    const content = clean(req.body.content);
    const status = clean(req.body.status) || "published";

    if (
      !title ||
      title.length > 150 ||
      !content ||
      content.length > 5000 ||
      !["published", "archived"].includes(status)
    ) {
      throw error(400, "Enter a title, policy text and valid status.");
    }

    const policy = await Policy.create({
      title,
      content,
      status,
      createdBy: req.user._id,
      updatedBy: req.user._id
    });

    await audit(req, "policy_created", policy._id, status);

    res.status(201).json({
      message: "Policy saved.",
      policy
    });
  })
);

router.put(
  "/policies/:id",
  authorize("authority"),
  wrap(async (req, res) => {
    if (!validId(req.params.id)) throw error(400, "Invalid policy ID.");

    const policy = await Policy.findById(req.params.id);
    if (!policy) throw error(404, "Policy not found.");

    const title = clean(req.body.title);
    const content = clean(req.body.content);
    const status = clean(req.body.status);

    if (
      !title ||
      title.length > 150 ||
      !content ||
      content.length > 5000 ||
      !["published", "archived"].includes(status)
    ) {
      throw error(400, "Enter a title, policy text and valid status.");
    }

    policy.title = title;
    policy.content = content;
    policy.status = status;
    policy.updatedBy = req.user._id;

    await policy.save();
    await audit(req, "policy_updated", policy._id, status);

    res.json({ message: "Policy updated." });
  })
);

router.use((err, _req, res, _next) => {
  if (err.status) {
    return res.status(err.status).json({ message: err.message });
  }

  if (err.code === 11000) {
    return res.status(409).json({
      message: "Email or setting already exists."
    });
  }

  if (err.name === "ValidationError" || err.name === "CastError") {
    return res.status(400).json({ message: err.message });
  }

  console.error("Leadership API error:", err);
  return res.status(500).json({
    message: "Could not complete this request."
  });
});

module.exports = router;