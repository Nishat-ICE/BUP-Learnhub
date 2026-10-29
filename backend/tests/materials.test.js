const test = require("node:test");
const assert = require("node:assert/strict");

const {
  canRead,
  canWrite,
  matchesSignature,
  safeStoredName
} = require("../services/materialSecurity");

const course = {
  faculty: "faculty-1",
  students: ["student-1"]
};

test("enrolled student can read but cannot write", () => {
  const user = { _id: "student-1", role: "student" };

  assert.equal(canRead(course, user), true);
  assert.equal(canWrite(course, user), false);
});

test("other student cannot read", () => {
  assert.equal(
    canRead(course, { _id: "student-2", role: "student" }),
    false
  );
});

test("owning faculty can read/write; other faculty cannot", () => {
  assert.equal(
    canWrite(course, { _id: "faculty-1", role: "faculty" }),
    true
  );

  assert.equal(
    canRead(course, { _id: "faculty-2", role: "faculty" }),
    false
  );
});

test("staff/admin/authority cannot use learning materials", () => {
  for (const role of ["staff", "admin", "authority"]) {
    assert.equal(canRead(course, { _id: "staff-1", role }), false);
    assert.equal(canWrite(course, { _id: "staff-1", role }), false);
  }
});

test("file extension alone is not enough", () => {
  assert.equal(
    matchesSignature("fake.pdf", Buffer.from("not a PDF")),
    false
  );

  assert.equal(
    matchesSignature(
      "real.pdf",
      Buffer.from("%PDF-1.7 sample bytes")
    ),
    true
  );
});

test("server-generated filename validation", () => {
  assert.equal(
    safeStoredName(
      "12345678-1234-1234-1234-123456789abc.pdf"
    ),
    true
  );

  assert.equal(safeStoredName("../secret.env"), false);
});