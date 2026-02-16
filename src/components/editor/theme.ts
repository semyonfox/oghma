// extracted from Notea (MIT License)
import { useTheme } from 'next-themes';

// Lexical theme configuration
// Note: Lexical themes use CSS class names, not CSS property values
export interface LexicalTheme {
    root?: string;
    paragraph?: string;
    [key: string]: any;
}

export const darkTheme: LexicalTheme = {
    root: 'editor-theme-dark',
};

export const lightTheme: LexicalTheme = {
    root: 'editor-theme-light',
};

export const useEditorTheme = () => {
    const { resolvedTheme } = useTheme();

    return resolvedTheme === 'dark' ? darkTheme : lightTheme;
};
