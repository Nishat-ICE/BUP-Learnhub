function idOf(value) {
  return String(value?._id || value || "");
}

function canReadCourse(course, user) {
  if (!course || !user || user.isActive === false) {
    return false;
  }

  if (user.role === "faculty") {
    return idOf(course.faculty) === idOf(user._id);
  }

  if (user.role === "student") {
    return (course.students || []).some(
      (student) => idOf(student) === idOf(user._id)
    );
  }

  return false;
}

function canEditMessage(message, user) {
  return Boolean(
    message &&
    !message.removedAt &&
    user &&
    ["student", "faculty"].includes(user.role) &&
    idOf(message.author) === idOf(user._id)
  );
}

function canRemoveMessage(message, course, user) {
  if (
    !message ||
    message.removedAt ||
    !canReadCourse(course, user)
  ) {
    return false;
  }

  if (user.role === "faculty") {
    return true;
  }

  return idOf(message.author) === idOf(user._id);
}

function requiredText(value, maximum, label) {
  if (typeof value !== "string") {
    throw new Error(`${label} must be text.`);
  }

  const cleaned = value.trim();

  if (!cleaned || cleaned.length > maximum) {
    throw new Error(
      `${label} must contain 1-${maximum} characters.`
    );
  }

  return cleaned;
}

function validateThread(body) {
  return {
    title: requiredText(body?.title, 120, "Title"),
    body: requiredText(body?.body, 2000, "Discussion")
  };
}

function validateReply(body) {
  return {
    body: requiredText(body?.body, 1200, "Reply")
  };
}

module.exports = {
  canReadCourse,
  canEditMessage,
  canRemoveMessage,
  validateThread,
  validateReply
};