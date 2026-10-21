const path = require("path");
const crypto = require("crypto");
const bcrypt = require("bcryptjs");
const mongoose = require("mongoose");

require("dotenv").config({
  path: path.join(__dirname, "..", ".env")
});

const User = require("../models/User");

const accounts = [
  {
    role: "admin",
    name: "LearnHub Administrator",
    email: "admin@learnhub.local",
    department: "Administration"
  },
  {
    role: "authority",
    name: "University Authority",
    email: "authority@learnhub.local",
    department: "University Administration"
  }
];

const resetArg = process.argv[2] || "";
const resetRole = resetArg.startsWith("--reset=")
  ? resetArg.slice("--reset=".length)
  : "";

(async () => {
  try {
    if (
      resetArg &&
      !["admin", "authority"].includes(resetRole)
    ) {
      throw new Error(
        "Use no argument, --reset=admin or --reset=authority."
      );
    }

    const uri = process.env.MONGO_URI || "";

    if (
      !/^mongodb:\/\/(?:127\.0\.0\.1|localhost)(?::\d+)?\//.test(uri)
    ) {
      throw new Error(
        "For safety this demo seed only runs against local MongoDB."
      );
    }

    await mongoose.connect(uri);

    for (const account of accounts) {
      if (resetRole && account.role !== resetRole) continue;

      const existing = await User.findOne({
        email: account.email
      });

      if (existing && existing.role !== account.role) {
        throw new Error(
          `${account.email} exists with another role. Nothing changed for this account.`
        );
      }

      if (existing && !resetRole) {
        console.log(
          `${account.role}: ${account.email} already exists. Password unchanged.`
        );
        continue;
      }

      const password =
        crypto.randomBytes(18).toString("base64url");

      if (existing) {
        existing.password = await bcrypt.hash(password, 12);
        await existing.save();
      } else {
        await User.create({
          ...account,
          password: await bcrypt.hash(password, 12),
          isActive: true
        });
      }

      console.log("");
      console.log(`ROLE: ${account.role.toUpperCase()}`);
      console.log(`EMAIL: ${account.email}`);
      console.log(`PASSWORD: ${password}`);
      console.log("Write this password down; it will not be shown again.");
    }
  } catch (err) {
    console.error("Account setup failed:", err.message);
    process.exitCode = 1;
  } finally {
    await mongoose.disconnect().catch(() => {});
  }
})();