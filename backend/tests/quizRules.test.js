const test = require("node:test");
const assert = require("node:assert/strict");

const {
  validateQuiz,
  visibleQuestions,
  markQuiz
} = require("../services/quizRules");

const questions = [
  {
    _id: "q1",
    text: "2 + 2?",
    options: ["1", "2", "3", "4"],
    correctIndex: 3,
    points: 5
  }
];

test("student cannot receive the correct answer", () => {
  const data = visibleQuestions(questions);
  assert.equal(data[0].correctIndex, undefined);
});

test("marks are calculated on the server", () => {
  const data = markQuiz(
    questions,
    [{ questionId: "q1", selectedIndex: 3, score: 999 }]
  );

  assert.equal(data.score, 5);
  assert.equal(data.maxScore, 5);
});

test("invalid answers are rejected", () => {
  assert.throws(() => markQuiz(questions, []));
  assert.throws(() =>
    markQuiz(
      questions,
      [{ questionId: "wrong", selectedIndex: 1 }]
    )
  );
});

test("past closing date is rejected", () => {
  assert.throws(() =>
    validateQuiz({
      title: "Test quiz",
      closesAt: "2000-01-01",
      questions
    })
  );
});