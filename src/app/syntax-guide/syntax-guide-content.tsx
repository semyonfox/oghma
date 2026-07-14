import type { ReactNode } from "react";

type Translate = (key: string) => string;

const sectionClass = "text-3xl font-bold mt-6 mb-3";
const subheadingClass = "text-2xl font-bold mt-4 mb-2";
const listClass = "list-disc list-outside pl-6 my-3 space-y-1 text-text";
const orderedListClass = "list-decimal list-outside pl-6 my-3 space-y-1 text-text";
const codeClass = "block overflow-x-auto rounded bg-surface px-4 py-3 my-4 whitespace-pre";

function Rule() {
  return <hr className="my-6" />;
}

function Code({ children }: { children: ReactNode }) {
  return <code className={codeClass}>{children}</code>;
}

function Table({
  headings,
  rows,
}: {
  headings: ReactNode[];
  rows: ReactNode[][];
}) {
  return (
    <div className="overflow-x-auto my-4">
      <table className="min-w-full border border-border">
        <thead>
          <tr>
            {headings.map((heading, index) => (
              <th key={index} className="border border-border px-4 py-2 bg-surface font-semibold text-left">
                {heading}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, rowIndex) => (
            <tr key={rowIndex}>
              {row.map((cell, cellIndex) => (
                <td key={cellIndex} className="border border-border px-4 py-2">
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function SyntaxGuideContent({ t }: { t: Translate }) {
  return (
    <article className="markdown-preview w-full max-w-none">
      <h1 className="text-4xl font-bold mt-8 mb-4">{t("Markdown Syntax Guide")}</h1>
      <p>{t("Everything you can write in OghmaNotes. Write in one clean surface: Markdown stays editable where you are typing and renders into readable blocks around it.")}</p>
      <Rule />

      <h2 className={sectionClass}>{t("Headings")}</h2>
      <Code>{`# ${t("Heading 1")}\n## ${t("Heading 2")}\n### ${t("Heading 3")}\n#### ${t("Heading 4")}\n##### ${t("Heading 5")}\n###### ${t("Heading 6")}`}</Code>
      <Rule />

      <h2 className={sectionClass}>{t("Text Formatting")}</h2>
      <Table headings={[t("Syntax"), t("Result")]} rows={[
        [<code key="b">**{t("bold")}**</code>, <strong key="br">{t("bold")}</strong>],
        [<code key="i">*{t("italic")}*</code>, <em key="ir">{t("italic")}</em>],
        [<code key="s">~~{t("strikethrough")}~~</code>, <s key="sr">{t("strikethrough")}</s>],
        [<code key="bi">**_{t("bold italic")}_**</code>, <strong key="bir"><em>{t("bold italic")}</em></strong>],
        [<code key="ic">`{t("inline code")}`</code>, <code key="icr">{t("inline code")}</code>],
      ]} />
      <Rule />

      <h2 className={sectionClass}>{t("Links & Images")}</h2>
      <Code>{`[${t("Link text")}](https://example.com)\n[${t("Link with title")}](https://example.com "${t("Title")}")\n\n![${t("Alt text")}](https://example.com/image.png)\n![${t("Alt text")}](https://example.com/image.png "${t("Image title")}")`}</Code>
      <Rule />

      <h2 className={sectionClass}>{t("Lists")}</h2>
      <h3 className={subheadingClass}>{t("Unordered")}</h3>
      <Code>{`- ${t("Item one")}\n- ${t("Item two")}\n  - ${t("Nested item")}\n- ${t("Item three")}\n\n* ${t("Also works with asterisks")}\n+ ${t("And plus signs")}`}</Code>
      <ul className={listClass}><li>{t("Item one")}</li><li>{t("Item two")}<ul className={listClass}><li>{t("Nested item")}</li></ul></li><li>{t("Item three")}</li></ul>
      <h3 className={subheadingClass}>{t("Ordered")}</h3>
      <Code>{`1. ${t("First item")}\n2. ${t("Second item")}\n3. ${t("Third item")}\n   1. ${t("Nested numbered")}`}</Code>
      <ol className={orderedListClass}><li>{t("First item")}</li><li>{t("Second item")}</li><li>{t("Third item")}<ol className={orderedListClass}><li>{t("Nested numbered")}</li></ol></li></ol>
      <h3 className={subheadingClass}>{t("Task Lists")}</h3>
      <Code>{`- [ ] ${t("Unchecked task")}\n- [x] ${t("Completed task")}\n- [ ] ${t("Another task")}`}</Code>
      <ul className={listClass}><li><input type="checkbox" readOnly className="mr-2 align-middle" />{t("Unchecked task")}</li><li><input type="checkbox" checked readOnly className="mr-2 align-middle" />{t("Completed task")}</li><li><input type="checkbox" readOnly className="mr-2 align-middle" />{t("Another task")}</li></ul>
      <Rule />

      <h2 className={sectionClass}>{t("Blockquotes")}</h2>
      <Code>{`> ${t("Single level quote")}\n\n> ${t("Nested quotes")}\n>> ${t("Second level")}\n>>> ${t("Third level")}`}</Code>
      <blockquote className="border-l-4 border-[var(--md-accent)] pl-4 italic my-4 text-[var(--md-text-muted)]">{t("Single level quote")}</blockquote>
      <blockquote className="border-l-4 border-[var(--md-accent)] pl-4 italic my-4 text-[var(--md-text-muted)]">{t("Nested quotes")}<blockquote className="border-l-4 border-[var(--md-accent)] pl-4 my-2">{t("Second level")}<blockquote className="border-l-4 border-[var(--md-accent)] pl-4 my-2">{t("Third level")}</blockquote></blockquote></blockquote>
      <Rule />

      <h2 className={sectionClass}>{t("Code")}</h2>
      <h3 className={subheadingClass}>{t("Inline")}</h3>
      <p>{t("Use backticks for")} <code>{t("inline code")}</code>.</p>
      <h3 className={subheadingClass}>{t("Fenced Code Blocks")}</h3>
      <Code>{`\`\`\`javascript\nfunction ${t("hello")}() {\n  console.log("${t("Hello, world!")}");\n}\n\`\`\``}</Code>
      <Code>{`function ${t("hello")}() {\n  console.log("${t("Hello, world!")}");\n}`}</Code>
      <p>{t("Supported languages")}: javascript, typescript, python, rust, go, java, c, cpp, html, css, json, yaml, bash, sql, markdown, {t("and more")}.</p>
      <h3 className={subheadingClass}>{t("Mermaid (code fence)")}</h3>
      <p>{t("Mermaid fences are preserved and highlighted as code today. Visual diagram rendering is planned.")}</p>
      <Code>{`\`\`\`mermaid\ngraph TD\n  A[Upload] --> B[Extract]\n  B --> C[Embed]\n\`\`\``}</Code>
      <Code>{`graph TD\n  A[Upload] --> B[Extract]\n  B --> C[Embed]`}</Code>
      <Rule />

      <h2 className={sectionClass}>{t("Tables")}</h2>
      <Code>{`| ${t("Header 1")} | ${t("Header 2")} | ${t("Header 3")} |\n|----------|----------|----------|\n| ${t("Cell 1")} | ${t("Cell 2")} | ${t("Cell 3")} |\n| ${t("Cell 4")} | ${t("Cell 5")} | ${t("Cell 6")} |`}</Code>
      <Table headings={[t("Header 1"), t("Header 2"), t("Header 3")]} rows={[[t("Cell 1"), t("Cell 2"), t("Cell 3")], [t("Cell 4"), t("Cell 5"), t("Cell 6")]]} />
      <h3 className={subheadingClass}>{t("Alignment")}</h3>
      <Code>{`| ${t("Left")} | ${t("Center")} | ${t("Right")} |\n|:-----|:------:|------:|\n| L | C | R |`}</Code>
      <Table headings={[t("Left"), t("Center"), t("Right")]} rows={[["L", "C", "R"]]} />
      <Rule />

      <h2 className={sectionClass}>{t("Horizontal Rules")}</h2>
      <p>{t("Any of these create a horizontal line")}:</p>
      <Code>{`---\n***\n___`}</Code>
      <Rule />

      <h2 className={sectionClass}>{t("HTML (Inline)")}</h2>
      <p>{t("Raw HTML is supported inline")}:</p>
      <Code>{`<details>\n<summary>${t("Click to expand")}</summary>\n\n${t("Hidden content here")}.\n\n</details>\n\n<kbd>Ctrl</kbd> + <kbd>S</kbd> ${t("to save")}\n\n<mark>${t("Highlighted text")}</mark>\n\n${t("Text with")} <sup>${t("superscript")}</sup> ${t("and")} <sub>${t("subscript")}</sub>`}</Code>
      <p><kbd>Ctrl</kbd> + <kbd>S</kbd> {t("to save")}</p>
      <p><mark>{t("Highlighted text")}</mark></p>
      <p>{t("Text with")} <sup>{t("superscript")}</sup> {t("and")} <sub>{t("subscript")}</sub></p>
      <Rule />

      <h2 className={sectionClass}>{t("Escaping")}</h2>
      <p>{t("Use backslash to escape markdown characters")}:</p>
      <Code>{`\\*${t("not italic")}\\*\n\\# ${t("not a heading")}\n\\[${t("not a link")}\\]`}</Code>
      <p>*{t("not italic")}*</p>
      <Rule />

      <h2 className={sectionClass}>{t("Editor Shortcuts")}</h2>
      <Table headings={[t("Action"), t("Shortcut")]} rows={[
        [t("Save"), <span key="save"><code>Ctrl+S</code> / <code>Cmd+S</code></span>],
        [t("Indent"), <span key="indent"><code>Tab</code> ({t("inserts 2 spaces")})</span>],
        [t("New line with list continuation"), <span key="continue"><code>Enter</code> {t("on a list item")}</span>],
        [t("End list"), <span key="end"><code>Enter</code> {t("on empty list item")}</span>],
      ]} />
      <h3 className={subheadingClass}>{t("Newline Behavior")}</h3>
      <p>{t("The editor automatically continues")}:</p>
      <ul className={listClass}><li><strong>{t("Unordered lists")}</strong> (<code>-</code>, <code>*</code>, <code>+</code>)</li><li><strong>{t("Ordered lists")}</strong> (<code>1.</code>, <code>2.</code>, etc. {t("auto-increments")})</li><li><strong>{t("Task lists")}</strong> (<code>- [ ]</code> {t("continues unchecked")})</li><li><strong>{t("Blockquotes")}</strong> (<code>&gt;</code>)</li></ul>
      <p>{t("Press")} <strong>Enter</strong> {t("on an empty list item to exit the list")}.</p>
      <Rule />

      <h2 className={sectionClass}>{t("File Tree Status Colors")}</h2>
      <p>{t("Like git status in your IDE")}:</p>
      <ul className={listClass}><li><strong>{t("Amber (M)")}</strong> - {t("Modified locally, not yet saved to cloud")}</li><li><strong>{t("Green (U)")}</strong> - {t("Newly created, not yet synced")}</li><li><strong>{t("Default")}</strong> - {t("Synced with S3 storage")}.</li></ul>
    </article>
  );
}
