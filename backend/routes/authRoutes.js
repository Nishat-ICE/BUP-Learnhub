const express = require("express");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const User = require("../models/User");
const { protect } = require("../middleware/authMiddleware");

const router = express.Router();

const generateToken = (id, authVersion = 0) => {
  return jwt.sign({ id, authVersion }, process.env.JWT_SECRET, {
    expiresIn: "7d"
  });
};

router.post("/register", async (req, res) => {
  try {
    const {
      name,
      email,
      password,
      role,
      studentId,
      department,
      section
    } = req.body || {};

    const selectedRole =
      typeof role === "string" ? role.trim().toLowerCase() : "";

    if (!["student", "faculty", "staff"].includes(selectedRole)) {
      return res.status(403).json({
        message: "Only Student, Faculty and Academic Staff can register."
      });
    }

    if (
      typeof name !== "string" ||
      !name.trim() ||
      typeof email !== "string" ||
      !email.trim() ||
      typeof department !== "string" ||
      !department.trim()
    ) {
      return res.status(400).json({
        message: "Name, email and department are required."
      });
    }

    const cleanEmail = email.trim().toLowerCase();

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
      return res.status(400).json({
        message: "Enter a valid email address."
      });
    }

    if (
      typeof password !== "string" ||
      password.length < 8 ||
      password.length > 128
    ) {
      return res.status(400).json({
        message: "Password must be between 8 and 128 characters."
      });
    }

    const existingUser = await User.findOne({ email: cleanEmail });
    if (existingUser) {
      return res.status(409).json({
        message: "An account already exists with this email."
      });
    }

    const user = await User.create({
      name: name.trim(),
      email: cleanEmail,
      password: await bcrypt.hash(password, 12),
      role: selectedRole,
      studentId:
        selectedRole === "student" && typeof studentId === "string"
          ? studentId.trim()
          : "",
      department: department.trim(),
      section: typeof section === "string" ? section.trim() : ""
    });

    return res.status(201).json({
      message: "Registration successful.",
      token: generateToken(user._id, user.authVersion ?? 0),
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        department: user.department,
        section: user.section,
        studentId: user.studentId
      }
    });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(409).json({
        message: "An account already exists with this email."
      });
    }

    console.error("Registration error:", error);
    return res.status(500).json({
      message: "Registration failed."
    });
  }
});

router.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;

    const user = await User.findOne({ email });

    if (!user || !user.isActive) {
      return res.status(401).json({ message: "Invalid email or inactive account." });
    }

    const matched = await bcrypt.compare(password, user.password);

    if (!matched) {
      return res.status(401).json({ message: "Invalid password." });
    }

    res.json({
      message: "Login successful",
      token: generateToken(user._id, user.authVersion ?? 0),
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        department: user.department,
        section: user.section,
        studentId: user.studentId
      }
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

router.get("/me", protect, async (req, res) => {
  res.json(req.user);
});

module.exports = router;
