const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const Course = require("../models/Course");
const Assignment = require("../models/Assignment");
const Announcement = require("../models/Announcement");
const Notification = require("../models/Notification");

const {
  idOf,
  matchesSection,
  hasPublishedGrade
} = require("./notificationRules");

function optionalModel(name) {
  const file = path.join(
    __dirname,
    "..",
    "models",
    `${name}.js`
  );

  return fs.existsSync(file) ? require(file) : null;
}

const Quiz = optionalModel("Quiz");
const QuizAttempt = optionalModel("QuizAttempt");
const AcademicUpdate = optionalModel("AcademicUpdate");
const Discussion = optionalModel("Discussion");
const PasswordResetRequest =
  optionalModel("PasswordResetRequest");

const DAY = 24 * 60 * 60 * 1000;
const LOOKBACK = 30 * DAY;

function courseScope(user, courseIds) {
  return {
    recipient: user._id,
    $or: [
      { course: null },
      { course: { $in: courseIds } }
    ]
  };
}

async function syncNotifications(user) {
  const now = Date.now();
  const since = new Date(now - LOOKBACK);
  const soon = new Date(now + DAY);
  const uid = idOf(user._id);

  const academicRole = ["student", "faculty"].includes(
    user.role
  );

  const courses = academicRole
    ? await Course.find(
        user.role === "student"
          ? { students: user._id }
          : { faculty: user._id }
      )
        .select(
          "_id title code faculty students materials"
        )
        .lean()
    : [];

  const courseIds = courses.map((course) => course._id);
  const courseMap = new Map(
    courses.map((course) => [
      idOf(course._id),
      course
    ])
  );

  const events = new Map();

  function add(
    type,
    source,
    title,
    message,
    link,
    courseId = null,
    date = null
  ) {
    if (!source) return;

    const issuedAt = new Date(date || now);

    if (
      Number.isNaN(issuedAt.getTime()) ||
      issuedAt.getTime() < since.getTime()
    ) {
      return;
    }

    const key = `${type}:${source}`;

    events.set(key, {
      recipient: user._id,
      key,
      type,
      title: String(title).slice(0, 150),
      message: String(message).slice(0, 230),
      link,
      course: courseId || null,
      issuedAt
    });
  }

  // Course-specific notices only for enrolled students / course faculty.
  // General notices are also shown to Staff and Authority.
  if (user.role !== "admin") {
    const announcementFilter = {
      createdAt: { $gte: since },
      $or: [{ course: null }]
    };

    if (academicRole && courseIds.length) {
      announcementFilter.$or.push({
        course: { $in: courseIds }
      });
    }

    const notices = await Announcement.find(
      announcementFilter
    )
      .select(
        "_id title message course createdBy createdAt"
      )
      .sort({ createdAt: -1 })
      .limit(100)
      .lean();

    for (const item of notices) {
      if (idOf(item.createdBy) === uid) continue;

      add(
        "announcement",
        idOf(item._id),
        "New announcement",
        item.title,
        "/announcements",
        item.course,
        item.createdAt
      );
    }
  }

  if (academicRole && courseIds.length) {
    const assignments = await Assignment.find({
      course: { $in: courseIds },
      $or: [
        { createdAt: { $gte: since } },
        { updatedAt: { $gte: since } },
        {
          deadline: {
            $gte: new Date(now - DAY),
            $lte: soon
          }
        }
      ]
    })
      .select(
        "_id title course deadline createdAt updatedAt submissions"
      )
      .sort({ updatedAt: -1 })
      .limit(120)
      .lean();

    for (const assignment of assignments) {
      const courseId = idOf(assignment.course);
      const course = courseMap.get(courseId);
      if (!course) continue;

      if (user.role === "student") {
        add(
          "assignment",
          idOf(assignment._id),
          "New assignment",
          `${course.code}: ${assignment.title}`,
          "/assignments",
          assignment.course,
          assignment.createdAt
        );

        const mySubmission = (
          assignment.submissions || []
        ).find(
          (submission) =>
            idOf(submission.student) === uid
        );

        if (hasPublishedGrade(mySubmission)) {
          const gradeSignature = crypto
            .createHash("sha256")
            .update(
              JSON.stringify([
                mySubmission.grade,
                mySubmission.feedback || ""
              ])
            )
            .digest("hex")
            .slice(0, 16);

          add(
            "grade",
            `${idOf(assignment._id)}:${idOf(mySubmission._id)}:${gradeSignature}`,
            "Assignment grade published",
            `${course.code}: ${assignment.title}`,
            "/grades",
            assignment.course,
            assignment.updatedAt
          );
        }

        const due = assignment.deadline
          ? new Date(assignment.deadline).getTime()
          : NaN;

        if (
          !mySubmission &&
          Number.isFinite(due) &&
          due > now &&
          due <= now + DAY
        ) {
          add(
            "deadline",
            `${idOf(assignment._id)}:${due}`,
            "Assignment deadline approaching",
            `${course.code}: ${assignment.title}`,
            "/assignments",
            assignment.course,
            new Date()
          );
        }
      }

      if (user.role === "faculty") {
        for (
          const submission of
          assignment.submissions || []
        ) {
          const submittedAt = submission.submittedAt;

          add(
            "submission",
            `${idOf(assignment._id)}:${idOf(submission._id)}`,
            "Assignment submitted",
            `${course.code}: ${assignment.title} has a new submission.`,
            "/grades",
            assignment.course,
            submittedAt
          );
        }
      }
    }

    if (user.role === "student") {
      for (const course of courses) {
        for (const material of course.materials || []) {
          if (!material.storedName) continue;

          add(
            "material",
            `${idOf(course._id)}:${idOf(material._id)}`,
            "New learning material",
            `${course.code}: ${material.title || "Course resource"}`,
            "/materials",
            course._id,
            material.uploadedAt
          );
        }
      }
    }

    if (Quiz && QuizAttempt) {
      const quizzes = await Quiz.find({
        course: { $in: courseIds },
        ...(user.role === "student"
          ? { isPublished: true }
          : {}),
        $or: [
          { createdAt: { $gte: since } },
          { updatedAt: { $gte: since } },
          {
            closesAt: {
              $gte: new Date(now),
              $lte: soon
            }
          }
        ]
      })
        .select(
          "_id title course isPublished resultsPublished closesAt createdAt updatedAt"
        )
        .sort({ updatedAt: -1 })
        .limit(100)
        .lean();

      const quizIds = quizzes.map(
        (quiz) => quiz._id
      );

      if (user.role === "student") {
        const attempts = quizIds.length
          ? await QuizAttempt.find({
              quiz: { $in: quizIds },
              student: user._id
            })
              .select(
                "quiz score maxScore submittedAt"
              )
              .lean()
          : [];

        const attempted = new Map(
          attempts.map((attempt) => [
            idOf(attempt.quiz),
            attempt
          ])
        );

        for (const quiz of quizzes) {
          const course = courseMap.get(
            idOf(quiz.course)
          );

          if (!course) continue;

          add(
            "quiz",
            idOf(quiz._id),
            "Quiz available",
            `${course.code}: ${quiz.title}`,
            "/quizzes",
            quiz.course,
            quiz.updatedAt || quiz.createdAt
          );

          const attempt = attempted.get(
            idOf(quiz._id)
          );

          if (attempt && quiz.resultsPublished) {
            add(
              "quiz-result",
              idOf(quiz._id),
              "Quiz result published",
              `${course.code}: ${quiz.title}`,
              "/quizzes",
              quiz.course,
              quiz.updatedAt
            );
          }

          const due = quiz.closesAt
            ? new Date(quiz.closesAt).getTime()
            : NaN;

          if (
            !attempt &&
            Number.isFinite(due) &&
            due > now &&
            due <= now + DAY
          ) {
            add(
              "deadline",
              `quiz:${idOf(quiz._id)}:${due}`,
              "Quiz closes soon",
              `${course.code}: ${quiz.title}`,
              "/quizzes",
              quiz.course,
              new Date()
            );
          }
        }
      } else if (quizIds.length) {
        const attempts = await QuizAttempt.find({
          quiz: { $in: quizIds },
          submittedAt: { $gte: since }
        })
          .select("_id quiz course submittedAt")
          .sort({ submittedAt: -1 })
          .limit(100)
          .lean();

        const quizMap = new Map(
          quizzes.map((quiz) => [
            idOf(quiz._id),
            quiz
          ])
        );

        for (const attempt of attempts) {
          const quiz = quizMap.get(
            idOf(attempt.quiz)
          );

          if (!quiz) continue;

          add(
            "quiz-submission",
            idOf(attempt._id),
            "New quiz submission",
            quiz.title,
            "/quizzes",
            attempt.course,
            attempt.submittedAt
          );
        }
      }
    }

    if (Discussion) {
      const threads = await Discussion.find({
        course: { $in: courseIds },
        updatedAt: { $gte: since }
      })
        .select(
          "_id title course author createdAt removedAt replies"
        )
        .sort({ updatedAt: -1 })
        .limit(80)
        .lean();

      for (const thread of threads) {
        if (thread.removedAt) continue;

        const course = courseMap.get(
          idOf(thread.course)
        );

        if (!course) continue;

        if (
          user.role === "faculty" &&
          idOf(thread.author) !== uid
        ) {
          add(
            "discussion",
            idOf(thread._id),
            "New course discussion",
            `${course.code}: ${thread.title}`,
            "/discussions",
            thread.course,
            thread.createdAt
          );
        }

        if (idOf(thread.author) === uid) {
          for (const reply of thread.replies || []) {
            if (
              reply.removedAt ||
              idOf(reply.author) === uid
            ) {
              continue;
            }

            add(
              "discussion",
              `${idOf(thread._id)}:${idOf(reply._id)}`,
              "New reply to your discussion",
              `${course.code}: ${thread.title}`,
              "/discussions",
              thread.course,
              reply.createdAt
            );
          }
        }
      }
    }
  }

  if (
    AcademicUpdate &&
    user.role !== "admin"
  ) {
    const filters = [{ kind: "calendar" }];

    if (
      user.role === "staff" ||
      user.role === "authority"
    ) {
      filters.push({ kind: "reschedule" });
    } else if (courseIds.length) {
      const reschedule = {
        kind: "reschedule",
        course: { $in: courseIds }
      };

      if (user.role === "student") {
        const section = String(
          user.section || ""
        ).trim().toUpperCase();

        reschedule.section = {
          $in: section
            ? ["All", section]
            : ["All"]
        };
      }

      filters.push(reschedule);
    }

    const updates = await AcademicUpdate.find({
      createdAt: { $gte: since },
      $or: filters
    })
      .select(
        "_id kind title date course courseCode section createdBy createdAt"
      )
      .sort({ createdAt: -1 })
      .limit(100)
      .lean();

    for (const item of updates) {
      if (idOf(item.createdBy) === uid) {
        continue;
      }

      if (
        user.role === "student" &&
        item.kind === "reschedule" &&
        !matchesSection(
          user.section,
          item.section
        )
      ) {
        continue;
      }

      add(
        item.kind === "calendar"
          ? "calendar"
          : "reschedule",
        idOf(item._id),
        item.kind === "calendar"
          ? "Academic calendar updated"
          : "Class rescheduled",
        item.kind === "calendar"
          ? item.title
          : `${item.courseCode || "Course"} Â· Section ${item.section || "All"}`,
        "/academic-updates",
        item.kind === "reschedule"
          ? item.course
          : null,
        item.createdAt
      );
    }
  }

  // Only if the password-request module is installed.
  if (
    user.role === "admin" &&
    PasswordResetRequest
  ) {
    const requests =
      await PasswordResetRequest.find({
        status: "pending",
        createdAt: { $gte: since }
      })
        .select("_id createdAt")
        .sort({ createdAt: -1 })
        .limit(50)
        .lean();

    for (const request of requests) {
      add(
        "reset-request",
        idOf(request._id),
        "Password reset request",
        "A user's request needs Admin review.",
        "/admin",
        null,
        request.createdAt
      );
    }
  }

  const records = [...events.values()]
    .sort(
      (a, b) =>
        a.issuedAt.getTime() -
        b.issuedAt.getTime()
    )
    .slice(-200);

  if (records.length) {
    await Notification.init();

    const operations = records.map((record) => ({
      updateOne: {
        filter: {
          recipient: record.recipient,
          key: record.key
        },
        update: {
          $setOnInsert: record
        },
        upsert: true
      }
    }));

    try {
      await Notification.bulkWrite(
        operations,
        { ordered: false }
      );
    } catch (error) {
      const duplicateOnly =
        error.code === 11000 ||
        (
          error.writeErrors?.length &&
          error.writeErrors.every(
            (item) => item.code === 11000
          )
        );

      if (!duplicateOnly) throw error;
    }
  }

  return courseIds;
}

module.exports = {
  syncNotifications,
  courseScope
};