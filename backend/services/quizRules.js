function validateQuiz(body) {
  const title =
    typeof body?.title === "string" ? body.title.trim() : "";

  const instructions =
    typeof body?.instructions === "string"
      ? body.instructions.trim()
      : "";

  const closesAt = new Date(body?.closesAt);
  const durationMinutes =
    Number(body?.durationMinutes ?? 15);

  if (!title || title.length > 120) {
    throw new Error("Quiz title must contain 1-120 characters.");
  }

  if (instructions.length > 1000) {
    throw new Error("Instructions are too long.");
  }

  if (
    Number.isNaN(closesAt.getTime()) ||
    closesAt.getTime() <= Date.now()
  ) {
    throw new Error("Choose a future quiz closing date and time.");
  }

  if (
    !Number.isInteger(durationMinutes) ||
    durationMinutes < 1 ||
    durationMinutes > 600
  ) {
    throw new Error("Time limit must be between 1 and 600 minutes.");
  }

  if (
    !Array.isArray(body?.questions) ||
    body.questions.length < 1 ||
    body.questions.length > 20
  ) {
    throw new Error("A quiz needs 1-20 MCQ questions.");
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
        `Question ${index + 1}: enter four options.`
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
        `Question ${index + 1}: marks must be 1-20.`
      );
    }

    return {
      text,
      options: options.map((option) => option.trim()),
      correctIndex,
      points
    };
  });

  const total = questions.reduce(
    (sum, question) => sum + question.points,
    0
  );

  if (total > 100) {
    throw new Error("Quiz total cannot exceed 100 marks.");
  }

  return {
    title,
    instructions,
    closesAt,
    durationMinutes,
    questions
  };
}

function visibleQuestions(questions) {
  // Do not expose the answer key while the quiz is active.
  return questions.map((question) => ({
    _id: String(question._id),
    text: question.text,
    options: [...question.options],
    points: question.points
  }));
}

function normalizeAnswers(questions, input, requireAll) {
  if (!Array.isArray(input) || input.length > questions.length) {
    throw new Error("Invalid answer list.");
  }

  if (requireAll && input.length !== questions.length) {
    throw new Error("Answer every question before submitting.");
  }

  const available = new Map(
    questions.map((question) => [
      String(question._id),
      question
    ])
  );

  const selected = new Map();

  for (const item of input) {
    const rawId = item?.questionId;
    const id = rawId == null
      ? ""
      : String(rawId._id || rawId);

    const option = Number(item?.selectedIndex);

    if (
      !id ||
      selected.has(id) ||
      !Number.isInteger(option)
    ) {
      throw new Error("An answer is invalid or duplicated.");
    }

    const question = available.get(id);

    if (
      !question ||
      option < 0 ||
      option >= question.options.length
    ) {
      throw new Error("An answer selection is invalid.");
    }

    selected.set(id, option);
  }

  return questions
    .filter((question) =>
      selected.has(String(question._id))
    )
    .map((question) => ({
      questionId: question._id,
      selectedIndex: selected.get(
        String(question._id)
      )
    }));
}

function markQuiz(questions, inputAnswers, allowPartial) {
  const answers = normalizeAnswers(
    questions,
    inputAnswers,
    !allowPartial
  );

  const selected = new Map(
    answers.map((answer) => [
      String(answer.questionId),
      answer.selectedIndex
    ])
  );

  let score = 0;

  const maxScore = questions.reduce(
    (sum, question) => sum + question.points,
    0
  );

  for (const question of questions) {
    if (
      selected.get(String(question._id)) ===
      question.correctIndex
    ) {
      score += question.points;
    }
  }

  return { answers, score, maxScore };
}

function studentReview(questions, answers) {
  const selected = new Map(
    (answers || []).map((answer) => [
      String(answer.questionId?._id || answer.questionId),
      answer.selectedIndex
    ])
  );

  return questions.map((question) => {
    const selectedIndex =
      selected.get(String(question._id)) ?? null;

    return {
      questionId: String(question._id),
      text: question.text,
      options: [...question.options],
      selectedIndex,
      correctIndex: question.correctIndex,
      isCorrect:
        selectedIndex !== null &&
        selectedIndex === question.correctIndex,
      points: question.points
    };
  });
}

module.exports = {
  validateQuiz,
  visibleQuestions,
  normalizeAnswers,
  markQuiz,
  studentReview
};