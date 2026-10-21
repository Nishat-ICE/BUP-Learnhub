const express = require("express");
const crypto = require("crypto");
const bcrypt = require("bcryptjs");
const mongoose = require("mongoose");

const User = require("../models/User");
const ResetRequest = require("../models/PasswordResetRequest");
const Audit = require("../models/LeadershipAudit");
const { protect, authorize } = require("../middleware/authMiddleware");

const router = express.Router();

const PENDING_MS = 24 * 60 * 60 * 1000;
const CODE_MS = 20 * 60 * 1000;
const MAX_ATTEMPTS = 5;

const requestLimits = new Map();
const completionLimits = new Map();
const emailCooldown = new Map();

const genericRequestMessage =
  "If an active account matches this email, a reset request has been sent for administrator review.";

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const wrap = (handler) => (req, res, next) =>
  Promise.resolve(handler(req, res, next)).catch(next);

const hashCode = (code) =>
  crypto.createHash("sha256").update(code).digest("hex");

function withinLimit(store, key, maximum, windowMs) {
  const now = Date.now();
  const record = store.get(key);

  if (!record || record.until < now) {
    store.set(key, { count: 1, until: now + windowMs });
    return true;
  }

  if (record.count >= maximum) return false;

  record.count += 1;
  return true;
}

async function logAction(admin, action, userId) {
  try {
    await Audit.create({
      actor: admin._id,
      action,
      target: String(userId)
    });
  } catch (error) {
    console.error("Reset audit log failed:", error);
  }
}

// Public. Response does not reveal whether the account exists.
router.post(
  "/request",
  wrap(async (req, res) => {
    const email =
      typeof req.body?.email === "string"
        ? req.body.email.trim().toLowerCase()
        : "";

    if (!emailPattern.test(email) || email.length > 254) {
      return res.status(400).json({
        message: "Enter a valid email address."
      });
    }

    const ip = req.ip || "unknown";
    const emailKey = hashCode(email);

    if (
      !withinLimit(requestLimits, ip, 5, 15 * 60 * 1000) ||
      !withinLimit(emailCooldown, emailKey, 1, 60 * 1000)
    ) {
      return res.status(429).json({
        message: "Please wait before requesting another reset."
      });
    }

    const user = await User.findOne({
      email,
      isActive: { $ne: false }
    });

    if (user) {
      const active = await ResetRequest.findOne({
        user: user._id,
        status: { $in: ["pending", "approved"] }
      }).sort({ createdAt: -1 });

      const pendingValid =
        active?.status === "pending" &&
        Date.now() - active.createdAt.getTime() < PENDING_MS;

      const codeValid =
        active?.status === "approved" &&
        active.expiresAt &&
        active.expiresAt.getTime() > Date.now();

      if (!pendingValid && !codeValid) {
        await ResetRequest.updateMany(
          {
            user: user._id,
            status: { $in: ["pending", "approved"] }
          },
          {
            $set: {
              status: "expired",
              codeHash: null
            }
          }
        );

        await ResetRequest.create({
          user: user._id,
          status: "pending"
        });
      }
    }

    return res.json({ message: genericRequestMessage });
  })
);

// Public. User must provide the one-time code and choose their own password.
router.post(
  "/complete",
  wrap(async (req, res) => {
    const email =
      typeof req.body?.email === "string"
        ? req.body.email.trim().toLowerCase()
        : "";

    const code =
      typeof req.body?.code === "string"
        ? req.body.code.trim().toLowerCase()
        : "";

    const password = req.body?.newPassword;

    if (
      !emailPattern.test(email) ||
      !/^[0-9a-f]{32}$/.test(code)
    ) {
      return res.status(400).json({
        message: "Invalid or expired reset code."
      });
    }

    if (
      typeof password !== "string" ||
      password.length < 8 ||
      password.length > 128
    ) {
      return res.status(400).json({
        message: "New password must be 8â€“128 characters."
      });
    }

    if (
      !withinLimit(
        completionLimits,
        req.ip || "unknown",
        10,
        15 * 60 * 1000
      )
    ) {
      return res.status(429).json({
        message: "Too many attempts. Try again later."
      });
    }

    const user = await User.findOne({
      email,
      isActive: { $ne: false }
    });

    if (!user) {
      return res.status(400).json({
        message: "Invalid or expired reset code."
      });
    }

    const request = await ResetRequest.findOne({
      user: user._id,
      status: "approved",
      expiresAt: { $gt: new Date() }
    })
      .sort({ createdAt: -1 })
      .select("+codeHash");

    if (
      !request ||
      !request.codeHash ||
      request.attempts >= MAX_ATTEMPTS
    ) {
      return res.status(400).json({
        message: "Invalid or expired reset code."
      });
    }

    const suppliedHash = hashCode(code);
    const valid =
      crypto.timingSafeEqual(
        Buffer.from(suppliedHash, "hex"),
        Buffer.from(request.codeHash, "hex")
      );

    if (!valid) {
      const failed = await ResetRequest.findOneAndUpdate(
        { _id: request._id, status: "approved" },
        { $inc: { attempts: 1 } },
        { new: true }
      );

      if (failed && failed.attempts >= MAX_ATTEMPTS) {
        await ResetRequest.updateOne(
          { _id: request._id },
          {
            $set: {
              status: "expired",
              codeHash: null
            }
          }
        );
      }

      return res.status(400).json({
        message: "Invalid or expired reset code."
      });
    }

    const newHash = await bcrypt.hash(password, 12);

    // Claim once: concurrent requests cannot reuse the same code.
    const claimed = await ResetRequest.findOneAndUpdate(
      {
        _id: request._id,
        status: "approved",
        codeHash: request.codeHash,
        attempts: { $lt: MAX_ATTEMPTS },
        expiresAt: { $gt: new Date() }
      },
      {
        $set: {
          status: "completed",
          codeHash: null
        }
      }
    );

    if (!claimed) {
      return res.status(400).json({
        message: "Invalid or expired reset code."
      });
    }

    const updated = await User.updateOne(
      {
        _id: user._id,
        isActive: { $ne: false }
      },
      {
        $set: { password: newHash },
        $inc: { authVersion: 1 }
      }
    );

    if (!updated.matchedCount) {
      return res.status(400).json({
        message: "Account is unavailable. Request a new reset."
      });
    }

    await ResetRequest.updateMany(
      {
        user: user._id,
        status: { $in: ["pending", "approved"] }
      },
      {
        $set: {
          status: "expired",
          codeHash: null
        }
      }
    );

    return res.json({
      message: "Password updated. Sign in again."
    });
  })
);

// Admin-console in-app notification.
router.get(
  "/admin/requests",
  protect,
  authorize("admin"),
  wrap(async (_req, res) => {
    const filter = {
      status: "pending",
      createdAt: {
        $gte: new Date(Date.now() - PENDING_MS)
      }
    };

    const [items, pendingCount] = await Promise.all([
      ResetRequest.find(filter)
        .populate(
          "user",
          "name email role department studentId isActive"
        )
        .sort({ createdAt: -1 })
        .limit(50)
        .lean(),
      ResetRequest.countDocuments(filter)
    ]);

    return res.json({ items, pendingCount });
  })
);

router.post(
  "/admin/requests/:id/approve",
  protect,
  authorize("admin"),
  wrap(async (req, res) => {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json({
        message: "Invalid request ID."
      });
    }

    const pending = await ResetRequest.findById(req.params.id)
      .populate("user", "email isActive");

    if (!pending || pending.status !== "pending") {
      return res.status(409).json({
        message: "Request is no longer pending."
      });
    }

    if (
      Date.now() - pending.createdAt.getTime() >= PENDING_MS
    ) {
      return res.status(410).json({
        message: "Request expired. Ask the user to request again."
      });
    }

    if (!pending.user || pending.user.isActive === false) {
      return res.status(409).json({
        message: "User account is unavailable."
      });
    }

    const code = crypto.randomBytes(16).toString("hex");
    const expiresAt = new Date(Date.now() + CODE_MS);

    const approved = await ResetRequest.findOneAndUpdate(
      {
        _id: pending._id,
        status: "pending"
      },
      {
        $set: {
          status: "approved",
          codeHash: hashCode(code),
          attempts: 0,
          approvedAt: new Date(),
          approvedBy: req.user._id,
          expiresAt
        }
      }
    );

    if (!approved) {
      return res.status(409).json({
        message: "Request was already processed."
      });
    }

    await logAction(
      req.user,
      "password_reset_approved",
      pending.user._id
    );

    // Plaintext code is returned ONLY once in this response.
    return res.json({
      message: "Approved.",
      email: pending.user.email,
      code,
      expiresAt
    });
  })
);

router.post(
  "/admin/requests/:id/reject",
  protect,
  authorize("admin"),
  wrap(async (req, res) => {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json({
        message: "Invalid request ID."
      });
    }

    const rejected = await ResetRequest.findOneAndUpdate(
      {
        _id: req.params.id,
        status: "pending"
      },
      {
        $set: {
          status: "rejected",
          codeHash: null
        }
      }
    );

    if (!rejected) {
      return res.status(409).json({
        message: "Request is no longer pending."
      });
    }

    await logAction(
      req.user,
      "password_reset_rejected",
      rejected.user
    );

    return res.json({ message: "Request rejected." });
  })
);

router.use((error, _req, res, _next) => {
  console.error("Password reset error:", error);

  return res.status(500).json({
    message: "Password reset service is unavailable."
  });
});

module.exports = router;