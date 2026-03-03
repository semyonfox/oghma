// extracted from Notea (MIT License)
// Updated to use notistack instead of sonner for lighter bundle
import { useCallback } from 'react';
import { useSnackbar } from 'notistack';
import useUIComposite from '@/lib/notes/state/ui';

type ToastVariant = 'default' | 'success' | 'error' | 'info' | 'loading';

export const useToast = () => {
    const { enqueueSnackbar } = useSnackbar();
    const {
        ua: { isMobileOnly },
    } = useUIComposite();

    const showToast = useCallback(
        (message: string, variant: ToastVariant = 'default') => {
            const horizontalPosition = isMobileOnly ? 'left' as const : 'center' as const;

            switch (variant) {
                case 'success':
                    enqueueSnackbar(message, { variant: 'success', anchorOrigin: { vertical: 'bottom', horizontal: horizontalPosition } });
                    break;
                case 'error':
                    enqueueSnackbar(message, { variant: 'error', anchorOrigin: { vertical: 'bottom', horizontal: horizontalPosition } });
                    break;
                case 'info':
                    enqueueSnackbar(message, { variant: 'info', anchorOrigin: { vertical: 'bottom', horizontal: horizontalPosition } });
                    break;
                case 'loading':
                    enqueueSnackbar(message, { variant: 'default', anchorOrigin: { vertical: 'bottom', horizontal: horizontalPosition } });
                    break;
                default:
                    enqueueSnackbar(message, { variant: 'default', anchorOrigin: { vertical: 'bottom', horizontal: horizontalPosition } });
            }
        },
        [enqueueSnackbar, isMobileOnly]
    );

    return showToast;
};
