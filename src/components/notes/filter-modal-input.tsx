'use client';

// reusable filter input for modals (search, trash, etc.)
// ported from Notea (MIT License)
import { FC, useEffect, useRef } from 'react';
import { MagnifyingGlassIcon } from '@heroicons/react/24/outline';
import { useDebouncedCallback } from 'use-debounce';
import useI18n from '@/lib/notes/hooks/use-i18n';

interface FilterModalInputProps {
    doFilter: (keyword: string) => void;
    keyword?: string;
    placeholder: string;
    onClose: () => void;
}

const FilterModalInput: FC<FilterModalInputProps> = ({ doFilter, keyword, placeholder, onClose }) => {
    const { t } = useI18n();
    const inputRef = useRef<HTMLInputElement>(null);

    const debouncedFilter = useDebouncedCallback((value: string) => {
        doFilter(value);
    }, 200);

    useEffect(() => {
        inputRef.current?.select();
    }, []);

    return (
        <div className="flex items-center py-2 px-4 border-b border-border dark:border-neutral-700">
            <MagnifyingGlassIcon className="w-5 h-5 text-text-tertiary" />
            <input
                ref={inputRef}
                defaultValue={keyword}
                type="text"
                className="appearance-none flex-1 outline-none ml-2 bg-transparent text-text placeholder-text-tertiary"
                placeholder={placeholder}
                autoFocus
                onChange={(e) => debouncedFilter(e.target.value)}
            />
            <button
                onClick={onClose}
                className="text-sm text-text-secondary hover:text-text transition-colors"
            >
                {t('Cancel')}
            </button>
        </div>
    );
};

export default FilterModalInput;
