'use client';

// highlights matching keyword text in search results
import { FC, useMemo } from 'react';

interface MarkTextProps {
    text?: string;
    keyword?: string;
}

const MarkText: FC<MarkTextProps> = ({ text = '', keyword }) => {
    const parts = useMemo(() => {
        if (!keyword || !text) return [{ text, highlight: false }];

        const regex = new RegExp(`(${keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
        const segments = text.split(regex);

        return segments.map((segment) => ({
            text: segment,
            highlight: regex.test(segment),
        }));
    }, [text, keyword]);

    return (
        <>
            {parts.map((part, i) =>
                part.highlight ? (
                    <mark key={i} className="bg-ai-200 dark:bg-ai-700 rounded-sm px-0.5">
                        {part.text}
                    </mark>
                ) : (
                    <span key={i}>{part.text}</span>
                )
            )}
        </>
    );
};

export default MarkText;
