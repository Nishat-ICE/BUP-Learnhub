const path = require("path");
const fs = require("fs");
require("dotenv").config({ path: path.join(__dirname, "..", ".env") });

const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");
const User = require("../models/User");
const Course = require("../models/Course");

const DEPARTMENTS = [
  { code: "ICT", name: "ICT", prefix: "ict", courses: ["Web Engineering", "Cyber Security", "Data Communication", "Cloud Computing"] },
  { code: "CSE", name: "CSE", prefix: "cse", courses: ["Algorithms", "Operating Systems", "Computer Networks", "Artificial Intelligence"] },
  { code: "ES", name: "ES", prefix: "es", courses: ["Ecology & Biodiversity", "Climate Change", "GIS & Remote Sensing", "Water Management"] },
  { code: "ECON", name: "Economics", prefix: "econ", courses: ["Microeconomics", "Macroeconomics", "Econometrics", "Development Economics"] },
  { code: "ENG", name: "English", prefix: "eng", courses: ["Introduction to Poetry", "Modern Drama", "Phonetics & Phonology", "Academic Writing"] },
  { code: "LAW", name: "Law", prefix: "law", courses: ["Constitutional Law", "Law of Contract", "Criminal Law", "International Law"] },
  { code: "BBA", name: "Business Administration", prefix: "bba", courses: ["Principles of Management", "Financial Accounting", "Marketing Management", "Corporate Finance"] },
  { code: "PA", name: "Public Administration", prefix: "pa", courses: ["Public Policy Analysis", "Local Government", "E-Governance", "Development Administration"] },
  { code: "IR", name: "International Relations", prefix: "ir", courses: ["Theories of IR", "Foreign Policy Analysis", "International Security", "Diplomacy"] },
  { code: "SOC", name: "Sociology", prefix: "soc", courses: ["Sociological Theory", "Social Research Methods", "Rural & Urban Sociology", "Criminology"] },
  { code: "DS", name: "Development Studies", prefix: "ds", courses: ["Theories of Development", "Sustainable Development", "Project Planning", "Global Governance"] },
  { code: "MCJ", name: "Mass Communication and Journalism", prefix: "mcj", courses: ["News Reporting", "Media Law & Ethics", "Digital Media", "Public Relations"] },
  { code: "DHSM", name: "Disaster and Human Security Management", prefix: "dhsm", courses: ["Disaster Risk Reduction", "Emergency Response", "Climate Adaptation", "Community Resilience"] },
  { code: "PCHRS", name: "Peace, Conflict and Human Rights Studies", prefix: "pchrs", courses: ["Peace Studies", "Conflict Analysis", "Human Rights", "Peacebuilding"] },
  { code: "UADM", name: "University Administration", prefix: "uadm", courses: ["Higher Education Management", "Academic Governance", "Institutional Planning", "Quality Assurance"] }
];

const FIRST_NAMES = [
  "Tanvir", "Nusrat", "Farhan", "Tasnim", "Mahmudul", "Sadia", "Rakibul",
  "Arif", "Jannatul", "Sabbir", "Sumaiya", "Mehedi", "Fariha", "Shakib",
  "Nabila", "Tariqul", "Tahmina", "Fahim", "Maliha", "Rashed"
];

const LAST_NAMES = [
  "Hasan", "Jahan", "Ahmed", "Sultana", "Islam", "Akter", "Hossain",
  "Rahman", "Karim", "Chowdhury", "Uddin", "Kabir"
];

function pickName(seed) {
  const f = FIRST_NAMES[seed % FIRST_NAMES.length];
  const l = LAST_NAMES[(seed * 3 + 5) % LAST_NAMES.length];
  return `${f} ${l}`;
}

(async () => {
  try {
    await mongoose.connect(process.env.MONGO_URI);

    // 1. Remove previously auto-seeded accounts & their auto-seeded courses
    const oldSeededUsers = await User.find({
      email: /^(student|faculty|staff)\.[a-z]+[0-9]+@bup\.edu\.bd$/i
    }).select("_id");

    const oldUserIds = oldSeededUsers.map((u) => u._id);
    if (oldUserIds.length > 0) {
      await Course.deleteMany({ faculty: { $in: oldUserIds } });
      await User.deleteMany({ _id: { $in: oldUserIds } });
      console.log(`Cleaned up ${oldUserIds.length} previous auto-seeded users & their courses.`);
    }

    // 2. Seed compact, clean set: 3 Students, 2 Faculty, 1 Staff per dept; 2 Courses per Faculty
    const passwordHash = await bcrypt.hash("12345678", 12);
    let createdStudents = 0;
    let createdFaculties = 0;
    let createdStaff = 0;
    let createdCourses = 0;

    const allStudentsByDept = new Map();
    const allFaculties = [];
    const summaryLines = [
      "==============================================================",
      " BUP LearnHub - Compact Seeded Accounts (Password: 12345678)",
      "==============================================================",
      ""
    ];

    let nameSeed = 1;

    for (let dIdx = 0; dIdx < DEPARTMENTS.length; dIdx++) {
      const dept = DEPARTMENTS[dIdx];
      const studentCount = 3;
      const facultyCount = 2;
      const staffCount = 1;

      summaryLines.push(`--- Department: ${dept.name} (${dept.code}) ---`);

      const deptStudents = [];
      for (let i = 1; i <= studentCount; i++) {
        const email = `student.${dept.prefix}${i}@bup.edu.bd`;
        const user = await User.create({
          name: pickName(nameSeed++),
          email,
          password: passwordHash,
          role: "student",
          department: dept.name,
          section: i % 2 === 0 ? "B" : "A",
          studentId: `24${String(dIdx + 10).padStart(2, "0")}${String(i).padStart(3, "0")}`,
          isActive: true
        });
        createdStudents++;
        deptStudents.push(user);
      }
      allStudentsByDept.set(dept.code, deptStudents);
      summaryLines.push(
        `  Students (3): student.${dept.prefix}1@bup.edu.bd to student.${dept.prefix}3@bup.edu.bd`
      );

      for (let i = 1; i <= facultyCount; i++) {
        const email = `faculty.${dept.prefix}${i}@bup.edu.bd`;
        const user = await User.create({
          name: `Dr. ${pickName(nameSeed++)}`,
          email,
          password: passwordHash,
          role: "faculty",
          department: dept.name,
          section: "A",
          isActive: true
        });
        createdFaculties++;
        allFaculties.push({ user, dept, idx: i });
      }
      summaryLines.push(
        `  Faculty  (2): faculty.${dept.prefix}1@bup.edu.bd , faculty.${dept.prefix}2@bup.edu.bd`
      );

      for (let i = 1; i <= staffCount; i++) {
        const email = `staff.${dept.prefix}${i}@bup.edu.bd`;
        await User.create({
          name: pickName(nameSeed++),
          email,
          password: passwordHash,
          role: "staff",
          department: dept.name,
          section: "A",
          isActive: true
        });
        createdStaff++;
      }
      summaryLines.push(`  Staff    (1): staff.${dept.prefix}1@bup.edu.bd`);
      summaryLines.push("");
    }

    // 2 courses per Faculty
    for (let fIdx = 0; fIdx < allFaculties.length; fIdx++) {
      const { user: facUser, dept: homeDept, idx } = allFaculties[fIdx];

      for (let cNum = 1; cNum <= 2; cNum++) {
        const courseIndex = (idx - 1) * 2 + (cNum - 1);
        const baseTitle = homeDept.courses[courseIndex % homeDept.courses.length];
        const code = `${homeDept.code}-${200 + idx * 10 + cNum}`;
        const deptStudents = allStudentsByDept.get(homeDept.code) || [];

        await Course.create({
          title: baseTitle,
          code,
          description: `${homeDept.name} course on ${baseTitle}, taught by ${facUser.name}.`,
          credit: 3,
          faculty: facUser._id,
          students: deptStudents.map((s) => s._id)
        });
        createdCourses++;
      }
    }

    const infoPath = path.join(__dirname, "..", "..", "SEEDED_ACCOUNTS_LIST.txt");
    fs.writeFileSync(infoPath, summaryLines.join("\r\n"), "utf8");

    console.log("==============================================================");
    console.log("Compact Seed Complete! Password for all accounts: 12345678");
    console.log(`Students created : ${createdStudents} (3 per dept)`);
    console.log(`Faculties created: ${createdFaculties} (2 per dept)`);
    console.log(`Staff created    : ${createdStaff} (1 per dept)`);
    console.log(`Courses created  : ${createdCourses} (2 per faculty)`);
    console.log("==============================================================");
  } catch (err) {
    console.error("Seed error:", err);
    process.exitCode = 1;
  } finally {
    await mongoose.disconnect().catch(() => {});
  }
})();