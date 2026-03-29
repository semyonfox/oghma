declare module 'markdown-link-extractor' {
    function markdownLinkExtractor(markdown: string, extended?: boolean): string[];
    export default markdownLinkExtractor;
}
