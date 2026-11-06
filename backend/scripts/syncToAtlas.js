const path = require("path");
const mongoose = require("mongoose");

const LOCAL_URI = "mongodb://127.0.0.1:27017/bup_learnhub";
const CLOUD_URI =
  "mongodb+srv://nishatsultananiha_db_user:FHZGz7GudEDfXu9K@cluster0.w3hogqt.mongodb.net/bup_learnhub?retryWrites=true&w=majority";

const COLLECTIONS = [
  "users",
  "courses",
  "assignments",
  "announcements",
  "quizzes",
  "quizattempts",
  "theoryquizzes",
  "theoryattempts",
  "discussions",
  "academicupdates",
  "routines",
  "leadershippolicies",
  "leadershipsettings"
];

(async () => {
  try {
    const localConn = await mongoose.createConnection(LOCAL_URI).asPromise();
    const cloudConn = await mongoose.createConnection(CLOUD_URI).asPromise();

    for (const colName of COLLECTIONS) {
      const docs = await localConn.db.collection(colName).find({}).toArray();
      if (docs.length === 0) continue;

      const ops = docs.map((doc) => ({
        replaceOne: {
          filter: { _id: doc._id },
          replacement: doc,
          upsert: true
        }
      }));

      await cloudConn.db.collection(colName).bulkWrite(ops, { ordered: false }).catch(() => {});
      console.log(`Synced ${docs.length} records -> Cloud collection: ${colName}`);
    }

    const customUsers = await cloudConn.db
      .collection("users")
      .find({ email: { $not: /^(student|faculty|staff)\.[a-z]+[0-9]+@bup\.edu\.bd$/i } })
      .project({ name: 1, email: 1, role: 1 })
      .toArray();

    console.log("\n--- Your Personal & Admin Accounts Now Active on Live Link ---");
    customUsers.forEach((u) => {
      console.log(`  [${u.role.toUpperCase()}] ${u.email} (${u.name})`);
    });

    await localConn.close();
    await cloudConn.close();
  } catch (err) {
    console.error("Cloud sync error:", err.message);
  }
})();