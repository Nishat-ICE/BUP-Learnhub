const User = require("../models/User");
const Course = require("../models/Course");

function canonicalDepartment(value) {
  const text = String(value || "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");

  if (!text) return "";

  if (
    text === "ict" ||
    text.includes("informationandcommunicationtechnology")
  ) {
    return "ict";
  }

  if (
    text === "cse" ||
    text.includes("computerscienceandengineering")
  ) {
    return "cse";
  }

  if (
    text === "es" ||
    text.includes("environmentalscience")
  ) {
    return "es";
  }

  if (
    text === "bba" ||
    text.includes("businessadministration")
  ) {
    return "bba";
  }

  if (
    text === "ir" ||
    text.includes("internationalrelations")
  ) {
    return "ir";
  }

  return text;
}

function sameDepartment(deptA, deptB) {
  const a = canonicalDepartment(deptA);
  const b = canonicalDepartment(deptB);
  return Boolean(a && b && a === b);
}

async function getDepartmentUserIds(department, roleFilter = null) {
  const targetKey = canonicalDepartment(department);
  if (!targetKey) return [];

  const query = roleFilter ? { role: roleFilter } : {};
  const users = await User.find(query).select("_id department").lean();

  return users
    .filter((u) => canonicalDepartment(u.department) === targetKey)
    .map((u) => u._id);
}

async function getDepartmentCourseIds(department) {
  const facultyIds = await getDepartmentUserIds(department, "faculty");
  if (!facultyIds.length) return [];

  const courses = await Course.find({ faculty: { $in: facultyIds } })
    .select("_id")
    .lean();

  return courses.map((c) => c._id);
}

module.exports = {
  canonicalDepartment,
  sameDepartment,
  getDepartmentUserIds,
  getDepartmentCourseIds
};