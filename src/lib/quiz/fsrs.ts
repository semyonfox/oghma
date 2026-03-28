import {
    createEmptyCard,
    fsrs,
    Rating,
    type Card,
    type RecordLogItem,
} from 'ts-fsrs';

const f = fsrs();

export type FSRSCard = Card;

export function createNewCard(): FSRSCard {
    return createEmptyCard();
}

export function reviewCard(card: FSRSCard, rating: 1 | 2 | 3 | 4): { card: FSRSCard; log: RecordLogItem } {
    const now = new Date();
    const scheduling = f.repeat(card, now);
    const r = rating as Rating.Again | Rating.Hard | Rating.Good | Rating.Easy;
    return {
        card: scheduling[r].card,
        log: scheduling[r],
    };
}

// returns the scheduled_days for each possible rating
export function getNextIntervals(card: FSRSCard): Record<1 | 2 | 3 | 4, number> {
    const now = new Date();
    const scheduling = f.repeat(card, now);
    return {
        1: scheduling[Rating.Again].card.scheduled_days,
        2: scheduling[Rating.Hard].card.scheduled_days,
        3: scheduling[Rating.Good].card.scheduled_days,
        4: scheduling[Rating.Easy].card.scheduled_days,
    };
}

// convert DB row to ts-fsrs Card object
export function cardFromDB(row: {
    state: string;
    stability: number;
    difficulty: number;
    elapsed_days: number;
    scheduled_days: number;
    reps: number;
    lapses: number;
    due: string;
    last_review: string | null;
}): FSRSCard {
    const stateMap: Record<string, number> = {
        new: 0,
        learning: 1,
        review: 2,
        relearning: 3,
    };
    return {
        state: stateMap[row.state] ?? 0,
        stability: row.stability,
        difficulty: row.difficulty,
        elapsed_days: row.elapsed_days,
        scheduled_days: row.scheduled_days,
        reps: row.reps,
        lapses: row.lapses,
        due: new Date(row.due),
        last_review: row.last_review ? new Date(row.last_review) : undefined,
    } as FSRSCard;
}

// convert ts-fsrs Card back to DB-friendly values
export function cardToDB(card: FSRSCard): {
    state: string;
    stability: number;
    difficulty: number;
    elapsed_days: number;
    scheduled_days: number;
    reps: number;
    lapses: number;
    due: string;
    last_review: string | null;
} {
    const stateNames = ['new', 'learning', 'review', 'relearning'];
    return {
        state: stateNames[card.state] ?? 'new',
        stability: card.stability,
        difficulty: card.difficulty,
        elapsed_days: card.elapsed_days,
        scheduled_days: card.scheduled_days,
        reps: card.reps,
        lapses: card.lapses,
        due: card.due.toISOString(),
        last_review: card.last_review ? card.last_review.toISOString() : null,
    };
}
