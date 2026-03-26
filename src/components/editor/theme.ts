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
    // required by @lexical/code — maps token types to CSS classes
    codeHighlight: {
        atrule: 'token-atrule',
        attr: 'token-attr',
        boolean: 'token-boolean',
        builtin: 'token-builtin',
        cdata: 'token-cdata',
        char: 'token-char',
        class: 'token-class',
        'class-name': 'token-class-name',
        comment: 'token-comment',
        constant: 'token-constant',
        deleted: 'token-deleted',
        doctype: 'token-doctype',
        entity: 'token-entity',
        function: 'token-function',
        important: 'token-important',
        inserted: 'token-inserted',
        keyword: 'token-keyword',
        namespace: 'token-namespace',
        number: 'token-number',
        operator: 'token-operator',
        prolog: 'token-prolog',
        property: 'token-property',
        punctuation: 'token-punctuation',
        regex: 'token-regex',
        selector: 'token-selector',
        string: 'token-string',
        symbol: 'token-symbol',
        tag: 'token-tag',
        url: 'token-url',
        variable: 'token-variable',
    },
};

export const lightTheme: LexicalTheme = {
    root: 'editor-theme-light',
    codeHighlight: darkTheme.codeHighlight,
};

export const useEditorTheme = () => {
    const { resolvedTheme } = useTheme();

    return resolvedTheme === 'dark' ? darkTheme : lightTheme;
};
