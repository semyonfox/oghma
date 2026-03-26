'use client';

export default function NotesError({
    error,
    reset,
}: {
    error: Error & { digest?: string };
    reset: () => void;
}) {
    return (
        <div className="flex flex-col items-center justify-center min-h-[50vh] p-8">
            <h2 className="text-lg font-semibold mb-2">Editor error</h2>
            <p className="text-sm text-gray-500 mb-4">{error.message}</p>
            <button
                onClick={reset}
                className="px-4 py-2 text-sm bg-indigo-600 text-white rounded-md hover:bg-indigo-500 transition-colors"
            >
                Reload editor
            </button>
        </div>
    );
}
