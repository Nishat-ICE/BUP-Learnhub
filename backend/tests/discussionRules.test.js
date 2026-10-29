const test = require("node:test");
const assert = require("node:assert/strict");

const {
  canReadCourse,
  canEditMessage,
  canRemoveMessage,
  validateThread,
  validateReply
} = require("../services/discussionRules");

const course = {
  faculty: "faculty-1",
  students: ["student-1"]
};

test("only enrolled student and course faculty can read", () => {
  assert.equal(
    canReadCourse(
      course,
      { _id: "student-1", role: "student" }
    ),
    true
  );

  assert.equal(
    canReadCourse(
      course,
      { _id: "student-2", role: "student" }
    ),
    false
  );

  assert.equal(
    canReadCourse(
      course,
      { _id: "faculty-1", role: "faculty" }
    ),
    true
  );

  for (const role of ["staff", "admin", "authority"]) {
    assert.equal(
      canReadCourse(
        course,
        { _id: "faculty-1", role }
      ),
      false
    );
  }
});

test("author edits own text, not others' text", () => {
  const message = {
    author: "student-1",
    removedAt: null
  };

  assert.equal(
    canEditMessage(
      message,
      { _id: "student-1", role: "student" }
    ),
    true
  );

  assert.equal(
    canEditMessage(
      message,
      { _id: "faculty-1", role: "faculty" }
    ),
    false
  );
});

test("faculty can moderate; unrelated student cannot", () => {
  const message = {
    author: "student-1",
    removedAt: null
  };

  assert.equal(
    canRemoveMessage(
      message,
      course,
      { _id: "faculty-1", role: "faculty" }
    ),
    true
  );

  assert.equal(
    canRemoveMessage(
      message,
      course,
      { _id: "student-2", role: "student" }
    ),
    false
  );
});

test("blank and oversized posts are rejected", () => {
  assert.throws(() =>
    validateThread({ title: " ", body: "hello" })
  );

  assert.throws(() =>
    validateThread({
      title: "Question",
      body: "x".repeat(2001)
    })
  );

  assert.throws(() =>
    validateReply({ body: "" })
  );
});