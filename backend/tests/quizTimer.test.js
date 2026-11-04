const test = require("node:test");
const assert = require("node:assert/strict");

const {
  validateQuiz,
  visibleQuestions,
  markQuiz,
  studentReview
} = require("../services/quizRules");

const sampleQuestions = [
  {
    _id: "q1",
    text: "2 + 2?",
    options: ["1", "2", "3", "4"],
    correctIndex: 3,
    points: 5
  },
  {
    _id: "q2",
    text: "5 + 5?",
    options: ["8", "9", "10", "11"],
    correctIndex: 2,
    points: 5
  }
];

test("duration accepts different faculty-selected values", () => {
  const common = {
    title: "Timed quiz",
    closesAt: new Date(Date.now() + 3600000),
    questions: sampleQuestions
  };

  assert.equal(
    validateQuiz({ ...common, durationMinutes: 3 })
      .durationMinutes,
    3
  );

  assert.equal(
    validateQuiz({ ...common, durationMinutes: 47 })
      .durationMinutes,
    47
  );

  assert.throws(() =>
    validateQuiz({ ...common, durationMinutes: 0 })
  );

  assert.throws(() =>
    validateQuiz({ ...common, durationMinutes: 601 })
  );
});

test("active student questions do not expose correct answers", () => {
  const visible = visibleQuestions(sampleQuestions);

  assert.equal(visible[0].correctIndex, undefined);
  assert.equal(visible[1].correctIndex, undefined);
});

test("server calculates manual score", () => {
  const result = markQuiz(
    sampleQuestions,
    [
      { questionId: "q1", selectedIndex: 3 },
      { questionId: "q2", selectedIndex: 0 }
    ],
    false
  );

  assert.equal(result.score, 5);
  assert.equal(result.maxScore, 10);
});

test("timeout auto-mark accepts saved partial answers", () => {
  const result = markQuiz(
    sampleQuestions,
    [{ questionId: "q1", selectedIndex: 3 }],
    true
  );

  assert.equal(result.score, 5);
  assert.equal(result.maxScore, 10);
  assert.equal(result.answers.length, 1);
});

test("published review identifies correct and incorrect answers", () => {
  const review = studentReview(sampleQuestions, [
    { questionId: "q1", selectedIndex: 3 },
    { questionId: "q2", selectedIndex: 0 }
  ]);

  assert.equal(review[0].isCorrect, true);
  assert.equal(review[1].isCorrect, false);
  assert.equal(review[1].correctIndex, 2);
});