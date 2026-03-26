// extracted from Notea (MIT License)
// MIGRATION NOTE: This ProseMirror extension needs to be rewritten for Lexical
// Functionality: Detects typing [[ or 【【 and opens link creation menu
// 
// For Lexical migration, use:
// - @lexical/react LexicalComposer for text input handling
// - TextNode with registerNodeTransform for pattern matching
// - Custom command (createCommand) to trigger link menu
// - See: https://lexical.dev/docs/concepts/transforms

// TODO: Reimplement as Lexical plugin when editor migration is complete

/*
import { InputRule } from 'prosemirror-inputrules';
import Mark from '@notea/rich-markdown-editor/dist/marks/Mark';

export default class Bracket extends Mark {
    get name() {
        return 'bracket';
    }

    get schema() {
        return {
            attrs: {},
        };
    }

    inputRules() {
        return [
            new InputRule(/(?:(\[|【){2})$/, (state, _match, start, end) => {
                const { tr } = state;

                tr.delete(start, end);
                this.editor.handleOpenLinkMenu();

                return tr;
            }),
        ];
    }

    parseMarkdown() {
        return {
            mark: 'bracket',
        };
    }
}
*/

// temporary stub to prevent import errors
export default class Bracket {}
