import type { JobFormQuestion, ApplicationAnswer, QuestionType, RequirementMatch } from "@/types/recruitment";

/**
 * Calcula a pontuação dos requisitos marcados pelo candidato.
 * Cada requisito marcado vale weight * 10 pontos.
 */
export function scoreRequirements(requirements: RequirementMatch[]): {
  score: number;
  maxScore: number;
} {
  const maxScore = requirements.reduce((s, r) => s + r.weight * 10, 0);
  const score = requirements
    .filter((r) => r.checked)
    .reduce((s, r) => s + r.weight * 10, 0);
  return { score, maxScore };
}

/**
 * Calcula a pontuação de uma resposta para uma pergunta específica.
 * Retorna um valor entre 0 e weight * 10.
 */
export function scoreQuestion(
  question: Pick<JobFormQuestion, 'question_type' | 'weight' | 'correct_answer'>,
  answer: string | string[]
): number {
  const maxScore = question.weight * 10;

  switch (question.question_type as QuestionType) {
    case 'scale_1_5': {
      const val = Number(answer);
      if (!Number.isFinite(val) || val < 1 || val > 5) return 0;
      return (val / 5) * maxScore;
    }

    case 'yes_no':
    case 'single_choice': {
      const correct = question.correct_answer as string | null;
      if (!correct) return 0;
      return String(answer).trim().toLowerCase() === correct.trim().toLowerCase()
        ? maxScore
        : 0;
    }

    case 'multiple_choice': {
      const correct = (question.correct_answer as string[] | null) ?? [];
      if (correct.length === 0) return 0;
      const selected = Array.isArray(answer) ? answer : [answer];
      const hits = selected.filter((a) =>
        correct.some((c) => c.trim().toLowerCase() === a.trim().toLowerCase())
      ).length;
      return (hits / correct.length) * maxScore;
    }

    case 'text':
      // Avaliação manual — score inicial 0
      return 0;

    default:
      return 0;
  }
}

/**
 * Pontuação máxima possível para uma vaga.
 * Perguntas do tipo 'text' contribuem com seu peso máximo (avaliação manual).
 */
export function calculateMaxScore(questions: Pick<JobFormQuestion, 'weight'>[]): number {
  return questions.reduce((sum, q) => sum + q.weight * 10, 0);
}

/**
 * Calcula o score total automático de uma candidatura.
 */
export function calculateTotalScore(
  questions: Pick<JobFormQuestion, 'id' | 'question_type' | 'weight' | 'correct_answer'>[],
  answers: Record<string, string | string[]>
): ApplicationAnswer[] {
  return questions.map((q) => {
    const answer = answers[q.id] ?? '';
    const score = scoreQuestion(q, answer);
    return {
      question_id: q.id,
      question_text: '',  // preenchido pelo caller com o texto completo
      question_type: q.question_type,
      answer,
      score,
      max_score: q.weight * 10,
    };
  });
}

/**
 * Calcula o percentual de acerto (0–100).
 */
export function calculateScorePercent(score: number, maxScore: number): number {
  if (maxScore <= 0) return 0;
  return Math.min(100, Math.max(0, (score / maxScore) * 100));
}

/**
 * Retorna a cor do badge de score baseada no percentual.
 */
export function scoreColor(percent: number): 'green' | 'yellow' | 'red' {
  if (percent >= 70) return 'green';
  if (percent >= 40) return 'yellow';
  return 'red';
}
