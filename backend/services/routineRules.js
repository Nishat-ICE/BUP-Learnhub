const path = require("path");

const MIME = {
  ".pdf": "application/pdf",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".docx":
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ".xlsx":
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ".pptx":
    "application/vnd.openxmlformats-officedocument.presentationml.presentation"
};

function canonicalDepartment(value) {
  const text = String(value || "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");

  if (
    text === "all" ||
    text === "alldepartment" ||
    text === "alldepartments" ||
    text === "universitywide"
  ) {
    return "all";
  }

  if (
    text.includes("ict") ||
    text.includes("informationandcommunicationtechnology")
  ) {
    return "ict";
  }

  if (
    text.includes("cse") ||
    text.includes("computerscienceandengineering")
  ) {
    return "cse";
  }

  if (
    text.includes("businessadministration") ||
    text === "bba"
  ) {
    return "bba";
  }

  if (
    text.includes("environmentalscience") ||
    text === "es"
  ) {
    return "es";
  }

  if (
    text.includes("internationalrelations") ||
    text === "ir"
  ) {
    return "ir";
  }

  return text;
}

function canViewRoutine(routine, user) {
  if (!routine || !user || user.isActive === false) {
    return false;
  }

  const uploadedBy =
    String(routine.uploadedBy?._id || routine.uploadedBy || "");

  const routineDepartment =
    routine.departmentKey ||
    canonicalDepartment(routine.department);

  const userDepartment =
    canonicalDepartment(user.department);

  const sameDepartment =
    Boolean(
      userDepartment &&
      userDepartment !== "all" &&
      routineDepartment === userDepartment
    );

  // Staff can see their department's routines and their own
  // legacy uploads, so they can update old routine records.
  if (user.role === "staff") {
    return sameDepartment || uploadedBy === String(user._id);
  }

  // Student and Faculty see all sections in their department.
  return (
    ["student", "faculty"].includes(user.role) &&
    routine.isPublished !== false &&
    sameDepartment
  );
}

function canManageRoutine(routine, user) {
  return Boolean(
    routine &&
    user?.role === "staff" &&
    String(routine.uploadedBy?._id || routine.uploadedBy || "") ===
      String(user._id)
  );
}

function validateMetadata(body, staffDepartment) {
  const title =
    typeof body?.title === "string"
      ? body.title.trim()
      : "";

  const description =
    typeof body?.description === "string"
      ? body.description.trim()
      : "";

  const term =
    typeof body?.term === "string"
      ? body.term.trim()
      : "";

  const department =
    typeof staffDepartment === "string"
      ? staffDepartment.trim()
      : "";

  const departmentKey =
    canonicalDepartment(department);

  if (!title || title.length > 120) {
    throw new Error("Routine title must be 1-120 characters.");
  }

  if (
    !department ||
    !departmentKey ||
    departmentKey === "all"
  ) {
    throw new Error(
      "Staff account-e valid department set kora nei."
    );
  }

  if (description.length > 700) {
    throw new Error(
      "Description must be 700 characters or less."
    );
  }

  if (term.length > 80) {
    throw new Error("Term must be 80 characters or less.");
  }

  return {
    title,
    description,
    department,
    departmentKey,
    section: "All",
    sectionKey: "ALL",
    term
  };
}

function fileMime(filename) {
  return MIME[
    path.extname(filename || "").toLowerCase()
  ] || null;
}

function safeStoredName(filename) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(pdf|png|jpg|jpeg|docx|xlsx|pptx)$/i
    .test(filename || "");
}

function matchesSignature(filename, bytes) {
  const ext = path.extname(filename || "").toLowerCase();

  if (!Buffer.isBuffer(bytes) || !fileMime(filename)) {
    return false;
  }

  if (ext === ".pdf") {
    return bytes.subarray(0, 5).equals(
      Buffer.from("%PDF-")
    );
  }

  if (ext === ".png") {
    return bytes.subarray(0, 8).equals(
      Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])
    );
  }

  if (ext === ".jpg" || ext === ".jpeg") {
    return (
      bytes.length >= 3 &&
      bytes[0] === 255 &&
      bytes[1] === 216 &&
      bytes[2] === 255
    );
  }

  const isOfficeZip =
    bytes.subarray(0, 4).equals(
      Buffer.from([80, 75, 3, 4])
    ) &&
    bytes.includes(Buffer.from("[Content_Types].xml"));

  if (!isOfficeZip) return false;

  if (ext === ".docx") {
    return bytes.includes(
      Buffer.from("word/document.xml")
    );
  }

  if (ext === ".xlsx") {
    return bytes.includes(
      Buffer.from("xl/workbook.xml")
    );
  }

  return bytes.includes(
    Buffer.from("ppt/presentation.xml")
  );
}

function safeOriginalName(filename) {
  return path.win32
    .basename(String(filename || "routine"))
    .replace(/[\x00-\x1f\x7f<>:"/\\|?*]/g, "_")
    .slice(0, 150);
}

module.exports = {
  canonicalDepartment,
  canViewRoutine,
  canManageRoutine,
  validateMetadata,
  fileMime,
  safeStoredName,
  matchesSignature,
  safeOriginalName
};