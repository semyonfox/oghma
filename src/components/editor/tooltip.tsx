// extracted from Notea (MIT License)
import { Tooltip as MuiTooltip } from '@mui/material';
import { FC, ReactNode } from 'react';

const Tooltip: FC<{
    tooltip: string;
    placement: 'top' | 'bottom' | 'left' | 'right';
    children: ReactNode;
}> = ({ children, tooltip, placement }) => {
    return (
        <MuiTooltip title={tooltip} placement={placement}>
            <div>{children}</div>
        </MuiTooltip>
    );
};

export default Tooltip;
