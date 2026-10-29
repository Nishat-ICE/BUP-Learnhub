const test = require("node:test");
const assert = require("node:assert/strict");

const {
  belongsToCourse,
  matchesSection,
  hasPublishedGrade
} = require("../services/notificationRules");

const course = {
  faculty: "faculty-1",
  students: ["student-1"]
};

test("only enrolled student or owning faculty belongs to course", () => {
  assert.equal(
    belongsToCourse(
      course,
      { _id: "student-1", role: "student" }
    ),
    true
  );

  assert.equal(
    belongsToCourse(
      course,
      { _id: "student-2", role: "student" }
    ),
    false
  );

  assert.equal(
    belongsToCourse(
      course,
      { _id: "faculty-1", role: "faculty" }
    ),
    true
  );

  assert.equal(
    belongsToCourse(
      course,
      { _id: "faculty-1", role: "staff" }
    ),
    false
  );
});

test("reschedule respects the student's section", () => {
  assert.equal(matchesSection("B", "B"), true);
  assert.equal(matchesSection("B", "All"), true);
  assert.equal(matchesSection("B", "A"), false);
});

test("only numeric published marks count", () => {
  assert.equal(hasPublishedGrade({ grade: 0 }), true);
  assert.equal(hasPublishedGrade({ grade: 78 }), true);
  assert.equal(hasPublishedGrade({ grade: null }), false);
  assert.equal(hasPublishedGrade({ grade: 125 }), false);
});