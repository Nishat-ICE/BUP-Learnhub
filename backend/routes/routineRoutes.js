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
    kind: item.kind || "file",
    slots: item.slots || [],
    days: item.days || [],
    entries: item.entries || [],
    originalName: item.originalName || "",
    mimeType: item.mimeType || "",
    size: item.size || 0,
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


// Inline HTML preview for .docx routine files (so View works without downloading)
router.get(
  "/:id/preview",
  authorize("staff", "student", "faculty"),
  async (req, res) => {
    try {
      const routine = await findRoutine(req, res);
      if (!routine) return;

      if (!canViewRoutine(routine, req.user)) {
        return res.status(403).json({
          message: "This routine is not available for your department."
        });
      }

      if (!safeStoredName(routine.storedName)) {
        return res.status(404).json({ message: "Routine file is unavailable." });
      }

      const filePath = path.join(uploadDir, routine.storedName);
      if (!fs.existsSync(filePath)) {
        return res.status(404).json({ message: "Routine file is unavailable on server." });
      }

      const ext = path.extname(routine.originalName || routine.storedName).toLowerCase();

      if (ext === ".docx") {
        const mammoth = require("mammoth");
        const result = await mammoth.convertToHtml({ path: filePath });
        return res.json({
          kind: "html",
          html: result.value || "<p>Empty document.</p>"
        });
      }

      return res.json({ kind: "binary" });
    } catch (error) {
      return sendError(res, error);
    }
  }
);


// ============================================================
// AUTO ROUTINE GENERATOR ENGINE (Conflict-Free Department Timetable)
// ============================================================
const Course = require("../models/Course");
const { getDepartmentCourseIds } = require("../services/departmentScope");

const DEFAULT_DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday"];
const DEFAULT_SLOTS = [
  "08:30 - 09:50",
  "10:00 - 11:20",
  "11:30 - 12:50",
  "14:00 - 15:20"
];

function buildSmartTimetable(courses, rooms, sessionsPerCourse = 2) {
  const roomList =
    Array.isArray(rooms) && rooms.length > 0
      ? rooms
      : ["Room 401", "Room 402", "Lab 301"];

  const entries = [];
  // Track occupied (day, slot) for each faculty and room so there is ZERO clash
  const busyFaculty = new Set();
  const busyRoom = new Set();
  const courseDayUsed = new Set();

  // Create lecture tasks (each course gets `sessionsPerCourse` classes per week on distinct days)
  const tasks = [];
  courses.forEach((c, idx) => {
    const count = Math.max(1, Math.min(4, Number(sessionsPerCourse) || 2));
    for (let s = 0; s < count; s++) {
      tasks.push({
        courseCode: c.code || `COURSE-${idx + 1}`,
        courseTitle: c.title || "Academic Course",
        facultyName: c.faculty?.name || "Assigned Faculty",
        facultyId: String(c.faculty?._id || c.faculty || idx),
        sessionIndex: s,
        preferredRoom: roomList[(idx + s) % roomList.length]
      });
    }
  });

  let cursor = 0;
  const totalCells = DEFAULT_DAYS.length * DEFAULT_SLOTS.length;

  for (const task of tasks) {
    let placed = false;

    for (let attempt = 0; attempt < totalCells * 2; attempt++) {
      const cellIndex = (cursor + attempt) % totalCells;
      const dayIdx = cellIndex % DEFAULT_DAYS.length;
      const slotIdx = Math.floor(cellIndex / DEFAULT_DAYS.length);

      const day = DEFAULT_DAYS[dayIdx];
      const slot = DEFAULT_SLOTS[slotIdx];

      // Avoid putting the same course twice on the same day unless necessary
      const sameDayKey = `${task.courseCode}|${day}`;
      if (attempt < totalCells && courseDayUsed.has(sameDayKey)) {
        continue;
      }

      const facKey = `${day}|${slot}|${task.facultyId}`;
      if (busyFaculty.has(facKey)) continue;

      // Find an available room for this (day, slot)
      let chosenRoom = null;
      for (let r = 0; r < roomList.length; r++) {
        const candidate = roomList[(r + dayIdx + slotIdx) % roomList.length];
        const roomKey = `${day}|${slot}|${candidate}`;
        if (!busyRoom.has(roomKey)) {
          chosenRoom = candidate;
          busyRoom.add(roomKey);
          break;
        }
      }

      if (!chosenRoom) continue;

      busyFaculty.add(facKey);
      courseDayUsed.add(sameDayKey);

      entries.push({
        day,
        slot,
        courseCode: task.courseCode,
        courseTitle: task.courseTitle,
        facultyName: task.facultyName,
        room: chosenRoom
      });

      cursor = (cellIndex + 1) % totalCells;
      placed = true;
      break;
    }

    if (!placed) {
      // Fallback placement if grid is completely saturated
      const day = DEFAULT_DAYS[entries.length % DEFAULT_DAYS.length];
      const slot = DEFAULT_SLOTS[Math.floor(entries.length / DEFAULT_DAYS.length) % DEFAULT_SLOTS.length];
      entries.push({
        day,
        slot,
        courseCode: task.courseCode,
        courseTitle: task.courseTitle,
        facultyName: task.facultyName,
        room: task.preferredRoom
      });
    }
  }

  return {
    days: DEFAULT_DAYS,
    slots: DEFAULT_SLOTS,
    entries
  };
}

// POST /api/routines/auto-generate -> Generates a conflict-free preview grid from department courses
router.post(
  "/auto-generate",
  authorize("staff"),
  async (req, res) => {
    try {
      const dept =
        typeof req.user.department === "string"
          ? req.user.department.trim()
          : "ICT";

      const deptCourseIds = await getDepartmentCourseIds(dept);
      const courses = await Course.find({ _id: { $in: deptCourseIds } })
        .populate("faculty", "name email department")
        .sort({ code: 1 })
        .lean();

      if (courses.length === 0) {
        return res.status(404).json({
          message: `No courses found in ${dept} department. Create courses first to auto-generate a routine.`
        });
      }

      const rawRooms =
        typeof req.body?.rooms === "string" ? req.body.rooms : "";
      const rooms = rawRooms
        .split(",")
        .map((r) => r.trim())
        .filter(Boolean);

      const sessionsPerCourse = Number(req.body?.sessionsPerCourse) || 2;
      const generated = buildSmartTimetable(courses, rooms, sessionsPerCourse);

      return res.json({
        department: dept,
        courseCount: courses.length,
        ...generated
      });
    } catch (error) {
      return sendError(res, error);
    }
  }
);

// POST /api/routines/generated -> Saves & publishes the auto-generated routine
router.post(
  "/generated",
  authorize("staff"),
  async (req, res) => {
    try {
      const fields = validateMetadata(req.body, req.user.department);
      const days = Array.isArray(req.body?.days) && req.body.days.length
        ? req.body.days
        : DEFAULT_DAYS;
      const slots = Array.isArray(req.body?.slots) && req.body.slots.length
        ? req.body.slots
        : DEFAULT_SLOTS;
      const entries = Array.isArray(req.body?.entries) ? req.body.entries : [];

      if (entries.length === 0) {
        return res.status(400).json({
          message: "Generate the routine timetable grid before publishing."
        });
      }

      const routine = await Routine.create({
        ...fields,
        kind: "generated",
        days,
        slots,
        entries: entries.map((e) => ({
          day: String(e.day || ""),
          slot: String(e.slot || ""),
          courseCode: String(e.courseCode || "").trim(),
          courseTitle: String(e.courseTitle || "").trim(),
          facultyName: String(e.facultyName || "").trim(),
          room: String(e.room || "").trim()
        })),
        storedName: "auto-generated-grid",
        originalName: `${fields.department}-Auto-Routine.pdf`,
        mimeType: "application/json",
        size: entries.length,
        isPublished: true,
        uploadedBy: req.user._id,
        updatedBy: req.user._id
      });

      return res.status(201).json({
        message: "Auto-generated routine published for your department!",
        routine: safeView(routine)
      });
    } catch (error) {
      return sendError(res, error);
    }
  }
);

// PUT /api/routines/:id/generated -> Update an existing auto-generated routine
router.put(
  "/:id/generated",
  authorize("staff"),
  async (req, res) => {
    try {
      const routine = await findRoutine(req, res);
      if (!routine) return;

      if (!canManageRoutine(routine, req.user)) {
        return res.status(403).json({
          message: "You can edit only routines you created."
        });
      }

      const fields = validateMetadata(req.body, req.user.department);
      const entries = Array.isArray(req.body?.entries) ? req.body.entries : [];

      Object.assign(routine, fields);
      routine.kind = "generated";
      if (Array.isArray(req.body?.days) && req.body.days.length) {
        routine.days = req.body.days;
      }
      if (Array.isArray(req.body?.slots) && req.body.slots.length) {
        routine.slots = req.body.slots;
      }
      routine.entries = entries.map((e) => ({
        day: String(e.day || ""),
        slot: String(e.slot || ""),
        courseCode: String(e.courseCode || "").trim(),
        courseTitle: String(e.courseTitle || "").trim(),
        facultyName: String(e.facultyName || "").trim(),
        room: String(e.room || "").trim()
      }));
      routine.updatedBy = req.user._id;

      await routine.save();

      return res.json({
        message: "Auto-generated routine updated successfully.",
        routine: safeView(routine)
      });
    } catch (error) {
      return sendError(res, error);
    }
  }
);
module.exports = router;