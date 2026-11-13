# First-user usability sessions

> **Status:** Target (session kit, not yet run)
> **Last reviewed:** 2026-11-13
> **Source of truth for:** How the first real-student sessions are run and recorded ([#402](https://github.com/semyonfox/oghma/issues/402))

The July 2026 review recommended testing with real students before any wider
brand work. This page is the kit for that. Findings go in a dated
`docs/research/` note once the sessions have run.

## Who

Five students is enough to find the big problems. Aim for a mix:

- two who use Canvas daily and have never seen OghmaNotes
- one who studies mostly on a phone
- one from outside computer science
- one who already uses Anki, Quizlet or NotebookLM

Don't recruit friends who have already used the app. Their feedback is useful
too, but run it separately.

## Before the session

- Make a fresh account on the environment you're testing, with a real inbox
  for the participant.
- Check that Canvas content import is on in that environment if task 3 is in
  scope.
- Read out the consent script below and get a yes before you start.

### Consent script

> This is a test of the app, not of you. I'll ask you to try a few things and
> think out loud. I'll take written notes. I won't record your screen or voice
> unless you say yes now. Your name won't appear in anything we write up. You
> can stop at any time. Is that OK?

Note only what the participant does and says. Never copy their course content,
grades or Canvas data into notes.

## Tasks

Give one task at a time. Don't explain the interface. If someone is stuck for
two minutes, note it, then give the smallest hint that gets them moving.

1. **Landing page (2 min).** Open the homepage on a phone. "In your own words,
   what does this do and who is it for?"
2. **Sign-up (3 min).** Create an account and get to the workspace.
3. **Canvas (5 min).** "Get one of your modules into the app." Note what they
   expect to happen and what they see while it runs.
4. **Notes (5 min).** Open an imported or welcome note and read it for a
   minute. Ask about text size, contrast and line length, outdoors if possible.
5. **Study (5 min).** Start a quiz. Use the hint once and "Explain simply"
   once.
6. **Wrap-up (3 min).** "What would make you open this again next week? What
   nearly made you give up?"

## What to capture

For each task, write down:

- whether they finished it, and how long it took
- where they hesitated or went the wrong way
- the exact words of any confusion ("where's the...", "I thought this would...")
- contrast or readability complaints, with the page and the device
- form friction: fields they retyped, errors they didn't understand

Use one sheet per participant, with participant numbers rather than names.

## After the sessions

1. Group the observations by task and count how many participants hit each
   problem.
2. A problem two or more people hit becomes a GitHub issue that links back
   here.
3. Problems only one person hit stay in the write-up unless they block the
   task.
4. Decide which issues justify the next implementation pass, and close
   [#402](https://github.com/semyonfox/oghma/issues/402) with a link to the
   write-up.
