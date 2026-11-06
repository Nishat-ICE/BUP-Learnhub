const bcrypt = require("bcryptjs");
const User = require("../models/User");
const Course = require("../models/Course");
const Assignment = require("../models/Assignment");
const Quiz = require("../models/Quiz");
const QuizAttempt = require("../models/QuizAttempt");

async function autoSeedIfEmpty() {
  try {
    const count = await User.countDocuments();
    if (count > 0) return;

    console.log("Empty database detected on cloud! Auto-seeding BUP LearnHub demo data...");
    const passwordHash = await bcrypt.hash("12345678", 12);

    await User.create([
      {
        name: "LearnHub Administrator",
        email: "admin@learnhub.local",
        password: passwordHash,
        role: "admin",
        department: "University Administration",
        isActive: true
      },
      {
        name: "University Authority",
        email: "authority@learnhub.local",
        password: passwordHash,
        role: "authority",
        department: "University Administration",
        isActive: true
      }
    ]);

    const DEPARTMENTS = [
      { code: "ICT", name: "ICT", prefix: "ict", courses: ["Web Engineering", "Cyber Security", "Data Communication", "Cloud Computing"] },
      { code: "CSE", name: "CSE", prefix: "cse", courses: ["Algorithms", "Operating Systems", "Computer Networks", "Artificial Intelligence"] },
      { code: "ES", name: "ES", prefix: "es", courses: ["Ecology & Biodiversity", "Climate Change"] },
      { code: "ECON", name: "Economics", prefix: "econ", courses: ["Microeconomics", "Macroeconomics"] },
      { code: "ENG", name: "English", prefix: "eng", courses: ["Introduction to Poetry", "Academic Writing"] },
      { code: "LAW", name: "Law", prefix: "law", courses: ["Constitutional Law", "Law of Contract"] },
      { code: "BBA", name: "Business Administration", prefix: "bba", courses: ["Principles of Management", "Financial Accounting"] },
      { code: "PA", name: "Public Administration", prefix: "pa", courses: ["Public Policy Analysis", "Local Government"] },
      { code: "IR", name: "International Relations", prefix: "ir", courses: ["Theories of IR", "Foreign Policy Analysis"] },
      { code: "SOC", name: "Sociology", prefix: "soc", courses: ["Sociological Theory", "Social Research Methods"] },
      { code: "DS", name: "Development Studies", prefix: "ds", courses: ["Theories of Development", "Sustainable Development"] },
      { code: "MCJ", name: "Mass Communication and Journalism", prefix: "mcj", courses: ["News Reporting", "Media Law & Ethics"] },
      { code: "DHSM", name: "Disaster and Human Security Management", prefix: "dhsm", courses: ["Disaster Risk Reduction", "Emergency Response"] },
      { code: "PCHRS", name: "Peace, Conflict and Human Rights Studies", prefix: "pchrs", courses: ["Peace Studies", "Conflict Analysis"] },
      { code: "UADM", name: "University Administration", prefix: "uadm", courses: ["Higher Education Management", "Academic Governance"] }
    ];

    const FIRST = ["Tanvir", "Nusrat", "Farhan", "Tasnim", "Mahmudul", "Sadia", "Rakibul", "Arif", "Jannatul", "Sabbir"];
    const LAST = ["Hasan", "Jahan", "Ahmed", "Sultana", "Islam", "Akter", "Hossain", "Rahman"];
    let seed = 1;
    const pick = () => `${FIRST[seed % FIRST.length]} ${LAST[(seed++ * 3) % LAST.length]}`;

    const now = Date.now();
    const DAY = 24 * 60 * 60 * 1000;

    for (let dIdx = 0; dIdx < DEPARTMENTS.length; dIdx++) {
      const dept = DEPARTMENTS[dIdx];
      const students = [];

      for (let i = 1; i <= 3; i++) {
        const s = await User.create({
          name: pick(),
          email: `student.${dept.prefix}${i}@bup.edu.bd`,
          password: passwordHash,
          role: "student",
          department: dept.name,
          section: i % 2 === 0 ? "B" : "A",
          studentId: `24${String(dIdx + 10).padStart(2, "0")}${String(i).padStart(3, "0")}`,
          isActive: true
        });
        students.push(s);
      }

      const fac1 = await User.create({
        name: `Dr. ${pick()}`,
        email: `faculty.${dept.prefix}1@bup.edu.bd`,
        password: passwordHash,
        role: "faculty",
        department: dept.name,
        section: "A",
        isActive: true
      });

      await User.create({
        name: pick(),
        email: `staff.${dept.prefix}1@bup.edu.bd`,
        password: passwordHash,
        role: "staff",
        department: dept.name,
        section: "A",
        isActive: true
      });

      for (let c = 0; c < 2; c++) {
        const title = dept.courses[c % dept.courses.length];
        const code = `${dept.code}-${210 + c}`;
        const course = await Course.create({
          title,
          code,
          description: `${dept.name} course on ${title}.`,
          credit: 3,
          department: dept.name,
          faculty: fac1._id,
          students: students.map((st) => st._id)
        });

        await Assignment.create({
          title: `${code}: Analytical Report 1`,
          instructions: `Complete the ${title} report before the deadline.`,
          course: course._id,
          deadline: new Date(now + 4 * DAY),
          createdBy: fac1._id,
          submissions: students.slice(0, 2).map((st, idx) => ({
            student: st._id,
            text: `Submitted report for ${title}.`,
            grade: 82 + idx * 8,
            feedback: "Well written and clear analysis.",
            submittedAt: new Date(now - DAY)
          }))
        });

        const quiz = await Quiz.create({
          course: course._id,
          createdBy: fac1._id,
          title: `${code} Assessment Quiz 1`,
          instructions: `Answer all questions within 15 minutes.`,
          closesAt: new Date(now - DAY),
          durationMinutes: 15,
          isPublished: true,
          resultsPublished: true,
          questions: [
            {
              text: `Which principle is fundamental to ${title}?`,
              options: ["Structured design", "Ad-hoc guesswork", "Manual duplication", "None"],
              correctIndex: 0,
              points: 5
            },
            {
              text: `What improves reliability in ${code}?`,
              options: ["Skipping validation", "Systematic verification", "Ignoring logs", "Random inputs"],
              correctIndex: 1,
              points: 5
            }
          ]
        });

        for (let sIdx = 0; sIdx < 2; sIdx++) {
          await QuizAttempt.create({
            quiz: quiz._id,
            course: course._id,
            student: students[sIdx]._id,
            answers: quiz.questions.map((q) => ({
              questionId: q._id,
              selectedIndex: q.correctIndex
            })),
            score: 10,
            maxScore: 10,
            feedback: "Great job!",
            status: "submitted",
            startedAt: new Date(now - 2 * DAY),
            expiresAt: new Date(now - 2 * DAY + 15 * 60000),
            submittedAt: new Date(now - 2 * DAY + 8 * 60000)
          });
        }
      }
    }

    console.log("Cloud auto-seed complete! Default password for all seeded accounts: 12345678");
  } catch (err) {
    console.error("Auto-seed error:", err.message);
  }
}

module.exports = { autoSeedIfEmpty };