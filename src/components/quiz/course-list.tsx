'use client';

interface Course {
    courseId: number;
    courseName: string;
    totalCards: number;
    dueCount: number;
    mastery: number;
}

interface CourseListProps {
    courses: Course[];
    onSelectCourse: (courseId: number) => void;
    searchQuery: string;
    onSearchChange: (query: string) => void;
}

export default function CourseList({ courses, onSelectCourse, searchQuery, onSearchChange }: CourseListProps) {
    const filtered = courses.filter(c =>
        c.courseName.toLowerCase().includes(searchQuery.toLowerCase()),
    );

    const getMasteryColor = (mastery: number) => {
        if (mastery > 75) return 'text-success-400';
        if (mastery > 50) return 'text-ai-400';
        return 'text-error-400';
    };

    const getBarColor = (mastery: number) => {
        if (mastery > 75) return 'bg-success-500';
        if (mastery > 50) return 'bg-ai-500';
        return 'bg-error-500';
    };

    return (
        <div>
            <div className="flex justify-between items-center mb-3">
                <h2 className="text-text font-semibold text-sm">Courses</h2>
                <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => onSearchChange(e.target.value)}
                    placeholder="Search topics..."
                    className="bg-surface border border-border-subtle rounded-lg px-3 py-1.5 text-xs text-text-secondary placeholder:text-text-tertiary focus:outline-none focus:border-primary-500 w-48"
                />
            </div>
            <div className="flex flex-col gap-2">
                {filtered.map((course) => (
                    <button
                        key={course.courseId}
                        onClick={() => onSelectCourse(course.courseId)}
                        className="bg-surface rounded-lg p-3 flex items-center gap-3 hover:bg-surface-elevated transition-colors text-left w-full"
                    >
                        <div className="flex-1 min-w-0">
                            <div className="text-text text-sm font-medium truncate">{course.courseName}</div>
                            <div className="flex gap-3 mt-1 text-[10px]">
                                <span className={course.dueCount > 0 ? 'text-error-400' : 'text-text-tertiary'}>
                                    {course.dueCount} due
                                </span>
                                <span className="text-text-tertiary">{course.totalCards} total</span>
                            </div>
                        </div>
                        <div className="text-right flex-shrink-0">
                            <div className={`text-sm font-bold ${getMasteryColor(course.mastery)}`}>
                                {course.mastery}%
                            </div>
                            <div className="w-12 h-1 bg-surface-elevated rounded-full mt-1">
                                <div
                                    className={`h-full rounded-full ${getBarColor(course.mastery)}`}
                                    style={{ width: `${course.mastery}%` }}
                                />
                            </div>
                        </div>
                    </button>
                ))}
                {filtered.length === 0 && (
                    <div className="text-text-tertiary text-sm text-center py-8">
                        {courses.length === 0 ? 'No quiz content yet. Import notes from Canvas first.' : 'No matching courses.'}
                    </div>
                )}
            </div>
        </div>
    );
}
