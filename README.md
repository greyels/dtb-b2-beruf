# DTB B2 Beruf - interactive practice app

Practice app for the "Deutsch-Test für den Beruf B2" with 12 original model tests in the
exam format (Lesen, Lesen und Schreiben, Hören, Hören und Schreiben, Sprachbausteine,
Schreiben, Sprechen; tasks 1-58).

All test content is newly written for this app. It is not copied from published exam books.
A published model test was used only as a reference for the exam format.

## Start

Online: https://b2-beruf-training.pages.dev (Cloudflare Pages) and https://greyels.github.io/dtb-b2-beruf/ (GitHub Pages).

Local: open `app/index.html` in Chrome or Edge (double-click is enough, no server needed).

- Chrome and Edge have good German voices for the Hören parts and support live speech
  recognition for the Sprechen parts. Firefox and Safari work too, with fewer voices and
  without live transcription (you can type your spoken answer instead).
- All answers are stored only in the browser (localStorage).

## Modes

In both modes the solutions are shown only at the end: after the last part, "Test beenden"
locks the answers and shows scores, explanations, transcripts and model answers.

- **Übung**: no time limit, audio can be paused and replayed.
- **Prüfung**: time limit per block (Lesen 45 min, Lesen und Schreiben 20, Hören und Schreiben 5,
  Sprachbausteine und Schreiben 35), each audio plays once.

## AI feedback (optional)

Schreiben (21, 58) and Sprechen (Teil 1-3) can be rated by Claude (model `claude-opus-5-5`).
Each user enters an own Anthropic API key in the settings (gear icon). The key stays in this
browser and is sent only to `api.anthropic.com`. The app calls the API directly from the
browser with the official SDK (`app/vendor/anthropic-sdk.js`, built from `@anthropic-ai/sdk`).
Without a key, model answers and checklists still work.

Cost: one feedback request is roughly 2-4k input and 2-4k output tokens.

## Folder layout

```
app/
  index.html, styles.css
  js/app.js        routing, rendering, scoring
  js/speech.js     browser text-to-speech for Hören
  js/feedback.js   Claude API feedback for Schreiben/Sprechen
  tests/testNN.js  one Modelltest per file (window.DTB_TESTS.push({...}))
  vendor/anthropic-sdk.js
tools/
  TEST_FORMAT.md   data format of a test
  validate.mjs     checks a test file (counts, numbering, answer keys, lengths)
  smoke.mjs        renders every part of every test in jsdom and reports JS errors
  shuffle-keys.mjs reorders a/b/c options and matching labels so answer keys differ between
                   tests (already applied; only run it again on a newly added test)
  package.json     pinned dev tools (SDK bundle, esbuild, jsdom)
```

## Tools

```bash
cd tools && npm install          # once
node validate.mjs                # check all tests
node smoke.mjs                   # render test of the whole app
npm run build:sdk                # rebuild app/vendor/anthropic-sdk.js
```

## Deploy to Cloudflare Pages

Uploads only the `app/` folder to the project `b2-beruf-training`
(https://b2-beruf-training.pages.dev).

```bash
cd tools
npm install            # once
npm run cf:login       # once: log in to Cloudflare in the browser
npm run cf:create      # once: create the Pages project
npm run cf:deploy      # every update: validate tests, then upload app/
```

## Add a test

Write `app/tests/test13.js` following `tools/TEST_FORMAT.md`, run `node tools/validate.mjs`
until it reports 0 errors. The app loads `test01.js` ... `test20.js` automatically.
