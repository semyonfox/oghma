'use client';

import { useMemo } from 'react';
import useI18n from '@/lib/notes/hooks/use-i18n';

export default function useSyntaxGuideContent() {
  const { t } = useI18n();

  return useMemo(() => {
    const content = `# ${t('Markdown Syntax Guide')}

${t('Everything you can write in OghmaNotes. Switch to **Source** mode to see the raw markdown, and **Read** mode to see it rendered.')}

---

## ${t('Headings')}

\`\`\`markdown
# ${t('Heading 1')}
## ${t('Heading 2')}
### ${t('Heading 3')}
#### ${t('Heading 4')}
##### ${t('Heading 5')}
###### ${t('Heading 6')}
\`\`\`

---

## ${t('Text Formatting')}

| ${t('Syntax')} | ${t('Result')} |
|--------|--------|
| \`**${t('bold')}**\` | **${t('bold')}** |
| \`*${t('italic')}*\` | *${t('italic')}* |
| \`~~${t('strikethrough')}~~\` | ~~${t('strikethrough')}~~ |
| \`**_${t('bold italic')}_**\` | **_${t('bold italic')}_** |
| \`\\\`${t('inline code')}\\\`\` | \`${t('inline code')}\` |

---

## ${t('Links & Images')}

\`\`\`markdown
[${t('Link text')}](https://example.com)
[${t('Link with title')}](https://example.com "${t('Title')}")

![${t('Alt text')}](https://example.com/image.png)
![${t('Alt text')}](https://example.com/image.png "${t('Image title')}")
\`\`\`

---

## ${t('Lists')}

### ${t('Unordered')}

\`\`\`markdown
- ${t('Item one')}
- ${t('Item two')}
  - ${t('Nested item')}
- ${t('Item three')}

* ${t('Also works with asterisks')}
+ ${t('And plus signs')}
\`\`\`

- ${t('Item one')}
- ${t('Item two')}
  - ${t('Nested item')}
- ${t('Item three')}

### ${t('Ordered')}

\`\`\`markdown
1. ${t('First item')}
2. ${t('Second item')}
3. ${t('Third item')}
   1. ${t('Nested numbered')}
\`\`\`

1. ${t('First item')}
2. ${t('Second item')}
3. ${t('Third item')}
   1. ${t('Nested numbered')}

### ${t('Task Lists')}

\`\`\`markdown
- [ ] ${t('Unchecked task')}
- [x] ${t('Completed task')}
- [ ] ${t('Another task')}
\`\`\`

- [ ] ${t('Unchecked task')}
- [x] ${t('Completed task')}
- [ ] ${t('Another task')}

---

## ${t('Blockquotes')}

\`\`\`markdown
> ${t('Single level quote')}

> ${t('Nested quotes')}
>> ${t('Second level')}
>>> ${t('Third level')}
\`\`\`

> ${t('Single level quote')}

> ${t('Nested quotes')}
>> ${t('Second level')}
>>> ${t('Third level')}

---

## ${t('Code')}

### ${t('Inline')}

${t('Use backticks for')} \`${t('inline code')}\`.

### ${t('Fenced Code Blocks')}

\`\`\`\`markdown
\`\`\`javascript
function ${t('hello')}() {
  console.log("${t('Hello, world!')}");
}
\`\`\`
\`\`\`\`

\`\`\`javascript
function ${t('hello')}() {
  console.log("${t('Hello, world!')}");
}
\`\`\`

${t('Supported languages')}: javascript, typescript, python, rust, go, java, c, cpp, html, css, json, yaml, bash, sql, markdown, ${t('and more')}.

---

## ${t('Tables')}

\`\`\`markdown
| ${t('Header 1')} | ${t('Header 2')} | ${t('Header 3')} |
|----------|----------|----------|
| ${t('Cell 1')}   | ${t('Cell 2')}   | ${t('Cell 3')}   |
| ${t('Cell 4')}   | ${t('Cell 5')}   | ${t('Cell 6')}   |
\`\`\`

| ${t('Header 1')} | ${t('Header 2')} | ${t('Header 3')} |
|----------|----------|----------|
| ${t('Cell 1')}   | ${t('Cell 2')}   | ${t('Cell 3')}   |
| ${t('Cell 4')}   | ${t('Cell 5')}   | ${t('Cell 6')}   |

### ${t('Alignment')}

\`\`\`markdown
| ${t('Left')} | ${t('Center')} | ${t('Right')} |
|:-----|:------:|------:|
| L    |   C    |     R |
\`\`\`

| ${t('Left')} | ${t('Center')} | ${t('Right')} |
|:-----|:------:|------:|
| L    |   C    |     R |

---

## ${t('Horizontal Rules')}

${t('Any of these create a horizontal line')}:

\`\`\`markdown
---
***
___
\`\`\`

---

## ${t('HTML (Inline)')}

${t('Raw HTML is supported inline')}:

\`\`\`markdown
<details>
<summary>${t('Click to expand')}</summary>

${t('Hidden content here')}.

</details>

<kbd>Ctrl</kbd> + <kbd>S</kbd> ${t('to save')}

<mark>${t('Highlighted text')}</mark>

${t('Text with')} <sup>${t('superscript')}</sup> ${t('and')} <sub>${t('subscript')}</sub>
\`\`\`

<kbd>Ctrl</kbd> + <kbd>S</kbd> ${t('to save')}

<mark>${t('Highlighted text')}</mark>

${t('Text with')} <sup>${t('superscript')}</sup> ${t('and')} <sub>${t('subscript')}</sub>

---

## ${t('Escaping')}

${t('Use backslash to escape markdown characters')}:

\`\`\`markdown
\\*${t('not italic')}\\*
\\# ${t('not a heading')}
\\[${t('not a link')}\\]
\`\`\`

\\*${t('not italic')}\\*

---

## ${t('Editor Shortcuts')}

| ${t('Action')} | ${t('Shortcut')} |
|--------|----------|
| ${t('Save')} | \`Ctrl+S\` / \`Cmd+S\` |
| ${t('Indent')} | \`Tab\` (${t('inserts 2 spaces')}) |
| ${t('New line with list continuation')} | \`Enter\` ${t('on a list item')} |
| ${t('End list')} | \`Enter\` ${t('on empty list item')} |

### ${t('Newline Behavior')}

${t('The editor automatically continues')}:
- **${t('Unordered lists')}** (\`-\`, \`*\`, \`+\`)
- **${t('Ordered lists')}** (\`1.\`, \`2.\`, etc. ${t('auto-increments')})
- **${t('Task lists')}** (\`- [ ]\` ${t('continues unchecked')})
- **${t('Blockquotes')}** (\`>\`)

${t('Press')} **Enter** ${t('on an empty list item to exit the list')}.

---

## ${t('File Tree Status Colors')}

${t('Like git status in your IDE')}:

- <span style="color: #fbbf24">**${t('Amber (M)')}}</span> - ${t('Modified locally, not yet saved to cloud')}
- <span style="color: #4ade80">**${t('Green (U)')}}</span> - ${t('Newly created, not yet synced')}
- **${t('Default')}** - ${t('Synced with S3 storage')}.
`;

    return content;
  }, [t]);
}
