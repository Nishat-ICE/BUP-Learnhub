const test = require("node:test");
const assert = require("node:assert/strict");

const {
  hasAnswer,
  validateTheoryQuiz,
  fileMime,
  safeStoredName
} = require("../services/theoryRules");

test("typed Theory answer counts as an answer", () => {
  assert.equal(
    hasAnswer({ text: "My answer" }),
    true
  );
});

test("uploaded Theory answer file counts as an answer", () => {
  assert.equal(
    hasAnswer({
      text: "",
      attachment: {
        storedName: "private-answer.pdf"
      }
    }),
    true
  );
});

test("empty Theory answer is not submitted as answered", () => {
  assert.equal(
    hasAnswer({
      text: "   ",
      attachment: null
    }),
    false
  );
});

test("Theory quiz supports optional text prompts and a chosen duration", () => {
  const validated = validateTheoryQuiz({
    title: "Written assessment",
    closesAt: new Date(Date.now() + 3600000),
    durationMinutes: 37,
    questions: [
      { promptText: "Answer this.", points: 10 },
      { promptText: "", points: 15 }
    ]
  });

  assert.equal(validated.durationMinutes, 37);
  assert.equal(validated.questions.length, 2);
});

test("prompt may be empty for an uploaded prompt file", () => {
  const validated = validateTheoryQuiz({
    title: "File-based prompt",
    closesAt: new Date(Date.now() + 3600000),
    durationMinutes: 5,
    questions: [{ promptText: "", points: 5 }]
  });

  assert.equal(validated.questions[0].promptText, "");
});

test("invalid duration is rejected", () => {
  assert.throws(() =>
    validateTheoryQuiz({
      title: "Assessment",
      closesAt: new Date(Date.now() + 3600000),
      durationMinutes: 601,
      questions: [{ promptText: "Q", points: 5 }]
    })
  );
});

test("only approved extensions and generated names are accepted", () => {
  assert.equal(fileMime("prompt.pdf"), "application/pdf");
  assert.equal(fileMime("answer.exe"), null);

  assert.equal(
    safeStoredName(
      "12345678-1234-1234-1234-123456789abc.pdf"
    ),
    true
  );

  assert.equal(
    safeStoredName("../private.env"),
    false
  );
});