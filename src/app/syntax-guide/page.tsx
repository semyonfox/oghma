'use client';

import PreviewRenderer from '@/components/editor/preview-renderer';
import Link from 'next/link';

const GUIDE_CONTENT = `# Markdown Syntax Guide

Everything you can write in OghmaNotes. Switch to **Source** mode to see the raw markdown, and **Read** mode to see it rendered.

---

## Headings

\`\`\`markdown
# Heading 1
## Heading 2
### Heading 3
#### Heading 4
##### Heading 5
###### Heading 6
\`\`\`

---

## Text Formatting

| Syntax | Result |
|--------|--------|
| \`**bold**\` | **bold** |
| \`*italic*\` | *italic* |
| \`~~strikethrough~~\` | ~~strikethrough~~ |
| \`**_bold italic_**\` | **_bold italic_** |
| \`\\\`inline code\\\`\` | \`inline code\` |

---

## Links & Images

\`\`\`markdown
[Link text](https://example.com)
[Link with title](https://example.com "Title")

![Alt text](https://example.com/image.png)
![Alt text](https://example.com/image.png "Image title")
\`\`\`

---

## Lists

### Unordered

\`\`\`markdown
- Item one
- Item two
  - Nested item
- Item three

* Also works with asterisks
+ And plus signs
\`\`\`

- Item one
- Item two
  - Nested item
- Item three

### Ordered

\`\`\`markdown
1. First item
2. Second item
3. Third item
   1. Nested numbered
\`\`\`

1. First item
2. Second item
3. Third item
   1. Nested numbered

### Task Lists

\`\`\`markdown
- [ ] Unchecked task
- [x] Completed task
- [ ] Another task
\`\`\`

- [ ] Unchecked task
- [x] Completed task
- [ ] Another task

---

## Blockquotes

\`\`\`markdown
> Single level quote

> Nested quotes
>> Second level
>>> Third level
\`\`\`

> Single level quote

> Nested quotes
>> Second level
>>> Third level

---

## Code

### Inline

Use backticks for \`inline code\`.

### Fenced Code Blocks

\`\`\`\`markdown
\`\`\`javascript
function hello() {
  console.log("Hello, world!");
}
\`\`\`
\`\`\`\`

\`\`\`javascript
function hello() {
  console.log("Hello, world!");
}
\`\`\`

Supported languages: javascript, typescript, python, rust, go, java, c, cpp, html, css, json, yaml, bash, sql, markdown, and more.

---

## Tables

\`\`\`markdown
| Header 1 | Header 2 | Header 3 |
|----------|----------|----------|
| Cell 1   | Cell 2   | Cell 3   |
| Cell 4   | Cell 5   | Cell 6   |
\`\`\`

| Header 1 | Header 2 | Header 3 |
|----------|----------|----------|
| Cell 1   | Cell 2   | Cell 3   |
| Cell 4   | Cell 5   | Cell 6   |

### Alignment

\`\`\`markdown
| Left | Center | Right |
|:-----|:------:|------:|
| L    |   C    |     R |
\`\`\`

| Left | Center | Right |
|:-----|:------:|------:|
| L    |   C    |     R |

---

## Horizontal Rules

Any of these create a horizontal line:

\`\`\`markdown
---
***
___
\`\`\`

---

## HTML (Inline)

Raw HTML is supported inline:

\`\`\`markdown
<details>
<summary>Click to expand</summary>

Hidden content here.

</details>

<kbd>Ctrl</kbd> + <kbd>S</kbd> to save

<mark>Highlighted text</mark>

Text with <sup>superscript</sup> and <sub>subscript</sub>
\`\`\`

<kbd>Ctrl</kbd> + <kbd>S</kbd> to save

<mark>Highlighted text</mark>

Text with <sup>superscript</sup> and <sub>subscript</sub>

---

## Escaping

Use backslash to escape markdown characters:

\`\`\`markdown
\\*not italic\\*
\\# not a heading
\\[not a link\\]
\`\`\`

\\*not italic\\*

---

## Editor Shortcuts

| Action | Shortcut |
|--------|----------|
| Save | \`Ctrl+S\` / \`Cmd+S\` |
| Indent | \`Tab\` (inserts 2 spaces) |
| New line with list continuation | \`Enter\` on a list item |
| End list | \`Enter\` on empty list item |

### Newline Behavior

The editor automatically continues:
- **Unordered lists** (\`-\`, \`*\`, \`+\`)
- **Ordered lists** (\`1.\`, \`2.\`, etc. auto-increments)
- **Task lists** (\`- [ ]\` continues unchecked)
- **Blockquotes** (\`>\`)

Press **Enter** on an empty list item to exit the list.

---

## File Tree Status Colors

Like git status in your IDE:

- <span style="color: #fbbf24">**Amber (M)**</span> - Modified locally, not yet saved to cloud
- <span style="color: #4ade80">**Green (U)**</span> - Newly created, not yet synced
- **Default** - Synced with S3 storage
`;

export default function SyntaxGuidePage() {
  return (
    <div className="min-h-screen bg-gray-950 text-gray-200">
      <div className="max-w-4xl mx-auto px-6 py-8">
        <div className="mb-6 flex items-center justify-between">
          <Link
            href="/notes"
            className="text-sm text-indigo-400 hover:text-indigo-300 transition-colors"
          >
            &larr; Back to Notes
          </Link>
        </div>
        <PreviewRenderer content={GUIDE_CONTENT} />
      </div>
    </div>
  );
}
