'use client';

interface FeedbackProps {
    wasCorrect: boolean;
    explanation: string;
    correctAnswer: string;
}

export default function Feedback({ wasCorrect, explanation, correctAnswer }: FeedbackProps) {
    return (
        <div className={`rounded-lg p-4 border ${wasCorrect ? 'bg-success-500/5 border-success-500/20' : 'bg-error-500/5 border-error-500/20'}`}>
            <div className={`text-sm font-semibold mb-2 ${wasCorrect ? 'text-success-400' : 'text-error-400'}`}>
                {wasCorrect ? '✓ Correct' : '✗ Incorrect'}
            </div>
            {!wasCorrect && (
                <div className="text-xs text-text-secondary mb-2">
                    Correct answer: <span className="text-text font-medium">{correctAnswer}</span>
                </div>
            )}
            <div className="text-xs text-text-tertiary leading-relaxed">{explanation}</div>
        </div>
    );
}
