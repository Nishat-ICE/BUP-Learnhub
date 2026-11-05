const User = require("../models/User");
const Course = require("../models/Course");

function canonicalDepartment(value) {
  const text = String(value || "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");

  if (!text) return "";

  if (text === "ict" || text.includes("informationandcommunicationtechnology")) return "ict";
  if (text === "cse" || text.includes("computerscienceandengineering")) return "cse";
  if (text === "es" || text.includes("environmentalscience")) return "es";
  if (text === "econ" || text.includes("economics")) return "economics";
  if (text === "eng" || text.includes("english")) return "english";
  if (text === "law") return "law";
  if (text === "bba" || text.includes("businessadministration")) return "bba";
  if (text === "pa" || text.includes("publicadministration")) return "publicadministration";
  if (text === "ir" || text.includes("internationalrelations")) return "ir";
  if (text === "soc" || text.includes("sociology")) return "sociology";
  if (text === "ds" || text.includes("developmentstudies")) return "developmentstudies";
  if (text === "mcj" || text.includes("masscommunicationandjournalism")) return "mcj";
  if (text === "dhsm" || text.includes("disasterandhumansecuritymanagement")) return "dhsm";
  if (text === "pchrs" || text.includes("peaceconflictandhumanrightsstudies")) return "pchrs";
  if (text === "uadm" || text === "administration" || text.includes("universityadministration")) {
    return "universityadministration";
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
  const targetKey = canonicalDepartment(department);
  if (!targetKey) return [];

  const courses = await Course.find()
    .populate("faculty", "department")
    .select("_id department faculty")
    .lean();

  return courses
    .filter((c) => {
      const courseDept = c.department || c.faculty?.department || "";
      return canonicalDepartment(courseDept) === targetKey;
    })
    .map((c) => c._id);
}

module.exports = {
  canonicalDepartment,
  sameDepartment,
  getDepartmentUserIds,
  getDepartmentCourseIds
};