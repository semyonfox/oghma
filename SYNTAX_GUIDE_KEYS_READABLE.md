# Syntax Guide Page - Complete Translation Keys Reference

**Total Keys: 113 | Status: Ready for Translation | Date: 2026-03-18**

---

## 📚 All Translation Keys (Alphabetical)

### A
- Action
- Alignment
- Also works with asterisks
- Alt text
- Amber (M)
- And plus signs
- Another task
- Any of these create a horizontal line

### B
- Blockquotes
- bold
- bold italic

### C
- Cell 1
- Cell 2
- Cell 3
- Cell 4
- Cell 5
- Cell 6
- Center
- Click to expand
- Code
- Completed task

### D
- Default

### E
- Editor Shortcuts
- End list
- Escaping
- Everything you can write in OghmaNotes. Switch to **Source** mode to see the raw markdown, and **Read** mode to see it rendered.

### F
- Fenced Code Blocks
- File Tree Status Colors
- First item

### G
- Green (U)

### H
- HTML (Inline)
- Header 1
- Header 2
- Header 3
- Heading 1
- Heading 2
- Heading 3
- Heading 4
- Heading 5
- Heading 6
- Headings
- Hello, world!
- Hidden content here
- Highlighted text
- Horizontal Rules

### I
- Image title
- Indent
- Inline
- Item one
- Item three
- Item two
- italic

### L
- Left
- Like git status in your IDE
- Link text
- Link with title
- Links & Images
- Lists

### M
- Markdown Syntax Guide
- Modified locally, not yet saved to cloud

### N
- Nested item
- Nested numbered
- Nested quotes
- New line with list continuation
- Newline Behavior
- Newly created, not yet synced

### O
- Ordered
- Ordered lists

### P
- Press

### R
- Raw HTML is supported inline
- Result
- Right

### S
- Save
- Second item
- Second level
- Shortcut
- Single level quote
- Supported languages
- Synced with S3 storage
- Syntax

### T
- Tables
- Task Lists
- Task lists
- Text Formatting
- Text with
- The editor automatically continues
- Third item
- Third level
- Title

### U
- Unchecked task
- Unordered
- Unordered lists
- Use backslash to escape markdown characters
- Use backticks for

### Other Special Keys
- &larr; Back to Notes
- and
- and more
- auto-increments
- continues unchecked
- hello
- inline code
- inserts 2 spaces
- not a heading
- not a link
- not italic
- on a list item
- on an empty list item to exit the list
- on empty list item
- strikethrough
- subscript
- superscript
- to save

---

## 🏷️ Keys by Section (With Context)

### Main Introduction
```
Markdown Syntax Guide
Everything you can write in OghmaNotes. Switch to **Source** mode to see the raw markdown, and **Read** mode to see it rendered.
```

### Headings Section (8 keys)
```
Headings
  - Heading 1
  - Heading 2
  - Heading 3
  - Heading 4
  - Heading 5
  - Heading 6
```

### Text Formatting Section (7 keys)
```
Text Formatting
  - Syntax (table header)
  - Result (table header)
  - bold
  - italic
  - strikethrough
  - bold italic
  - inline code (appears in text: "Use backticks for `inline code`")
```

### Links & Images Section (6 keys)
```
Links & Images
  - Link text
  - Link with title
  - Title
  - Alt text
  - Image title
```

### Lists Section (15 keys)
```
Lists
  - Unordered
    * Also works with asterisks
    * And plus signs
    * Item one
    * Item two
    * Nested item
    * Item three
  - Ordered
    * First item
    * Second item
    * Third item
    * Nested numbered
  - Task Lists
    * Unchecked task
    * Completed task
    * Another task
```

### Blockquotes Section (3 keys)
```
Blockquotes
  - Single level quote
  - Nested quotes
  - Second level
  - Third level
```

### Code Section (10 keys)
```
Code
  - Inline
    * Use backticks for
    * inline code
  - Fenced Code Blocks
    * hello (function name)
    * Hello, world! (console output)
  - Supported languages
  - and more
```

### Tables Section (15 keys)
```
Tables
  - Header 1, Header 2, Header 3 (table headers)
  - Cell 1 through Cell 6 (table cells)
  - Alignment (subsection)
    * Left, Center, Right (column alignment examples)
  - Syntax, Result (table column headers)
```

### HTML Section (10 keys)
```
HTML (Inline)
  - Raw HTML is supported inline
  - Click to expand
  - Hidden content here
  - Highlighted text
  - Text with
  - superscript
  - subscript
  - and
  - to save
  - Modified locally, not yet saved to cloud
```

### Escaping Section (5 keys)
```
Escaping
  - Use backslash to escape markdown characters
  - not italic
  - not a heading
  - not a link
  - Newly created, not yet synced
```

### Editor Shortcuts Section (10 keys)
```
Editor Shortcuts
  - Action (table header)
  - Shortcut (table header)
  - Save
  - Indent
  - inserts 2 spaces
  - New line with list continuation
  - End list
  - on a list item
  - on empty list item
  - Newline Behavior (subsection)
    * The editor automatically continues
    * Unordered lists
    * Ordered lists
    * Task lists
    * Blockquotes
    * Press
    * on an empty list item to exit the list
    * auto-increments
    * continues unchecked
```

### File Tree Status Colors Section (6 keys)
```
File Tree Status Colors
  - Like git status in your IDE
  - Amber (M)
  - Modified locally, not yet saved to cloud
  - Green (U)
  - Newly created, not yet synced
  - Default
  - Synced with S3 storage
```

### Navigation (1 key)
```
&larr; Back to Notes
```

---

## 📊 Key Statistics

| Metric | Count |
|--------|-------|
| Total Unique Keys | 113 |
| Hardcoded in Hook | 113 |
| Documentation Keys | 113 |
| Section Headings | 15 |
| Example Strings | 50+ |
| Descriptive Strings | 35+ |
| Navigation Elements | 1 |
| Special Characters | 1 (&larr;) |

---

## 🔗 Key Relationships

### Keys used multiple times (intentional reuse):
- `Syntax` - used in Text Formatting table AND Editor Shortcuts context
- `Result` - used in Text Formatting table
- `inline code` - appears in multiple contexts
- `and` - used in multiple formatting descriptions

### Keys that appear in markdown code blocks:
- All code example keys maintain markdown syntax
- Special characters are preserved (backticks, asterisks, brackets)
- Table formatting characters are preserved

### Context-dependent keys:
- Navigation uses `&larr;` for back arrow
- Status colors reference git conventions (Amber/Green/Default)
- Editor shortcuts reference common keyboard shortcuts (Ctrl+S, etc.)

---

## ✅ Quality Notes

1. **No Empty Strings**: All keys have meaningful content
2. **No Duplicates**: Each unique phrase appears once in the key list
3. **Special Characters**: HTML entities and markdown syntax preserved
4. **Code Examples**: Programming language examples included as-is
5. **Language Agnostic**: Keys designed to work across all 12 supported languages

---

## 🌐 Translation Considerations

### By Language Family

**Germanic Languages** (German, Dutch, Swedish, English):
- Similar word order and grammar
- May need adjustment for table/list formatting
- Code examples remain language-independent

**Romance Languages** (French, Spanish, Italian):
- Gender-specific terms may vary
- Potential length variations (French tends to be longer)
- Table cells may need width adjustments

**Other Languages** (Irish, Hindi, Chinese, Russian, Arabic):
- Right-to-left considerations (Arabic)
- Character set variations
- Potential significant length differences
- Special attention to code example context

---

## 📝 Translation Team Instructions

1. **Extract** all 113 keys from `TRANSLATION_KEYS_SYNTAX_GUIDE.json`
2. **Translate** each key maintaining:
   - Markdown syntax markers
   - Code example integrity
   - Special characters and symbols
   - Table and list formatting
3. **Test** in development environment with actual markdown renderer
4. **Verify** display in all affected sections
5. **Review** for:
   - Text overflow in tables
   - Code block readability
   - List item alignment
   - Special character display

---

**Ready for Translation | All Keys Documented | Complete Coverage**
