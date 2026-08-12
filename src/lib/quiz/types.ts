export type QuestionType = 'mcq' | 'true_false' | 'fill_in';
export type BloomLevel = 1 | 2 | 3 | 4;
export type CardState = 'new' | 'learning' | 'review' | 'relearning';
export type FilterType = 'course' | 'module' | 'note' | 'search' | 'chat_session' | 'all';
export type FSRSRating = 1 | 2 | 3 | 4; // again, hard, good, easy

export interface QuizOption {
    text: string;
    is_correct: boolean;
}

export const BLOOM_NAMES: Record<BloomLevel, string> = {
    1: 'Remember',
    2: 'Understand',
    3: 'Apply',
    4: 'Analyze',
};

export const BLOOM_DESCRIPTIONS: Record<BloomLevel, string> = {
    1: 'Recall facts, definitions, and basic terminology',
    2: 'Explain concepts in your own words, compare and contrast ideas',
    3: 'Use knowledge to solve problems or apply to new situations',
    4: 'Break down information, identify patterns, evaluate evidence',
};

// question types appropriate for each bloom level
export const BLOOM_QUESTION_TYPES: Record<BloomLevel, QuestionType[]> = {
    1: ['mcq', 'true_false'],
    2: ['mcq', 'true_false', 'fill_in'],
    3: ['mcq', 'fill_in'],
    4: ['mcq', 'fill_in'],
};

export interface QuizQuestion {
    id: string;
    user_id: string;
    note_id: string;
    chunk_id: string;
    question_type: QuestionType;
    bloom_level: BloomLevel;
    question_text: string;
    options: QuizOption[] | null;
    correct_answer: string;
    explanation: string;
}

/**
 * The client-facing question shape for an active session. It intentionally
 * excludes database ownership fields and includes the card used for reviews.
 */
export interface QuizSessionQuestion extends Pick<
    QuizQuestion,
    | 'id'
    | 'question_type'
    | 'bloom_level'
    | 'question_text'
    | 'options'
    | 'correct_answer'
    | 'explanation'
> {
    card_id: string;
    intervals?: Record<FSRSRating, number>;
}

export interface QuizSessionProgress {
    answered: number;
    total: number;
    correct: number;
}

export interface QuizStreakResult {
    advanced: boolean;
    current_streak: number;
    newMilestone: number | null;
}

export interface QuizSessionStartResponse {
    sessionId: string;
    totalQuestions: number;
    cardIds: string[];
    currentIndex: number;
    question: QuizSessionQuestion | null;
}

export interface QuizSessionResumeResponse {
    cardIds: string[];
    currentIndex: number;
    correct_count: number;
    question: QuizSessionQuestion | null;
}

export interface QuizCardResponse {
    question: QuizSessionQuestion;
}

export interface QuizAnswerResponse {
    success: boolean;
    nextQuestion: QuizSessionQuestion | null;
    fatigueWarning: boolean;
    isLeech: boolean;
    streakResult: QuizStreakResult | null;
    sessionProgress: QuizSessionProgress;
}

export interface QuizCard {
    id: string;
    user_id: string;
    question_id: string;
    state: CardState;
    stability: number;
    difficulty: number;
    elapsed_days: number;
    scheduled_days: number;
    reps: number;
    lapses: number;
    due: string;
    last_review: string | null;
}

export interface QuizSession {
    id: string;
    user_id: string;
    filter_type: FilterType;
    filter_value: unknown;
    total_questions: number;
    correct_count: number;
    bloom_distribution: Record<string, number>;
    started_at: string;
    completed_at: string | null;
}

export interface UserStreak {
    user_id: string;
    current_streak: number;
    longest_streak: number;
    last_review_date: string | null;
    total_review_days: number;
    streak_milestones: { days: number; reached_at: string }[];
}

// session config defaults
export const SESSION_DEFAULTS = {
    maxQuestions: 20,
    maxNewPerDay: 30,
    leechThreshold: 4,
    fatigueThreshold: 0.4, // 40% wrong triggers fatigue warning
    weightDue: 0.7,
    weightNew: 0.2,
    weightRetention: 0.1,
    // minimum questions answered in a session before the day counts toward streak
    minStreakRound: 10,
};
