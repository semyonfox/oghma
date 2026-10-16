import {
    createEmptyCard,
    fsrs,
    Rating,
    State,
    type Card,
    type Grade,
    type RecordLogItem,
} from 'ts-fsrs';
import type { CardState } from './types';

const f = fsrs();

export type FSRSCard = Card;
export type FSRSRating = Grade;

// columns of app.quiz_cards that hold scheduler state
export interface FSRSCardRow {
    state: string;
    stability: number;
    difficulty: number;
    elapsed_days: number;
    scheduled_days: number;
    learning_steps: number;
    reps: number;
    lapses: number;
    due: string | Date;
    last_review: string | Date | null;
}

export interface FSRSCardValues extends Omit<FSRSCardRow, 'state' | 'due' | 'last_review'> {
    state: CardState;
    due: string;
    last_review: string | null;
}

const STATE_BY_NAME: Record<CardState, State> = {
    new: State.New,
    learning: State.Learning,
    review: State.Review,
    relearning: State.Relearning,
};

const NAME_BY_STATE: Record<State, CardState> = {
    [State.New]: 'new',
    [State.Learning]: 'learning',
    [State.Review]: 'review',
    [State.Relearning]: 'relearning',
};

const FAST_ANSWER_MS = 5_000;
const SLOW_ANSWER_MS = 20_000;

function isCardState(value: string): value is CardState {
    return value in STATE_BY_NAME;
}

export function createNewCard(now = new Date()): FSRSCard {
    return createEmptyCard(now);
}

export function reviewCard(
    card: FSRSCard,
    rating: FSRSRating,
    now = new Date(),
): { card: FSRSCard; log: RecordLogItem } {
    const log = f.next(card, now, rating);
    return { card: log.card, log };
}

/**
 * Quiz answers are graded automatically, so the FSRS rating comes from
 * correctness plus how long the answer took. A missing or zero time is treated
 * as an ordinary "good".
 */
export function ratingForAnswer(
    wasCorrect: boolean,
    responseTimeMs: number | null,
): FSRSRating {
    if (!wasCorrect) return Rating.Again;
    if (responseTimeMs === null || responseTimeMs <= 0) return Rating.Good;
    if (responseTimeMs > SLOW_ANSWER_MS) return Rating.Hard;
    if (responseTimeMs < FAST_ANSWER_MS) return Rating.Easy;
    return Rating.Good;
}

export function cardFromDB(row: FSRSCardRow): FSRSCard {
    return {
        state: isCardState(row.state) ? STATE_BY_NAME[row.state] : State.New,
        stability: row.stability,
        difficulty: row.difficulty,
        elapsed_days: row.elapsed_days,
        scheduled_days: row.scheduled_days,
        learning_steps: row.learning_steps,
        reps: row.reps,
        lapses: row.lapses,
        due: new Date(row.due),
        last_review: row.last_review ? new Date(row.last_review) : undefined,
    };
}

export function cardToDB(card: FSRSCard): FSRSCardValues {
    return {
        state: NAME_BY_STATE[card.state],
        stability: card.stability,
        difficulty: card.difficulty,
        elapsed_days: card.elapsed_days,
        scheduled_days: card.scheduled_days,
        learning_steps: card.learning_steps,
        reps: card.reps,
        lapses: card.lapses,
        due: card.due.toISOString(),
        last_review: card.last_review ? card.last_review.toISOString() : null,
    };
}
