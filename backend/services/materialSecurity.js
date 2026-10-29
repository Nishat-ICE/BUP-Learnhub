const path = require("path");

const TYPES = Object.freeze({
  ".pdf": "application/pdf",
  ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ".pptx": "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg"
});

const idOf = (value) =>
  String(value?._id || value || "");

const canRead = (course, user) => {
  if (!course || !user) return false;

  if (user.role === "faculty") {
    return idOf(course.faculty) === idOf(user._id);
  }

  if (user.role === "student") {
    return (course.students || []).some(
      (student) => idOf(student) === idOf(user._id)
    );
  }

  return false;
};

const canWrite = (course, user) =>
  Boolean(
    course &&
    user?.role === "faculty" &&
    idOf(course.faculty) === idOf(user._id)
  );

const fileType = (name) =>
  TYPES[path.extname(name || "").toLowerCase()] || null;

function matchesSignature(name, bytes) {
  if (!Buffer.isBuffer(bytes) || !fileType(name)) return false;

  const ext = path.extname(name).toLowerCase();

  if (ext === ".pdf") {
    return bytes.subarray(0, 5).equals(Buffer.from("%PDF-"));
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

  const zipHeader =
    bytes.subarray(0, 4).equals(Buffer.from([80, 75, 3, 4]));

  if (!zipHeader ||
      !bytes.includes(Buffer.from("[Content_Types].xml"))) {
    return false;
  }

  return ext === ".docx"
    ? bytes.includes(Buffer.from("word/document.xml"))
    : bytes.includes(Buffer.from("ppt/presentation.xml"));
}

const safeStoredName = (name) =>
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(pdf|docx|pptx|png|jpg|jpeg)$/i
    .test(name || "");

module.exports = {
  canRead,
  canWrite,
  fileType,
  matchesSignature,
  safeStoredName
};