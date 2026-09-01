export interface PreparedTestOption {
  id: string;
  text: string;
}

export interface PreparedTestQuestion {
  id: string;
  prompt: string;
  options: PreparedTestOption[];
  correctOptionId?: string;
}

export interface PreparedTestReviewItem {
  questionId: string;
  prompt: string;
  isCorrect: boolean;
  selectedOptionText: string | null;
  correctOptionText: string | null;
}

export interface PreparedTestProgressItem {
  id: string;
  title: string;
  description: string;
  order: number;
  section: string;
  questionCount: number;
  passingScore: number;
  maxAttempts: number | null;
  locked: boolean;
  available: boolean;
  exhausted: boolean;
  passed: boolean;
  bestScore: number | null;
  latestScore: number | null;
  attemptsUsed: number;
  attemptsRemaining: number | null;
  lastAttemptAt: string | null;
}

export interface PreparedTestsResponse {
  tests: PreparedTestProgressItem[];
  total: number;
  completedCount: number;
  xpRules: PreparedTestXpRules;
}

export interface PreparedTestXpRules {
  firstAttempt: number;
  retry: number;
  weeklyLimit: number;
}

export interface PreparedTestDetail {
  id: string;
  title: string;
  description: string;
  order: number;
  totalTests: number;
  questionCount: number;
  passingScore: number;
  maxAttempts: number | null;
  xpRules: PreparedTestXpRules;
  earnedXp: number;
  questions: PreparedTestQuestion[];
  passed: boolean;
  exhausted: boolean;
  bestScore: number | null;
  attemptsUsed: number;
  attemptsRemaining: number | null;
  nextTest: { id: string; title: string } | null;
  draft: {
    answers: Record<string, string>;
    currentQuestion: number;
    startedAt: string;
    updatedAt: string;
  } | null;
  latestAttempt: {
    score: number;
    correctAnswers: number;
    totalQuestions: number;
    passed: boolean;
    attemptNumber: number;
    createdAt: string;
    review: PreparedTestReviewItem[];
  } | null;
}

export interface PreparedTestAttemptResponse {
  id: string;
  testId: string;
  attemptNumber: number;
  score: number;
  correctAnswers: number;
  totalQuestions: number;
  passed: boolean;
  passingScore: number;
  attemptsRemaining: number | null;
  xpAwarded: number;
  xpStatus: "awarded" | "already_awarded" | "weekly_limit" | "not_eligible" | "not_passed";
  review: PreparedTestReviewItem[];
  topicsToRepeat: string[];
  nextTest: { id: string; title: string } | null;
  createdAt: string;
}

export interface PreparedTestsAnalytics {
  summary: {
    totalTests: number;
    uniqueStudents: number;
    startedStudentTests: number;
    completedStudentTests: number;
    attemptCount: number;
    averageScore: number | null;
  };
  tests: Array<{
    id: string;
    order: number;
    title: string;
    description: string;
    questionCount: number;
    startedStudents: number;
    passedStudents: number;
    attemptCount: number;
    averageScore: number | null;
    passRate: number;
    questionStats: Array<{
      questionId: string;
      prompt: string;
      answeredCount: number;
      incorrectCount: number;
      incorrectRate: number;
    }>;
  }>;
}

export interface PreparedTestAdminPreview {
  id: string;
  title: string;
  description: string;
  order: number;
  totalTests: number;
  passingScore: number;
  maxAttempts: number | null;
  xpRules: PreparedTestXpRules;
  questions: Required<PreparedTestQuestion>[];
}
