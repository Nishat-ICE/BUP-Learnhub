function validateQuiz(body) {
  const title =
    typeof body?.title === "string" ? body.title.trim() : "";

  const instructions =
    typeof body?.instructions === "string"
      ? body.instructions.trim()
      : "";

  const closesAt = new Date(body?.closesAt);

  if (!title || title.length > 120) {
    throw new Error("Quiz title must be 1â€“120 characters.");
  }

  if (instructions.length > 1000) {
    throw new Error("Instructions are too long.");
  }

  if (
    Number.isNaN(closesAt.getTime()) ||
    closesAt.getTime() <= Date.now()
  ) {
    throw new Error("Choose a future closing date and time.");
  }

  if (
    !Array.isArray(body?.questions) ||
    body.questions.length < 1 ||
    body.questions.length > 20
  ) {
    throw new Error("A quiz needs 1â€“20 MCQ questions.");
  }

  const questions = body.questions.map((item, index) => {
    const text =
      typeof item?.text === "string" ? item.text.trim() : "";
    const options = item?.options;
    const correctIndex = Number(item?.correctIndex);
    const points = Number(item?.points);

    if (!text || text.length > 500) {
      throw new Error(`Question ${index + 1}: invalid text.`);
    }

    if (
      !Array.isArray(options) ||
      options.length !== 4 ||
      options.some(
        (option) =>
          typeof option !== "string" ||
          !option.trim() ||
          option.trim().length > 200
      )
    ) {
      throw new Error(
        `Question ${index + 1}: provide four options.`
      );
    }

    if (
      !Number.isInteger(correctIndex) ||
      correctIndex < 0 ||
      correctIndex > 3
    ) {
      throw new Error(
        `Question ${index + 1}: select the correct option.`
      );
    }

    if (
      !Number.isInteger(points) ||
      points < 1 ||
      points > 20
    ) {
      throw new Error(
        `Question ${index + 1}: marks must be 1â€“20.`
      );
    }

    return {
      text,
      options: options.map((option) => option.trim()),
      correctIndex,
      points
    };
  });

  const totalMarks = questions.reduce(
    (sum, item) => sum + item.points, 0
  );

  if (totalMarks > 100) {
    throw new Error("Total quiz marks cannot exceed 100.");
  }

  return { title, instructions, closesAt, questions };
}

function visibleQuestions(questions) {
  // Explicit allowlist: never return correctIndex to students.
  return questions.map((question) => ({
    _id: String(question._id),
    text: question.text,
    options: [...question.options],
    points: question.points
  }));
}

function markQuiz(questions, answers) {
  if (
    !Array.isArray(answers) ||
    answers.length !== questions.length
  ) {
    throw new Error("Answer every question exactly once.");
  }

  const selections = new Map();

  for (const answer of answers) {
    const id =
      typeof answer?.questionId === "string"
        ? answer.questionId
        : "";

    if (
      !id ||
      selections.has(id) ||
      !Number.isInteger(answer.selectedIndex)
    ) {
      throw new Error("Invalid or duplicate answer.");
    }

    selections.set(id, answer.selectedIndex);
  }

  let score = 0;
  let maxScore = 0;

  const accepted = questions.map((question) => {
    const id = String(question._id);
    const selectedIndex = selections.get(id);

    if (
      selectedIndex === undefined ||
      selectedIndex < 0 ||
      selectedIndex >= question.options.length
    ) {
      throw new Error("Invalid answer selection.");
    }

    maxScore += question.points;

    if (selectedIndex === question.correctIndex) {
      score += question.points;
    }

    return {
      questionId: question._id,
      selectedIndex
    };
  });

  return { answers: accepted, score, maxScore };
}

module.exports = {
  validateQuiz,
  visibleQuestions,
  markQuiz
};