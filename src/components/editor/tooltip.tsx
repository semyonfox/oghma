// extracted from Notea (MIT License)
import { FC, ReactNode, useState } from 'react';

const Tooltip: FC<{
    tooltip: string;
    placement?: 'top' | 'bottom' | 'left' | 'right';
    children: ReactNode;
}> = ({ children, tooltip, placement = 'top' }) => {
    const [isVisible, setIsVisible] = useState(false);

    const placementClasses = {
        top: 'bottom-full left-1/2 -translate-x-1/2 mb-2',
        bottom: 'top-full left-1/2 -translate-x-1/2 mt-2',
        left: 'right-full top-1/2 -translate-y-1/2 mr-2',
        right: 'left-full top-1/2 -translate-y-1/2 ml-2',
    };

    const arrowClasses = {
        top: 'top-full left-1/2 -translate-x-1/2 border-t-surface-elevated border-l-transparent border-r-transparent border-b-transparent',
        bottom: 'bottom-full left-1/2 -translate-x-1/2 border-b-surface-elevated border-l-transparent border-r-transparent border-t-transparent',
        left: 'left-full top-1/2 -translate-y-1/2 border-l-surface-elevated border-t-transparent border-b-transparent border-r-transparent',
        right: 'right-full top-1/2 -translate-y-1/2 border-r-surface-elevated border-t-transparent border-b-transparent border-l-transparent',
    };

    return (
        <div className="relative inline-block group">
            <div
                onMouseEnter={() => setIsVisible(true)}
                onMouseLeave={() => setIsVisible(false)}
            >
                {children}
            </div>
            {isVisible && (
                <div
                    className={`absolute z-50 px-2 py-1 text-sm font-medium text-text bg-surface-elevated rounded whitespace-nowrap pointer-events-none ${placementClasses[placement]}`}
                >
                    {tooltip}
                    <div className={`absolute w-0 h-0 border-4 ${arrowClasses[placement]}`} />
                </div>
            )}
        </div>
    );
};

export default Tooltip;
