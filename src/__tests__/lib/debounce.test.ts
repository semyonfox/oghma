import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { debounce, createDebouncedFunction } from '@/lib/notes/utils/debounce';

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe('debounce', () => {
    it('does not call immediately', () => {
        const fn = vi.fn();
        const debounced = debounce(fn, 100);
        debounced();
        expect(fn).not.toHaveBeenCalled();
    });

    it('calls after the wait period', () => {
        const fn = vi.fn();
        const debounced = debounce(fn, 100);
        debounced('arg1');
        vi.advanceTimersByTime(100);
        expect(fn).toHaveBeenCalledOnce();
        expect(fn).toHaveBeenCalledWith('arg1');
    });

    it('resets timer on subsequent calls', () => {
        const fn = vi.fn();
        const debounced = debounce(fn, 100);
        debounced();
        vi.advanceTimersByTime(80);
        debounced(); // reset
        vi.advanceTimersByTime(80);
        expect(fn).not.toHaveBeenCalled();
        vi.advanceTimersByTime(20);
        expect(fn).toHaveBeenCalledOnce();
    });

    it('uses the latest arguments', () => {
        const fn = vi.fn();
        const debounced = debounce(fn, 100);
        debounced('first');
        debounced('second');
        debounced('third');
        vi.advanceTimersByTime(100);
        expect(fn).toHaveBeenCalledOnce();
        expect(fn).toHaveBeenCalledWith('third');
    });
});

describe('createDebouncedFunction', () => {
    it('debounces like the basic version', () => {
        const fn = vi.fn();
        const debounced = createDebouncedFunction(fn, 100);
        debounced('a');
        debounced('b');
        vi.advanceTimersByTime(100);
        expect(fn).toHaveBeenCalledOnce();
        expect(fn).toHaveBeenCalledWith('b');
    });

    it('flush() executes immediately', () => {
        const fn = vi.fn();
        const debounced = createDebouncedFunction(fn, 100);
        debounced('urgent');
        debounced.flush();
        expect(fn).toHaveBeenCalledOnce();
        expect(fn).toHaveBeenCalledWith('urgent');
    });

    it('flush() is a no-op if nothing is pending', () => {
        const fn = vi.fn();
        const debounced = createDebouncedFunction(fn, 100);
        debounced.flush();
        expect(fn).not.toHaveBeenCalled();
    });

    it('cancel() prevents execution', () => {
        const fn = vi.fn();
        const debounced = createDebouncedFunction(fn, 100);
        debounced('data');
        debounced.cancel();
        vi.advanceTimersByTime(200);
        expect(fn).not.toHaveBeenCalled();
    });
});
