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
    facultyHeader: item.facultyHeader || "FACULTY OF SCIENCE AND TECHNOLOGY (FST)",
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

// ============================================================
// BUP OFFICIAL EXAM ROUTINE AUTO-GENERATOR (Date x Batch Matrix)
// Skips Fridays & Saturdays and spaces exams with study gaps
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

function buildExamDates(startDateStr, workingDaysCount = 8) {
  const start = startDateStr ? new Date(`${startDateStr}T00:00:00`) : new Date("2026-11-29T00:00:00");
  const cur = Number.isNaN(start.getTime()) ? new Date("2026-11-29T00:00:00") : new Date(start);

  const result = [];
  let safety = 0;
  const target = Math.max(4, Math.min(20, Number(workingDaysCount) || 8));

  while (result.length < target && safety < 60) {
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

const BUP_ICT_EXAM_CATALOG = [
  [
    { code: "ICE-4105", title: "Optical Communication" },
    { code: "ICE-4103", title: "Information, Network and Software Security" },
    { code: "ICE-4101", title: "Software Testing and Maintenance" }
  ],
  [
    { code: "ICE-3201", title: "Microprocessor and Computer Architecture" },
    { code: "ICE-3207", title: "Software and Requirement Engineering" },
    { code: "ICE-3203", title: "Microwave Engineering and Antenna" }
  ],
  [
    { code: "ICE-2205", title: "Signals and Systems" },
    { code: "ICE-2203", title: "Database Management System" },
    { code: "ICE-2207", title: "Computer Network" }
  ],
  [
    { code: "MATH-1205", title: "Mathematics-II (Ordinary and Partial Differential Equations)" },
    { code: "ICE-1207", title: "Discrete Mathematics" },
    { code: "ICE-1203", title: "Electronic Devices and Circuit" }
  ],
  [
    { code: "MICE-5102", title: "Information and Cyber Security" },
    { code: "MICE-5103", title: "Big Data Analytics and Design" },
    { code: "MICE-5101", title: "Advanced Machine Learning" }
  ]
];

// Staggered row indices per batch (matches BUP Official Exam Routine photo with study gaps!)
const STAGGER_PATTERNS = [
  [1, 4, 6], // Batch 1 (e.g., BICE 2023): Mon, Thu, Mon
  [0, 3, 7], // Batch 2 (e.g., BICE 2024): Sun, Wed, Tue
  [1, 4, 6], // Batch 3 (e.g., BICE 2025): Mon, Thu, Mon
  [0, 3, 5], // Batch 4 (e.g., BICE 2026): Sun, Wed, Sun
  [0, 4, 7]  // Batch 5 (e.g., MICE 2026): Sun, Thu, Tue
];

router.post(
  "/auto-generate-exam",
  authorize("staff"),
  async (req, res) => {
    try {
      const dept =
        typeof req.user.department === "string" && req.user.department.trim()
          ? req.user.department.trim()
          : "ICT";

      const deptCourseIds = await getDepartmentCourseIds(dept);
      const dbCourses = await Course.find({ _id: { $in: deptCourseIds } })
        .sort({ code: 1 })
        .lean();

      const batches = parseBatchColumns(req.body?.batches);
      const examDates = buildExamDates(
        req.body?.startDate,
        req.body?.workingDays || 8
      );

      // Parse custom subjects entered by Staff (Format: one line per batch, comma/semicolon separated subjects)
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

      batches.forEach((batch, bIdx) => {
        let batchCourses = [];

        // 1. Check if Staff provided subjects for this batch in the input box
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
          // 2. Otherwise pull from this department's actual Courses in MongoDB
          for (let k = 0; k < Math.min(3, dbCourses.length); k++) {
            const c = dbCourses[(bIdx * 2 + k) % dbCourses.length];
            if (c) batchCourses.push({ code: c.code, title: c.title });
          }
        }

        const pattern = STAGGER_PATTERNS[bIdx % STAGGER_PATTERNS.length];

        batchCourses.forEach((courseItem, cIdx) => {
          const dateRowIdx =
            pattern[cIdx] !== undefined
              ? pattern[cIdx]
              : Math.min(examDates.length - 1, cIdx * 2 + (bIdx % 2));

          if (dateRowIdx < examDates.length) {
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

// POST /api/routines/exam -> Save & publish BUP Official Exam Routine
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

// PUT /api/routines/:id/exam -> Update existing Exam Routine
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
      const batches = Array.isArray(req.body?.batches) ? req.body.batches : routine.batches;
      const examDates = Array.isArray(req.body?.examDates) ? req.body.examDates : routine.examDates;
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