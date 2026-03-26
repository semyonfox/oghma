'use client'

// extracted from Notea (MIT License)
import { useContext } from 'react';
import { I18nContext } from '@/lib/i18n/provider';

export default function useI18n() {
    const i18n = useContext(I18nContext);
    return i18n;
}
