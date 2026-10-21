const express = require("express");
const cors = require("cors");
const dotenv = require("dotenv");
const connectDB = require("./config/db");

dotenv.config();
connectDB();

const app = express();

app.use(cors());
app.use(express.json());

app.get("/", (req, res) => {
  res.send("BUP LearnHub API is running successfully");
});

app.use("/api/auth/register", async (req, res, next) => {
  if (req.method !== "POST") return next();

  const requestedRole =
    String(req.body?.role || "student").trim().toLowerCase();

  if (!["student", "faculty", "staff"].includes(requestedRole)) {
    return res.status(403).json({
      message: "Only Student, Faculty and Academic Staff can register."
    });
  }

  try {
    const Setting = require("./models/LeadershipSetting");
    const setting = await Setting.findOne({
      key: "registrationEnabled"
    }).lean();

    if (setting?.value === false) {
      return res.status(403).json({
        message: "Registration is currently closed."
      });
    }

    return next();
  } catch (error) {
    console.error("Registration setting error:", error);
    return res.status(503).json({
      message: "Registration is temporarily unavailable."
    });
  }
});
app.use("/api/auth", require("./routes/authRoutes"));
app.use("/api/courses", require("./routes/courseRoutes"));
app.use("/api/assignments", require("./routes/assignmentRoutes"));
app.use("/api/assignment-uploads", require("./routes/assignmentUploadRoutes"));
app.use("/api/announcements", require("./routes/announcementRoutes"));
app.use("/api/academic-updates", require("./routes/academicUpdateRoutes"));
app.use("/api/grades", require("./routes/gradeRoutes"));

app.use("/api/management", require("./routes/leadershipRoutes"));
app.use("/api/password-reset", require("./routes/passwordResetRoutes"));

const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
