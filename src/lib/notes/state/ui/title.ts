// extracted from Notea (MIT License)
import { useState, useCallback } from 'react';

export default function useTitle() {
    const [value, setTitle] = useState('OghmaNotes');

    const updateTitle = useCallback((text?: string) => {
        setTitle(text ? `${text} - OghmaNotes` : 'OghmaNotes');
    }, []);

    return { value, updateTitle };
}
