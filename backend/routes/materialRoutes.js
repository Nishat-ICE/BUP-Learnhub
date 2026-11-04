const express = require("express");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const mongoose = require("mongoose");
const multer = require("multer");

const Course = require("../models/Course");
const { protect, authorize } = require("../middleware/authMiddleware");
const {
  canRead,
  canWrite,
  fileType,
  matchesSignature,
  safeStoredName
} = require("../services/materialSecurity");

const router = express.Router();
const uploadDir = path.join(
  __dirname, "..", "private_uploads", "materials"
);

fs.mkdirSync(uploadDir, { recursive: true });

router.use(protect, authorize("student", "faculty"));

const upload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, callback) =>
      callback(null, uploadDir),

    filename: (_req, file, callback) => {
      const ext = path.extname(file.originalname).toLowerCase();
      callback(null, `${crypto.randomUUID()}${ext}`);
    }
  }),

  fileFilter: (_req, file, callback) => {
    if (!fileType(file.originalname)) {
      return callback(
        new Error("Only PDF, DOCX, PPTX, JPG and PNG are allowed.")
      );
    }

    callback(null, true);
  },

  limits: {
    fileSize: 10 * 1024 * 1024,
    files: 1,
    fields: 3,
    parts: 4,
    fieldSize: 2000
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
          ? "File must be 10 MB or smaller."
          : error.message
    });
  });
}

async function getCourse(req, res) {
  if (!mongoose.isValidObjectId(req.params.courseId)) {
    res.status(400).json({ message: "Invalid course ID." });
    return null;
  }

  const course = await Course.findById(req.params.courseId);

  if (!course) {
    res.status(404).json({ message: "Course not found." });
    return null;
  }

  return course;
}

function getMaterial(course, id) {
  return mongoose.isValidObjectId(id)
    ? course.materials.id(id)
    : null;
}

function metadata(body) {
  const title =
    typeof body?.title === "string" ? body.title.trim() : "";

  const description =
    typeof body?.description === "string"
      ? body.description.trim()
      : "";

  const category =
    typeof body?.category === "string"
      ? body.category.trim()
      : "";

  if (!title || title.length > 120) {
    return { error: "Title must contain 1-120 characters." };
  }

  if (description.length > 700) {
    return { error: "Description must be 700 characters or less." };
  }

  if (!["lecture", "slides", "reading", "other"].includes(category)) {
    return { error: "Select a valid material category." };
  }

  return { title, description, category };
}

function attachment(file) {
  const cleanName = path.win32.basename(file.originalname)
    .replace(/[\x00-\x1f\x7f<>:"/\\|?*]/g, "_")
    .slice(0, 160);

  return {
    storedName: file.filename,
    originalName: cleanName || "material",
    mimeType: fileType(file.originalname),
    size: file.size
  };
}

function publicMaterial(material) {
  return {
    _id: material._id,
    title: material.title,
    category: material.category || "other",
    description: material.description || "",
    originalName: material.originalName || "",
    size: material.size || 0,
    uploadedAt: material.uploadedAt,
    downloadable: Boolean(material.storedName)
  };
}

function serverError(res, error) {
  console.error("Materials error:", error);
  return res.status(500).json({
    message: "Could not complete materials request."
  });
}

async function discard(file) {
  if (file?.path) {
    await fs.promises.unlink(file.path).catch(() => {});
  }
}

async function verified(file) {
  const bytes = await fs.promises.readFile(file.path);
  return matchesSignature(file.originalname, bytes);
}

// Student: enrolled course only. Faculty: own course only.
router.get("/courses/:courseId", async (req, res) => {
  try {
    const course = await getCourse(req, res);
    if (!course) return;

    if (!canRead(course, req.user)) {
      return res.status(403).json({ message: "Access denied." });
    }

    const materials = course.materials
      .map(publicMaterial)
      .sort(
        (a, b) =>
          (new Date(b.uploadedAt).getTime() || 0) -
          (new Date(a.uploadedAt).getTime() || 0)
      );

    return res.json({
      course: {
        _id: course._id,
        code: course.code,
        title: course.title
      },
      materials
    });
  } catch (error) {
    return serverError(res, error);
  }
});

router.post(
  "/courses/:courseId",
  authorize("faculty"),
  receiveFile,
  async (req, res) => {
    let saved = false;

    try {
      const course = await getCourse(req, res);
      if (!course) return;

      if (!canWrite(course, req.user)) {
        return res.status(403).json({
          message: "Only the course faculty can add materials."
        });
      }

      const fields = metadata(req.body);

      if (fields.error) {
        return res.status(400).json({ message: fields.error });
      }

      if (!req.file) {
        return res.status(400).json({
          message: "Please select a file to upload."
        });
      }

      if (!(await verified(req.file))) {
        return res.status(400).json({
          message: "File content does not match its format."
        });
      }

      course.materials.push({
        ...fields,
        ...attachment(req.file),
        uploadedBy: req.user._id,
        uploadedAt: new Date()
      });

      await course.save();
      saved = true;

      return res.status(201).json({
        message: "Material uploaded.",
        material: publicMaterial(course.materials.at(-1))
      });
    } catch (error) {
      return serverError(res, error);
    } finally {
      if (!saved) await discard(req.file);
    }
  }
);

router.put(
  "/courses/:courseId/:materialId",
  authorize("faculty"),
  receiveFile,
  async (req, res) => {
    let saved = false;

    try {
      const course = await getCourse(req, res);
      if (!course) return;

      if (!canWrite(course, req.user)) {
        return res.status(403).json({ message: "Access denied." });
      }

      const material = getMaterial(course, req.params.materialId);

      if (!material) {
        return res.status(404).json({
          message: "Material not found."
        });
      }

      const fields = metadata(req.body);

      if (fields.error) {
        return res.status(400).json({ message: fields.error });
      }

      if (req.file && !(await verified(req.file))) {
        return res.status(400).json({
          message: "File content does not match its format."
        });
      }

      const oldFile = material.storedName;

      material.title = fields.title;
      material.category = fields.category;
      material.description = fields.description;

      if (req.file) {
        Object.assign(material, attachment(req.file));
      }

      await course.save();
      saved = true;

      if (
        req.file &&
        safeStoredName(oldFile) &&
        oldFile !== req.file.filename
      ) {
        await fs.promises.unlink(
          path.join(uploadDir, oldFile)
        ).catch(() => {});
      }

      return res.json({
        message: "Material updated.",
        material: publicMaterial(material)
      });
    } catch (error) {
      return serverError(res, error);
    } finally {
      if (!saved) await discard(req.file);
    }
  }
);

router.delete(
  "/courses/:courseId/:materialId",
  authorize("faculty"),
  async (req, res) => {
    try {
      const course = await getCourse(req, res);
      if (!course) return;

      if (!canWrite(course, req.user)) {
        return res.status(403).json({ message: "Access denied." });
      }

      const material = getMaterial(course, req.params.materialId);

      if (!material) {
        return res.status(404).json({
          message: "Material not found."
        });
      }

      const oldFile = material.storedName;

      course.materials.pull(material._id);
      await course.save();

      if (safeStoredName(oldFile)) {
        await fs.promises.unlink(
          path.join(uploadDir, oldFile)
        ).catch(() => {});
      }

      return res.json({ message: "Material deleted." });
    } catch (error) {
      return serverError(res, error);
    }
  }
);

router.get(
  "/courses/:courseId/:materialId/file",
  async (req, res) => {
    try {
      const course = await getCourse(req, res);
      if (!course) return;

      if (!canRead(course, req.user)) {
        return res.status(403).json({ message: "Access denied." });
      }

      const material = getMaterial(course, req.params.materialId);

      if (!material || !safeStoredName(material.storedName)) {
        return res.status(404).json({
          message: "File not available."
        });
      }

      res.setHeader("Cache-Control", "private, no-store");
      res.setHeader("X-Content-Type-Options", "nosniff");

      return res.download(
        path.join(uploadDir, material.storedName),
        material.originalName || "material",
        (error) => {
          if (error && !res.headersSent) {
            res.status(404).json({
              message: "File not available."
            });
          }
        }
      );
    } catch (error) {
      return serverError(res, error);
    }
  }
);

module.exports = router;