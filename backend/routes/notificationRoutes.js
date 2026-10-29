const express = require("express");
const mongoose = require("mongoose");

const Notification = require("../models/Notification");
const {
  syncNotifications,
  courseScope
} = require("../services/notificationFeed");

const {
  protect
} = require("../middleware/authMiddleware");

const router = express.Router();
router.use(protect);

function handleError(res, error) {
  console.error("Notification error:", error);

  return res.status(500).json({
    message: "Notifications are temporarily unavailable."
  });
}

router.get("/", async (req, res) => {
  try {
    const courseIds = await syncNotifications(req.user);
    const scope = courseScope(req.user, courseIds);

    const requestedPage = Number.parseInt(
      req.query.page,
      10
    );

    const page = Number.isFinite(requestedPage)
      ? Math.min(
          1000,
          Math.max(1, requestedPage)
        )
      : 1;

    const requestedLimit = Number.parseInt(
      req.query.limit,
      10
    );

    const limit = Number.isFinite(requestedLimit)
      ? Math.min(
          20,
          Math.max(1, requestedLimit)
        )
      : 20;

    const onlyUnread =
      req.query.unread === "1";

    const filter = onlyUnread
      ? { ...scope, readAt: null }
      : scope;

    const [items, total, unreadCount] =
      await Promise.all([
        Notification.find(filter)
          .select(
            "_id type title message link readAt issuedAt createdAt"
          )
          .sort({
            createdAt: -1,
            _id: -1
          })
          .skip((page - 1) * limit)
          .limit(limit)
          .lean(),

        Notification.countDocuments(filter),

        Notification.countDocuments({
          ...scope,
          readAt: null
        })
      ]);

    return res.json({
      items,
      total,
      unreadCount,
      page,
      pages: Math.max(
        1,
        Math.ceil(total / limit)
      )
    });
  } catch (error) {
    return handleError(res, error);
  }
});

router.patch("/read-all", async (req, res) => {
  try {
    const courseIds = await syncNotifications(req.user);
    const scope = courseScope(req.user, courseIds);

    await Notification.updateMany(
      {
        ...scope,
        readAt: null
      },
      {
        $set: { readAt: new Date() }
      }
    );

    return res.json({
      message: "Notifications marked as read."
    });
  } catch (error) {
    return handleError(res, error);
  }
});

router.patch("/:id/read", async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json({
        message: "Invalid notification ID."
      });
    }

    const courseIds = await syncNotifications(req.user);
    const scope = courseScope(req.user, courseIds);

    const notification =
      await Notification.findOneAndUpdate(
        {
          ...scope,
          _id: req.params.id,
          readAt: null
        },
        {
          $set: { readAt: new Date() }
        },
        { new: true }
      );

    if (!notification) {
      const exists = await Notification.exists({
        ...scope,
        _id: req.params.id
      });

      if (!exists) {
        return res.status(404).json({
          message: "Notification not found."
        });
      }
    }

    return res.json({
      message: "Marked as read."
    });
  } catch (error) {
    return handleError(res, error);
  }
});

module.exports = router;