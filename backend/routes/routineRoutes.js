const express = require("express");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const mongoose = require("mongoose");
const multer = require("multer");

const Routine = require("../models/Routine");

const {
  protect,
  authorize
} = require("../middleware/authMiddleware");

const {
  canonicalDepartment,
  canViewRoutine,
  canManageRoutine,
  validateMetadata,
  fileMime,
  safeStoredName,
  matchesSignature,
  safeOriginalName
} = require("../services/routineRules");

const router = express.Router();

const uploadDir = path.join(
  __dirname,
  "..",
  "private_uploads",
  "routines"
);

fs.mkdirSync(uploadDir, { recursive: true });

router.use(protect);

const upload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, callback) =>
      callback(null, uploadDir),

    filename: (_req, file, callback) => {
      const extension =
        path.extname(file.originalname).toLowerCase();

      callback(
        null,
        `${crypto.randomUUID()}${extension}`
      );
    }
  }),

  fileFilter: (_req, file, callback) => {
    if (!fileMime(file.originalname)) {
      return callback(
        new Error(
          "Allowed: PDF, JPG, PNG, DOCX, XLSX or PPTX."
        )
      );
    }

    callback(null, true);
  },

  limits: {
    fileSize: 10 * 1024 * 1024,
    files: 1,
    fields: 4,
    parts: 5,
    fieldSize: 3000
  }
}).single("file");

function receiveFile(req, res, next) {
  upload(req, res, (error) => {
    if (!error) return next();

    return res.status(
      error.code === "LIMIT_FILE_SIZE" ? 413 : 400
    ).json({
      message:
        error.code === "LIMIT_FILE_SIZE"
          ? "Routine file must be 10 MB or smaller."
          : error.message
    });
  });
}

async function removeTemp(file) {
  if (file?.path) {
    await fs.promises.unlink(file.path).catch(() => {});
  }
}

async function verifyFile(file) {
  const bytes = await fs.promises.readFile(file.path);

  return matchesSignature(
    file.originalname,
    bytes
  );
}

function fileInfo(file) {
  return {
    storedName: file.filename,
    originalName: safeOriginalName(file.originalname),
    mimeType: fileMime(file.originalname),
    size: file.size
  };
}

function safeView(item) {
  return {
    _id: item._id,
    title: item.title,
    description: item.description || "",
    department: item.department,
    term: item.term || "",
    originalName: item.originalName,
    mimeType: item.mimeType,
    size: item.size,
    isPublished: item.isPublished,
    uploadedBy: item.uploadedBy,
    createdAt: item.createdAt,
    updatedAt: item.updatedAt
  };
}

async function findRoutine(req, res) {
  if (!mongoose.isValidObjectId(req.params.id)) {
    res.status(400).json({
      message: "Invalid routine ID."
    });
    return null;
  }

  const routine = await Routine.findById(req.params.id)
    .populate("uploadedBy", "name role");

  if (!routine) {
    res.status(404).json({
      message: "Routine not found."
    });
    return null;
  }

  return routine;
}

function sendError(res, error) {
  if (
    error.name === "ValidationError" ||
    error.name === "CastError"
  ) {
    return res.status(400).json({
      message: error.message
    });
  }

  console.error("Routine API error:", error);

  return res.status(500).json({
    message: "Could not complete the routine request."
  });
}

router.get(
  "/",
  authorize("staff", "student", "faculty"),
  async (req, res) => {
    try {
      const department =
        typeof req.user.department === "string"
          ? req.user.department.trim()
          : "";

      const departmentKey =
        canonicalDepartment(department);

      if (
        req.user.role !== "staff" &&
        (!departmentKey || departmentKey === "all")
      ) {
        return res.json([]);
      }

      const ownDepartmentQuery = departmentKey &&
        departmentKey !== "all"
        ? [
            { departmentKey },
            ...(department ? [{ department }] : [])
          ]
        : [];

      const filter =
        req.user.role === "staff"
          ? {
              $or: [
                ...ownDepartmentQuery,
                { uploadedBy: req.user._id }
              ]
            }
          : {
              isPublished: true,
              $or: ownDepartmentQuery
            };

      const records = await Routine.find(filter)
        .populate("uploadedBy", "name role")
        .sort({ updatedAt: -1 })
        .limit(200)
        .lean();

      const visible = records.filter((routine) =>
        canViewRoutine(routine, req.user)
      );

      return res.json(visible.map(safeView));
    } catch (error) {
      return sendError(res, error);
    }
  }
);

// Staff uploads a published routine for THEIR account department.
// Client-supplied department or section values are ignored.
router.post(
  "/",
  authorize("staff"),
  receiveFile,
  async (req, res) => {
    let kept = false;

    try {
      if (!req.file) {
        return res.status(400).json({
          message: "Choose a routine picture or document."
        });
      }

      const fields = validateMetadata(
        req.body,
        req.user.department
      );

      if (!(await verifyFile(req.file))) {
        return res.status(400).json({
          message:
            "File content does not match the selected file type."
        });
      }

      const routine = await Routine.create({
        ...fields,
        ...fileInfo(req.file),
        isPublished: true,
        uploadedBy: req.user._id,
        updatedBy: req.user._id
      });

      kept = true;

      return res.status(201).json({
        message:
          "Routine uploaded for your registered department.",
        routine: safeView(routine)
      });
    } catch (error) {
      return sendError(res, error);
    } finally {
      if (!kept) {
        await removeTemp(req.file);
      }
    }
  }
);

// Only the Staff member who uploaded the routine may edit it.
// Department always comes from the Staff account.
router.put(
  "/:id",
  authorize("staff"),
  receiveFile,
  async (req, res) => {
    let kept = false;

    try {
      const routine = await findRoutine(req, res);
      if (!routine) return;

      if (!canManageRoutine(routine, req.user)) {
        return res.status(403).json({
          message: "You can edit only routines you uploaded."
        });
      }

      const fields = validateMetadata(
        req.body,
        req.user.department
      );

      if (
        req.file &&
        !(await verifyFile(req.file))
      ) {
        return res.status(400).json({
          message:
            "File content does not match the selected file type."
        });
      }

      const oldFile = routine.storedName;

      Object.assign(routine, fields);

      if (req.file) {
        Object.assign(routine, fileInfo(req.file));
      }

      routine.updatedBy = req.user._id;

      await routine.save();
      kept = Boolean(req.file);

      if (
        req.file &&
        safeStoredName(oldFile)
      ) {
        await fs.promises.unlink(
          path.join(uploadDir, oldFile)
        ).catch(() => {});
      }

      return res.json({
        message:
          "Routine saved for your registered department.",
        routine: safeView(routine)
      });
    } catch (error) {
      return sendError(res, error);
    } finally {
      if (req.file && !kept) {
        await removeTemp(req.file);
      }
    }
  }
);

router.delete(
  "/:id",
  authorize("staff"),
  async (req, res) => {
    try {
      const routine = await findRoutine(req, res);
      if (!routine) return;

      if (!canManageRoutine(routine, req.user)) {
        return res.status(403).json({
          message: "You can delete only routines you uploaded."
        });
      }

      const storedName = routine.storedName;
      await routine.deleteOne();

      if (safeStoredName(storedName)) {
        await fs.promises.unlink(
          path.join(uploadDir, storedName)
        ).catch(() => {});
      }

      return res.json({
        message: "Routine deleted."
      });
    } catch (error) {
      return sendError(res, error);
    }
  }
);

router.get(
  "/:id/file",
  authorize("staff", "student", "faculty"),
  async (req, res) => {
    try {
      const routine = await findRoutine(req, res);
      if (!routine) return;

      if (!canViewRoutine(routine, req.user)) {
        return res.status(403).json({
          message:
            "This routine is not available for your department."
        });
      }

      if (!safeStoredName(routine.storedName)) {
        return res.status(404).json({
          message: "Routine file is unavailable."
        });
      }

      const filePath = path.join(
        uploadDir,
        routine.storedName
      );

      res.setHeader(
        "X-Content-Type-Options",
        "nosniff"
      );

      res.setHeader(
        "Cache-Control",
        "private, no-store"
      );

      res.setHeader(
        "Content-Type",
        routine.mimeType
      );

      if (req.query.download === "1") {
        return res.download(
          filePath,
          routine.originalName,
          (error) => {
            if (error && !res.headersSent) {
              res.status(404).json({
                message: "Routine file is unavailable."
              });
            }
          }
        );
      }

      const safeName = encodeURIComponent(
        routine.originalName
      );

      res.setHeader(
        "Content-Disposition",
        `inline; filename*=UTF-8''${safeName}`
      );

      return res.sendFile(filePath, (error) => {
        if (error && !res.headersSent) {
          res.status(404).json({
            message: "Routine file is unavailable."
          });
        }
      });
    } catch (error) {
      return sendError(res, error);
    }
  }
);

module.exports = router;