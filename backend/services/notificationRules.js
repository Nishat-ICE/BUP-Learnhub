function idOf(value) {
  return String(value?._id || value || "");
}

function matchesSection(studentSection, targetSection) {
  const target = String(targetSection || "").trim().toUpperCase();
  const student = String(studentSection || "").trim().toUpperCase();

  return target === "ALL" || Boolean(student && student === target);
}

function hasPublishedGrade(submission) {
  return (
    typeof submission?.grade === "number" &&
    Number.isFinite(submission.grade) &&
    submission.grade >= 0 &&
    submission.grade <= 100
  );
}

function belongsToCourse(course, user) {
  if (!course || !user || user.isActive === false) {
    return false;
  }

  if (user.role === "student") {
    return (course.students || []).some(
      (student) => idOf(student) === idOf(user._id)
    );
  }

  if (user.role === "faculty") {
    return idOf(course.faculty) === idOf(user._id);
  }

  return false;
}

module.exports = {
  idOf,
  matchesSection,
  hasPublishedGrade,
  belongsToCourse
};