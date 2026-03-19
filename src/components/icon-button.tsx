// simple icon button component for notes
import { ButtonHTMLAttributes, FC } from 'react';
import {
  ChevronRightIcon,
  DocumentTextIcon,
  DocumentIcon,
  EllipsisHorizontalIcon as DotsHorizontalIcon,
  PlusIcon,
  ChevronDoubleUpIcon,
  ChevronUpDownIcon as SelectorIcon,
} from '@heroicons/react/24/outline';

interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  icon?: 'ChevronRight' | 'DocumentText' | 'Document' | 'DotsHorizontal' | 'Plus' | 'ChevronDoubleUp' | 'Selector';
  iconClassName?: string;
  children?: React.ReactNode;
}

const iconMap = {
  ChevronRight: ChevronRightIcon,
  DocumentText: DocumentTextIcon,
  Document: DocumentIcon,
  DotsHorizontal: DotsHorizontalIcon,
  Plus: PlusIcon,
  ChevronDoubleUp: ChevronDoubleUpIcon,
  Selector: SelectorIcon,
};

const IconButton: FC<IconButtonProps> = ({ icon, iconClassName = '', children, className = '', ...props }) => {
  const Icon = icon ? iconMap[icon] : null;
  
  return (
    <button
      className={`p-2 rounded hover:bg-surface-elevated transition-colors w-7 h-7 md:w-6 md:h-6 flex items-center justify-center focus:outline-none focus:ring-2 focus:ring-primary-500 ${className}`}
      {...props}
    >
      {Icon ? <Icon className={`w-5 h-5 ${iconClassName}`} aria-hidden="true" /> : children}
    </button>
  );
};

export default IconButton;
