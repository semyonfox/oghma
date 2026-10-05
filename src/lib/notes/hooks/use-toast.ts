// Toast notification hook using sonner
import { useCallback } from 'react';
import { toast } from 'sonner';

type ToastVariant = 'default' | 'success' | 'error' | 'info' | 'loading';

export const useToast = () => {
    const showToast = useCallback((message: string, variant: ToastVariant = 'default') => {
        switch (variant) {
            case 'success':
                toast.success(message);
                break;
            case 'error':
                toast.error(message);
                break;
            case 'info':
                toast(message);
                break;
            case 'loading':
                toast.loading(message);
                break;
            default:
                toast(message);
        }
    }, []);

    return showToast;
};
