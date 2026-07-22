export interface PreparedTestOption {
  id: string;
  text: string;
}

export interface PreparedTestQuestion {
  id: string;
  prompt: string;
  options: PreparedTestOption[];
}

export interface PreparedTestProgressItem {
  id: string;
  title: string;
  description: string;
  order: number;
  questionCount: number;
  passingScore: number;
  locked: boolean;
  available: boolean;
  passed: boolean;
  score: number | null;
  attempts: number;
  lastAttemptAt: string | null;
}

export interface PreparedTestsResponse {
  tests: PreparedTestProgressItem[];
  total: number;
  completedCount: number;
}

export interface PreparedTestDetail {
  id: string;
  title: string;
  description: string;
  order: number;
  totalTests: number;
  questionCount: number;
  passingScore: number;
  questions: PreparedTestQuestion[];
  passed: boolean;
  latestAttempt: {
    score: number;
    correctAnswers: number;
    totalQuestions: number;
    passed: boolean;
    attemptNumber: number;
    createdAt: string;
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
  nextTest: { id: string; title: string } | null;
  createdAt: string;
}
