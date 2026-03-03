'use client';

// reusable filter modal base - used by search, trash, etc.
// ported from Notea (MIT License) - MUI Dialog replaced with Headless UI
import { Fragment, FC, ReactNode, useEffect } from 'react';
import { Dialog, Transition } from '@headlessui/react';
import useUIComposite from '@/lib/notes/state/ui';

interface FilterModalProps {
    open: boolean;
    onClose: () => void;
    onOpen?: () => void;
    children: ReactNode;
}

const FilterModal: FC<FilterModalProps> = ({ open, onClose, onOpen, children }) => {
    const { ua } = useUIComposite();
    const isMobile = ua?.isMobileOnly;

    useEffect(() => {
        if (open) {
            onOpen?.();
        }
    }, [open, onOpen]);

    return (
        <Transition appear show={open} as={Fragment}>
            <Dialog as="div" className="relative z-50" onClose={onClose}>
                <Transition.Child
                    as={Fragment}
                    enter="ease-out duration-200"
                    enterFrom="opacity-0"
                    enterTo="opacity-100"
                    leave="ease-in duration-150"
                    leaveFrom="opacity-100"
                    leaveTo="opacity-0"
                >
                    <div className="fixed inset-0 bg-black/50 dark:bg-black/70" />
                </Transition.Child>

                <div className="fixed inset-0 overflow-y-auto">
                    <div className={`flex min-h-full ${isMobile ? 'items-stretch' : 'items-start justify-center pt-[10vh]'} p-4`}>
                        <Transition.Child
                            as={Fragment}
                            enter="ease-out duration-200"
                            enterFrom="opacity-0 scale-95"
                            enterTo="opacity-100 scale-100"
                            leave="ease-in duration-150"
                            leaveFrom="opacity-100 scale-100"
                            leaveTo="opacity-0 scale-95"
                        >
                            <Dialog.Panel
                                className={`w-full ${isMobile ? '' : 'max-w-xl'} transform overflow-hidden bg-gray-800 dark:bg-neutral-800 text-white shadow-xl transition-all ${isMobile ? '' : 'rounded-lg'}`}
                            >
                                <div className="outline-none overflow-auto">
                                    {children}
                                </div>
                            </Dialog.Panel>
                        </Transition.Child>
                    </div>
                </div>
            </Dialog>
        </Transition>
    );
};

export default FilterModal;
