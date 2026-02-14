// extracted from Notea (MIT License)
import { useState, useCallback } from 'react';

export default function useTitle() {
    const [value, setTitle] = useState('SocsBoard');

    const updateTitle = useCallback((text?: string) => {
        setTitle(text ? `${text} - SocsBoard` : 'SocsBoard');
    }, []);

    return { value, updateTitle };
}
