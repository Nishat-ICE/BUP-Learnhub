const express = require("express");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const mongoose = require("mongoose");
const multer = require("multer");

const Routine = require("../models/Routine");
const Course = require("../models/Course");
const { getDepartmentCourseIds } = require("../services/departmentScope");

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
    fields: 6,
    parts: 7,
    fieldSize: 6000
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
    facultyHeader:
      item.facultyHeader || "FACULTY OF SCIENCE AND TECHNOLOGY (FST)",
    programHeader: item.programHeader || "PROGRAM: BICE & MICE",
    description: item.description || "",
    department: item.department,
    term: item.term || "",
    kind: item.kind || "file",
    slots: item.slots || [],
    days: item.days || [],
    batches: item.batches || [],
    examDates: item.examDates || [],
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
    error.name === "CastError" ||
    /must be|department/i.test(error.message || "")
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

      const ownDepartmentQuery =
        departmentKey && departmentKey !== "all"
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
        kind: "file",
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

      res.setHeader("X-Content-Type-Options", "nosniff");
      res.setHeader("Cache-Control", "private, no-store");
      res.setHeader("Content-Type", routine.mimeType);

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

      const safeName = encodeURIComponent(routine.originalName);

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

// Inline HTML preview for .docx routine files
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
// 1. AUTO WEEKLY CLASS ROUTINE GENERATOR (Strict Room & Time Clash Detection)
// ============================================================
const DEFAULT_DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday"];
const DEFAULT_SLOTS = [
  "08:30 - 09:50",
  "10:00 - 11:20",
  "11:30 - 12:50",
  "14:00 - 15:20"
];

function detectScheduleClashes(entries) {
  const roomBookings = new Map();
  const facultyBookings = new Map();

  for (const item of entries || []) {
    const day = String(item.day || "").trim();
    const slot = String(item.slot || "").trim();
    const room = String(item.room || "").trim();
    const courseCode = String(item.courseCode || "Course").trim();
    const facultyName = String(item.facultyName || "").trim();

    if (!day || !slot) continue;

    if (room) {
      const rKey = `${day.toLowerCase()}|${slot.toLowerCase()}|${room.toLowerCase()}`;
      if (roomBookings.has(rKey)) {
        const prevCourse = roomBookings.get(rKey);
        return `Room Clash Detected! Room "${room}" is double-booked on ${day} (${slot}) for both ${prevCourse} and ${courseCode}. Routine cannot be generated or published.`;
      }
      roomBookings.set(rKey, courseCode);
    }

    if (facultyName && facultyName !== "Assigned Faculty") {
      const fKey = `${day.toLowerCase()}|${slot.toLowerCase()}|${facultyName.toLowerCase()}`;
      if (facultyBookings.has(fKey)) {
        const prevCourse = facultyBookings.get(fKey);
        return `Faculty Time Clash Detected! ${facultyName} is scheduled simultaneously on ${day} (${slot}) for both ${prevCourse} and ${courseCode}.`;
      }
      facultyBookings.set(fKey, courseCode);
    }
  }

  return null;
}

function buildSmartTimetable(courses, rooms, sessionsPerCourse = 2) {
  const roomList =
    Array.isArray(rooms) && rooms.length > 0
      ? rooms
      : ["Room 401", "Room 402", "Lab 301"];

  const entries = [];
  const busyFaculty = new Map();
  const busyRoom = new Map();
  const courseDayUsed = new Set();

  const tasks = [];
  courses.forEach((c, idx) => {
    const count = Math.max(1, Math.min(4, Number(sessionsPerCourse) || 2));
    for (let s = 0; s < count; s++) {
      tasks.push({
        courseCode: c.code || `COURSE-${idx + 1}`,
        courseTitle: c.title || "Academic Course",
        facultyName: c.faculty?.name || "Assigned Faculty",
        facultyId: String(c.faculty?._id || c.faculty || idx),
        preferredRoom: roomList[(idx + s) % roomList.length]
      });
    }
  });

  let cursor = 0;
  const totalCells = DEFAULT_DAYS.length * DEFAULT_SLOTS.length;

  for (const task of tasks) {
    let placed = false;
    let lastRoomConflict = "";

    for (let attempt = 0; attempt < totalCells * 2; attempt++) {
      const cellIndex = (cursor + attempt) % totalCells;
      const dayIdx = cellIndex % DEFAULT_DAYS.length;
      const slotIdx = Math.floor(cellIndex / DEFAULT_DAYS.length);

      const day = DEFAULT_DAYS[dayIdx];
      const slot = DEFAULT_SLOTS[slotIdx];

      const sameDayKey = `${task.courseCode}|${day}`;
      if (attempt < totalCells && courseDayUsed.has(sameDayKey)) {
        continue;
      }

      const facKey = `${day}|${slot}|${task.facultyId}`;
      if (busyFaculty.has(facKey)) continue;

      let chosenRoom = null;
      for (let r = 0; r < roomList.length; r++) {
        const candidate = roomList[(r + dayIdx + slotIdx) % roomList.length];
        const roomKey = `${day}|${slot}|${candidate.toLowerCase()}`;
        if (!busyRoom.has(roomKey)) {
          chosenRoom = candidate;
          busyRoom.set(roomKey, task.courseCode);
          break;
        } else {
          lastRoomConflict = `Room "${candidate}" is already booked on ${day} (${slot}) for ${busyRoom.get(
            roomKey
          )}`;
        }
      }

      if (!chosenRoom) continue;

      busyFaculty.set(facKey, task.courseCode);
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
      return {
        clashError:
          `Room / Time Clash Detected! Cannot schedule ${task.courseCode} (${task.courseTitle}) because all provided rooms (${roomList.join(
            ", "
          )}) are already occupied in the available time slots. ${
            lastRoomConflict ? `(${lastRoomConflict}). ` : ""
          }Please add another room or reduce classes per week.`
      };
    }
  }

  return {
    days: DEFAULT_DAYS,
    slots: DEFAULT_SLOTS,
    entries
  };
}

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

      // Check for duplicate room names entered in the rooms input box
      const lowerRooms = rooms.map((r) => r.toLowerCase());
      const duplicateRoom = rooms.find(
        (r, i) => lowerRooms.indexOf(r.toLowerCase()) !== i
      );
      if (duplicateRoom) {
        return res.status(409).json({
          message: `Room Clash Detected! You entered "${duplicateRoom}" more than once in the Available Rooms box. Please provide distinct room names.`
        });
      }

      const sessionsPerCourse = Number(req.body?.sessionsPerCourse) || 2;
      const generated = buildSmartTimetable(courses, rooms, sessionsPerCourse);

      if (generated.clashError) {
        return res.status(409).json({
          message: generated.clashError
        });
      }

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

router.post(
  "/generated",
  authorize("staff"),
  async (req, res) => {
    try {
      const fields = validateMetadata(req.body, req.user.department);
      const days =
        Array.isArray(req.body?.days) && req.body.days.length
          ? req.body.days
          : DEFAULT_DAYS;
      const slots =
        Array.isArray(req.body?.slots) && req.body.slots.length
          ? req.body.slots
          : DEFAULT_SLOTS;
      const entries = Array.isArray(req.body?.entries) ? req.body.entries : [];

      if (entries.length === 0) {
        return res.status(400).json({
          message: "Generate the routine timetable grid before publishing."
        });
      }

      const clashMsg = detectScheduleClashes(entries);
      if (clashMsg) {
        return res.status(409).json({
          message: clashMsg
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

      const clashMsg = detectScheduleClashes(entries);
      if (clashMsg) {
        return res.status(409).json({
          message: clashMsg
        });
      }

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
// ============================================================
// 2. BUP OFFICIAL EXAM ROUTINE AUTO-GENERATOR (Start Date to End Date)
// ============================================================
const DAY_NAMES_FULL = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday"
];

function buildExamDates(startDateStr, endDateStr) {
  const start = startDateStr
    ? new Date(`${startDateStr}T00:00:00`)
    : new Date("2026-11-29T00:00:00");
  const cur = Number.isNaN(start.getTime())
    ? new Date("2026-11-29T00:00:00")
    : new Date(start);

  const endParsed = endDateStr ? new Date(`${endDateStr}T00:00:00`) : null;
  const hasValidEnd =
    endParsed && !Number.isNaN(endParsed.getTime()) && endParsed >= cur;

  const result = [];
  let safety = 0;

  if (hasValidEnd) {
    while (cur <= endParsed && safety < 60) {
      safety++;
      const dow = cur.getDay(); // 5 = Friday, 6 = Saturday
      if (dow !== 5 && dow !== 6) {
        const dd = String(cur.getDate()).padStart(2, "0");
        const mm = String(cur.getMonth() + 1).padStart(2, "0");
        const yyyy = cur.getFullYear();
        result.push({
          dateStr: `${dd}-${mm}-${yyyy}`,
          dayName: DAY_NAMES_FULL[dow]
        });
      }
      cur.setDate(cur.getDate() + 1);
    }
  }

  while (result.length < 5 && safety < 60) {
    safety++;
    const dow = cur.getDay();
    if (dow !== 5 && dow !== 6) {
      const dd = String(cur.getDate()).padStart(2, "0");
      const mm = String(cur.getMonth() + 1).padStart(2, "0");
      const yyyy = cur.getFullYear();
      result.push({
        dateStr: `${dd}-${mm}-${yyyy}`,
        dayName: DAY_NAMES_FULL[dow]
      });
    }
    cur.setDate(cur.getDate() + 1);
  }

  return result;
}

function parseBatchColumns(rawBatches) {
  const fallback = [
    { name: "BICE 2023", time: "1330-1630" },
    { name: "BICE 2024", time: "1330-1630" },
    { name: "BICE 2025", time: "0900-1200" },
    { name: "BICE 2026", time: "0900-1200" },
    { name: "MICE 2026", time: "1330-1630" }
  ];

  if (!rawBatches || typeof rawBatches !== "string" || !rawBatches.trim()) {
    return fallback;
  }

  const parsed = rawBatches
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => {
      const m = part.match(/^(.+?)\s*\((.+?)\)$/);
      if (m) {
        return { name: m[1].trim(), time: m[2].trim() };
      }
      return { name: part, time: "0900-1200" };
    });

  return parsed.length > 0 ? parsed : fallback;
}

const STAGGER_PATTERNS = [
  [1, 4, 6],
  [0, 3, 7],
  [1, 4, 6],
  [0, 3, 5],
  [0, 4, 7]
];

router.post(
  "/auto-generate-exam",
  authorize("staff"),
  async (req, res) => {
    try {
      if (
        req.body?.startDate &&
        req.body?.endDate &&
        req.body.endDate < req.body.startDate
      ) {
        return res.status(400).json({
          message: "Exam End Date cannot be earlier than Exam Start Date."
        });
      }

      const dept =
        typeof req.user.department === "string" && req.user.department.trim()
          ? req.user.department.trim()
          : "ICT";

      const deptCourseIds = await getDepartmentCourseIds(dept);
      const dbCourses = await Course.find({ _id: { $in: deptCourseIds } })
        .sort({ code: 1 })
        .lean();

      const batches = parseBatchColumns(req.body?.batches);
      const examDates = buildExamDates(req.body?.startDate, req.body?.endDate);

      const rawSubjectsText =
        typeof req.body?.batchSubjectsText === "string"
          ? req.body.batchSubjectsText.trim()
          : "";

      const customLines = rawSubjectsText
        ? rawSubjectsText
            .split(/\r?\n/)
            .map((l) => l.trim())
            .filter(Boolean)
        : [];

      const entries = [];
      const totalDays = examDates.length;

      batches.forEach((batch, bIdx) => {
        let batchCourses = [];

        const matchingLine =
          customLines.find((line) =>
            line.toLowerCase().startsWith(batch.name.toLowerCase() + ":")
          ) || customLines[bIdx];

        if (matchingLine) {
          const afterColon = matchingLine.includes(":")
            ? matchingLine.slice(matchingLine.indexOf(":") + 1)
            : matchingLine;

          batchCourses = afterColon
            .split("|")
            .flatMap((part) => part.split(";"))
            .map((s) => s.trim())
            .filter(Boolean)
            .map((itemText) => {
              const sp = itemText.indexOf(" ");
              const hasCode =
                sp > 0 && /^[A-Z]{2,6}-?\d{3,4}/i.test(itemText.slice(0, sp));
              return {
                code: hasCode ? itemText.slice(0, sp).trim() : "",
                title: hasCode ? itemText.slice(sp + 1).trim() : itemText
              };
            });
        } else if (dbCourses.length > 0) {
          for (let k = 0; k < Math.min(3, dbCourses.length); k++) {
            const c = dbCourses[(bIdx * 2 + k) % dbCourses.length];
            if (c) batchCourses.push({ code: c.code, title: c.title });
          }
        }

        const count = batchCourses.length;
        const pattern = STAGGER_PATTERNS[bIdx % STAGGER_PATTERNS.length];

        batchCourses.forEach((courseItem, cIdx) => {
          let dateRowIdx;
          if (totalDays === 8 && count <= 3 && pattern[cIdx] !== undefined) {
            dateRowIdx = pattern[cIdx];
          } else if (count === 1) {
            dateRowIdx = bIdx % totalDays;
          } else {
            const offset = bIdx % 2;
            const usableSpan = Math.max(1, totalDays - 1 - offset);
            dateRowIdx = Math.min(
              totalDays - 1,
              offset + Math.round((cIdx * usableSpan) / (count - 1))
            );
          }

          if (dateRowIdx >= 0 && dateRowIdx < totalDays) {
            const targetDate = examDates[dateRowIdx];
            entries.push({
              day: targetDate.dateStr,
              slot: batch.name,
              courseCode: courseItem.code,
              courseTitle: courseItem.title,
              facultyName: "",
              room: batch.time
            });
          }
        });
      });

      return res.json({
        department: dept,
        batches,
        examDates,
        entries
      });
    } catch (error) {
      return sendError(res, error);
    }
  }
);

router.post(
  "/exam",
  authorize("staff"),
  async (req, res) => {
    try {
      const fields = validateMetadata(req.body, req.user.department);
      const batches = Array.isArray(req.body?.batches) ? req.body.batches : [];
      const examDates = Array.isArray(req.body?.examDates) ? req.body.examDates : [];
      const entries = Array.isArray(req.body?.entries) ? req.body.entries : [];

      if (!batches.length || !examDates.length) {
        return res.status(400).json({
          message: "Generate the exam routine matrix before publishing."
        });
      }

      const routine = await Routine.create({
        ...fields,
        facultyHeader:
          typeof req.body?.facultyHeader === "string" && req.body.facultyHeader.trim()
            ? req.body.facultyHeader.trim()
            : "FACULTY OF SCIENCE AND TECHNOLOGY (FST)",
        programHeader:
          typeof req.body?.programHeader === "string" && req.body.programHeader.trim()
            ? req.body.programHeader.trim()
            : "PROGRAM: BICE & MICE",
        kind: "exam",
        batches,
        examDates,
        days: examDates.map((d) => d.dateStr),
        slots: batches.map((b) => b.name),
        entries: entries
          .filter((e) => String(e.courseCode || e.courseTitle || "").trim())
          .map((e) => ({
            day: String(e.day || ""),
            slot: String(e.slot || ""),
            courseCode: String(e.courseCode || "").trim(),
            courseTitle: String(e.courseTitle || "").trim(),
            facultyName: "",
            room: String(e.room || "").trim()
          })),
        storedName: "auto-generated-exam-routine",
        originalName: `${fields.department}-Exam-Routine.pdf`,
        mimeType: "application/json",
        size: Math.max(1, entries.length),
        isPublished: true,
        uploadedBy: req.user._id,
        updatedBy: req.user._id
      });

      return res.status(201).json({
        message: "Official Examination Routine published for your department!",
        routine: safeView(routine)
      });
    } catch (error) {
      return sendError(res, error);
    }
  }
);

router.put(
  "/:id/exam",
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
      const batches = Array.isArray(req.body?.batches)
        ? req.body.batches
        : routine.batches;
      const examDates = Array.isArray(req.body?.examDates)
        ? req.body.examDates
        : routine.examDates;
      const entries = Array.isArray(req.body?.entries) ? req.body.entries : [];

      Object.assign(routine, fields);
      routine.kind = "exam";
      if (typeof req.body?.facultyHeader === "string") {
        routine.facultyHeader = req.body.facultyHeader.trim();
      }
      if (typeof req.body?.programHeader === "string") {
        routine.programHeader = req.body.programHeader.trim();
      }
      routine.batches = batches;
      routine.examDates = examDates;
      routine.entries = entries
        .filter((e) => String(e.courseCode || e.courseTitle || "").trim())
        .map((e) => ({
          day: String(e.day || ""),
          slot: String(e.slot || ""),
          courseCode: String(e.courseCode || "").trim(),
          courseTitle: String(e.courseTitle || "").trim(),
          facultyName: "",
          room: String(e.room || "").trim()
        }));
      routine.updatedBy = req.user._id;

      await routine.save();

      return res.json({
        message: "Examination routine updated successfully.",
        routine: safeView(routine)
      });
    } catch (error) {
      return sendError(res, error);
    }
  }
);

module.exports = router;