const test = require("node:test");
const assert = require("node:assert/strict");

const {
  canonicalDepartment,
  canViewRoutine,
  canManageRoutine,
  validateMetadata
} = require("../services/routineRules");

test("full department name matches its short name", () => {
  assert.equal(canonicalDepartment("ICT"), "ict");

  assert.equal(
    canonicalDepartment(
      "Information and Communication Technology (ICT)"
    ),
    "ict"
  );
});

test("Student and Faculty see any section of their department", () => {
  const routineForICT = {
    isPublished: true,
    departmentKey: "ict",
    sectionKey: "A"
  };

  const studentB = {
    _id: "student-1",
    role: "student",
    isActive: true,
    department:
      "Information and Communication Technology (ICT)",
    section: "B"
  };

  const ictFaculty = {
    _id: "faculty-1",
    role: "faculty",
    isActive: true,
    department: "ICT"
  };

  assert.equal(
    canViewRoutine(routineForICT, studentB),
    true
  );

  assert.equal(
    canViewRoutine(routineForICT, ictFaculty),
    true
  );
});

test("another department cannot see this routine", () => {
  assert.equal(
    canViewRoutine(
      {
        isPublished: true,
        departmentKey: "ict"
      },
      {
        _id: "student-cse",
        role: "student",
        isActive: true,
        department: "CSE",
        section: "B"
      }
    ),
    false
  );
});

test("Staff may upload only under their account department", () => {
  const metadata = validateMetadata(
    {
      title: "ICT routine",
      department: "CSE",
      section: "A"
    },
    "ICT"
  );

  assert.equal(metadata.department, "ICT");
  assert.equal(metadata.departmentKey, "ict");
  assert.equal(metadata.section, "All");
  assert.equal(metadata.sectionKey, "ALL");
});

test("only uploader can manage their routine", () => {
  const routine = { uploadedBy: "staff-1" };

  assert.equal(
    canManageRoutine(
      routine,
      { _id: "staff-1", role: "staff" }
    ),
    true
  );

  assert.equal(
    canManageRoutine(
      routine,
      { _id: "staff-2", role: "staff" }
    ),
    false
  );
});

test("Administrator and Authority cannot view routines", () => {
  for (const role of ["admin", "authority"]) {
    assert.equal(
      canViewRoutine(
        {
          isPublished: true,
          departmentKey: "ict"
        },
        {
          _id: "leader",
          role,
          isActive: true,
          department: "ICT"
        }
      ),
      false
    );
  }
});