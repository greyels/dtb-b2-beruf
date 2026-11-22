# DTB B2 Beruf - interactive practice app

Practice app for the "Deutsch-Test für den Beruf B2" with 12 original model tests in the
exam format (Lesen, Lesen und Schreiben, Hören, Hören und Schreiben, Sprachbausteine,
Schreiben, Sprechen; tasks 1-58).

All test content is newly written for this app. It is not copied from published exam books.
A published model test was used only as a reference for the exam format.

## Start

Online: https://b2-beruf-training.pages.dev (Cloudflare Pages, deployed on every push to main).

Local: open `app/index.html` in Chrome or Edge (double-click is enough, no server needed).

- Chrome and Edge have good German voices for the Hören parts and support live speech
  recognition for the Sprechen parts. Firefox and Safari work too, with fewer voices and
  without live transcription (you can type your spoken answer instead).
- All answers are stored only in the browser (localStorage).

## Modes

- **Übung**: no time limit, audio can be paused and replayed. Each part has
  "Antworten prüfen" (shows solutions, explanations and the transcript for that part) and
  "Nochmal versuchen".
- **Prüfung**: time limit per block (Lesen 45 min, Lesen und Schreiben 20, Hören und Schreiben 5,
  Sprachbausteine und Schreiben 35), each audio plays once, solutions only at the end.

In both modes, "Test beenden" after the last part locks all answers and shows scores,
explanations, transcripts and model answers for the whole test.

## Schreiben and Sprechen

These parts are not scored automatically. The learner compares the own text with the
checklist and the model answer, which are shown at the end of the test. In Sprechen the
learner can record the answer and listen to it again.

## Folder layout

```
app/
  index.html, styles.css
  js/app.js        routing, rendering, scoring
  js/speech.js     browser text-to-speech for Hören
  tests/testNN.js  one Modelltest per file (window.DTB_TESTS.push({...}))
tools/
  TEST_FORMAT.md   data format of a test
  validate.mjs     checks a test file (counts, numbering, answer keys, lengths)
  smoke.mjs        renders every part of every test in jsdom and reports JS errors
  shuffle-keys.mjs reorders a/b/c options and matching labels so answer keys differ between
                   tests (already applied; only run it again on a newly added test)
  package.json     pinned dev tools (jsdom, wrangler)
```

## Tools

```bash
cd tools && npm install          # once
node validate.mjs                # check all tests
node smoke.mjs                   # render test of the whole app
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
