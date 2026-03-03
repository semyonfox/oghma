// extracted from Notea (MIT License)
import { useCallback } from 'react';
import { toast } from 'sonner';
import useUIComposite from '@/lib/notes/state/ui';

type ToastVariant = 'default' | 'success' | 'error' | 'info' | 'loading';

export const useToast = () => {
    const {
        ua: { isMobileOnly },
    } = useUIComposite();

    const showToast = useCallback(
        (message: string, variant: ToastVariant = 'default') => {
            const options = isMobileOnly 
                ? { position: 'bottom-left' as const }
                : { position: 'bottom-center' as const };

            switch (variant) {
                case 'success':
                    toast.success(message, options);
                    break;
                case 'error':
                    toast.error(message, options);
                    break;
                case 'info':
                    toast(message, { ...options, description: '' });
                    break;
                case 'loading':
                    toast.loading(message, options);
                    break;
                default:
                    toast(message, options);
            }
        },
        [isMobileOnly]
    );

    return showToast;
};
