const express = require("express");
const mongoose = require("mongoose");

const Course = require("../models/Course");
const Discussion = require("../models/Discussion");

const {
  protect,
  authorize
} = require("../middleware/authMiddleware");

const {
  canReadCourse,
  canEditMessage,
  canRemoveMessage,
  validateThread,
  validateReply
} = require("../services/discussionRules");

const router = express.Router();

router.use(protect, authorize("student", "faculty"));

const wrap = (handler) => (req, res, next) =>
  Promise.resolve(handler(req, res, next)).catch(next);

async function accessibleCourse(req, res) {
  if (!mongoose.isValidObjectId(req.params.courseId)) {
    res.status(400).json({
      message: "Invalid course ID."
    });
    return null;
  }

  const course = await Course.findById(
    req.params.courseId
  ).select("code title faculty students");

  if (!course) {
    res.status(404).json({
      message: "Course not found."
    });
    return null;
  }

  if (!canReadCourse(course, req.user)) {
    res.status(403).json({
      message:
        "Only enrolled students and this course's faculty can access its discussions."
    });
    return null;
  }

  return course;
}

async function existingThread(req, res, course) {
  if (!mongoose.isValidObjectId(req.params.threadId)) {
    res.status(400).json({
      message: "Invalid discussion ID."
    });
    return null;
  }

  const thread = await Discussion.findOne({
    _id: req.params.threadId,
    course: course._id
  });

  if (!thread) {
    res.status(404).json({
      message: "Discussion not found in this course."
    });
    return null;
  }

  return thread;
}

function existingReply(req, res, thread) {
  if (!mongoose.isValidObjectId(req.params.replyId)) {
    res.status(400).json({
      message: "Invalid reply ID."
    });
    return null;
  }

  const reply = thread.replies.id(req.params.replyId);

  if (!reply) {
    res.status(404).json({
      message: "Reply not found."
    });
    return null;
  }

  return reply;
}

// Paginated discussions: only for an enrolled student or owner faculty.
router.get(
  "/courses/:courseId",
  wrap(async (req, res) => {
    const course = await accessibleCourse(req, res);
    if (!course) return;

    const requested = Number.parseInt(
      String(req.query.page || "1"),
      10
    );

    const page = Number.isFinite(requested)
      ? Math.max(1, Math.min(requested, 10000))
      : 1;

    const pageSize = 10;
    const filter = { course: course._id };

    const [total, items] = await Promise.all([
      Discussion.countDocuments(filter),
      Discussion.find(filter)
        .populate("author", "name role")
        .populate("replies.author", "name role")
        .sort({
          lastActivityAt: -1,
          _id: -1
        })
        .skip((page - 1) * pageSize)
        .limit(pageSize)
    ]);

    return res.json({
      course: {
        _id: course._id,
        code: course.code,
        title: course.title
      },
      items,
      total,
      page,
      pages: Math.max(
        1,
        Math.ceil(total / pageSize)
      )
    });
  })
);

router.post(
  "/courses/:courseId",
  wrap(async (req, res) => {
    const course = await accessibleCourse(req, res);
    if (!course) return;

    const fields = validateThread(req.body);

    await Discussion.create({
      ...fields,
      course: course._id,
      author: req.user._id,
      lastActivityAt: new Date()
    });

    return res.status(201).json({
      message: "Discussion posted."
    });
  })
);

// Only the author may edit text. Faculty moderation is removal,
// not changing someone else's words.
router.put(
  "/courses/:courseId/:threadId",
  wrap(async (req, res) => {
    const course = await accessibleCourse(req, res);
    if (!course) return;

    const thread = await existingThread(
      req,
      res,
      course
    );

    if (!thread) return;

    if (!canEditMessage(thread, req.user)) {
      return res.status(403).json({
        message: "You can edit only your own active post."
      });
    }

    const fields = validateThread(req.body);

    thread.title = fields.title;
    thread.body = fields.body;

    await thread.save();

    return res.json({
      message: "Discussion updated."
    });
  })
);

// Soft removal preserves other participants' replies.
router.delete(
  "/courses/:courseId/:threadId",
  wrap(async (req, res) => {
    const course = await accessibleCourse(req, res);
    if (!course) return;

    const thread = await existingThread(
      req,
      res,
      course
    );

    if (!thread) return;

    if (!canRemoveMessage(thread, course, req.user)) {
      return res.status(403).json({
        message: "You cannot remove this post."
      });
    }

    thread.title = "Removed discussion";
    thread.body = "This discussion was removed.";
    thread.removedAt = new Date();
    thread.removedBy = req.user._id;

    await thread.save();

    return res.json({
      message: "Discussion removed. Existing replies remain visible."
    });
  })
);

router.post(
  "/courses/:courseId/:threadId/replies",
  wrap(async (req, res) => {
    const course = await accessibleCourse(req, res);
    if (!course) return;

    const thread = await existingThread(
      req,
      res,
      course
    );

    if (!thread) return;

    if (thread.removedAt) {
      return res.status(409).json({
        message: "Cannot reply to a removed discussion."
      });
    }

    if (thread.replies.length >= 100) {
      return res.status(409).json({
        message:
          "This discussion reached its reply limit. Start another discussion."
      });
    }

    const fields = validateReply(req.body);

    thread.replies.push({
      author: req.user._id,
      body: fields.body
    });

    thread.lastActivityAt = new Date();

    await thread.save();

    return res.status(201).json({
      message: "Reply posted."
    });
  })
);

router.put(
  "/courses/:courseId/:threadId/replies/:replyId",
  wrap(async (req, res) => {
    const course = await accessibleCourse(req, res);
    if (!course) return;

    const thread = await existingThread(
      req,
      res,
      course
    );

    if (!thread) return;

    const reply = existingReply(req, res, thread);
    if (!reply) return;

    if (!canEditMessage(reply, req.user)) {
      return res.status(403).json({
        message: "You can edit only your own active reply."
      });
    }

    const fields = validateReply(req.body);

    reply.body = fields.body;
    await thread.save();

    return res.json({
      message: "Reply updated."
    });
  })
);

router.delete(
  "/courses/:courseId/:threadId/replies/:replyId",
  wrap(async (req, res) => {
    const course = await accessibleCourse(req, res);
    if (!course) return;

    const thread = await existingThread(
      req,
      res,
      course
    );

    if (!thread) return;

    const reply = existingReply(req, res, thread);
    if (!reply) return;

    if (!canRemoveMessage(reply, course, req.user)) {
      return res.status(403).json({
        message: "You cannot remove this reply."
      });
    }

    reply.body = "This reply was removed.";
    reply.removedAt = new Date();
    reply.removedBy = req.user._id;

    await thread.save();

    return res.json({
      message: "Reply removed."
    });
  })
);

router.use((error, _req, res, _next) => {
  if (
    error.name === "ValidationError" ||
    error.name === "CastError"
  ) {
    return res.status(400).json({
      message: error.message
    });
  }

  if (
    error.message &&
    /must (?:be|contain)/.test(error.message)
  ) {
    return res.status(400).json({
      message: error.message
    });
  }

  console.error("Discussion API error:", error);

  return res.status(500).json({
    message: "Could not complete discussion request."
  });
});

module.exports = router;