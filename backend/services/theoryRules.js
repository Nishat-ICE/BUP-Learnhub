const path = require("path");

const MIME = {
  ".pdf": "application/pdf",
  ".docx":
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ".pptx":
    "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png"
};

const idOf = (value) =>
  String(value?._id || value || "");

const hasAnswer = (answer) =>
  Boolean(
    answer &&
    (
      String(answer.text || "").trim() ||
      answer.attachment?.storedName
    )
  );

function validateTheoryQuiz(body) {
  const title =
    typeof body?.title === "string" ? body.title.trim() : "";

  const instructions =
    typeof body?.instructions === "string"
      ? body.instructions.trim()
      : "";

  const closesAt = new Date(body?.closesAt);
  const durationMinutes =
    Number(body?.durationMinutes);

  if (!title || title.length > 120) {
    throw new Error("Title must be 1-120 characters.");
  }

  if (instructions.length > 1000) {
    throw new Error("Instructions are too long.");
  }

  if (
    Number.isNaN(closesAt.getTime()) ||
    closesAt.getTime() <= Date.now()
  ) {
    throw new Error("Choose a future closing date and time.");
  }

  if (
    !Number.isInteger(durationMinutes) ||
    durationMinutes < 1 ||
    durationMinutes > 600
  ) {
    throw new Error("Time limit must be 1-600 minutes.");
  }

  if (
    !Array.isArray(body?.questions) ||
    body.questions.length < 1 ||
    body.questions.length > 10
  ) {
    throw new Error("Add 1-10 Theory questions.");
  }

  let totalPoints = 0;

  const questions = body.questions.map((item, index) => {
    const promptText =
      typeof item?.promptText === "string"
        ? item.promptText.trim()
        : "";

    const points = Number(item?.points);

    if (promptText.length > 2000) {
      throw new Error(
        `Question ${index + 1}: text must be 2000 characters or less.`
      );
    }

    if (
      !Number.isInteger(points) ||
      points < 1 ||
      points > 100
    ) {
      throw new Error(
        `Question ${index + 1}: marks must be 1-100.`
      );
    }

    totalPoints += points;

    const question = {
      promptText,
      points
    };

    if (
      item?._id &&
      /^[a-f\d]{24}$/i.test(String(item._id))
    ) {
      question._id = item._id;
    }

    return question;
  });

  if (totalPoints > 100) {
    throw new Error("Total Theory marks cannot exceed 100.");
  }

  return {
    title,
    instructions,
    closesAt,
    durationMinutes,
    questions
  };
}

function fileMime(filename) {
  return MIME[path.extname(filename || "").toLowerCase()] || null;
}

function safeStoredName(filename) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(pdf|docx|pptx|jpg|jpeg|png)$/i
    .test(filename || "");
}

function safeOriginalName(filename) {
  return path.win32
    .basename(String(filename || "file"))
    .replace(/[\x00-\x1f\x7f<>:"/\\|?*]/g, "_")
    .slice(0, 150);
}

function validSignature(filename, bytes) {
  const ext = path.extname(filename || "").toLowerCase();

  if (!Buffer.isBuffer(bytes) || !fileMime(filename)) {
    return false;
  }

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

  const validOfficeZip =
    bytes.subarray(0, 4).equals(
      Buffer.from([80, 75, 3, 4])
    ) &&
    bytes.includes(Buffer.from("[Content_Types].xml"));

  if (!validOfficeZip) return false;

  return ext === ".docx"
    ? bytes.includes(Buffer.from("word/document.xml"))
    : bytes.includes(Buffer.from("ppt/presentation.xml"));
}

module.exports = {
  idOf,
  hasAnswer,
  validateTheoryQuiz,
  fileMime,
  safeStoredName,
  safeOriginalName,
  validSignature
};