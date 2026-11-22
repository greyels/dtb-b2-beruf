# DTB B2 Beruf - interactive practice app

Practice app for the "Deutsch-Test für den Beruf B2" with 12 original model tests in the
exam format (Lesen, Lesen und Schreiben, Hören, Hören und Schreiben, Sprachbausteine,
Schreiben, Sprechen; tasks 1-58).

All test content is newly written for this app. It is not copied from published exam books.
A published model test was used only as a reference for the exam format.

## Start

- **Online**: https://b2-beruf-training.pages.dev
- **Local**: open `app/index.html` in Chrome or Edge. A double-click is enough, no server is needed.

Browser notes:

- Chrome and Edge have good German voices for Hören and support live speech recognition for
  Sprechen. Firefox and Safari work too, with fewer voices and without live transcription
  (you can type the spoken answer instead).
- The microphone works only on HTTPS pages or local files, so it works on the online site
  but not over a plain `http://` address in the local network.
- All answers are stored only in the browser (localStorage). Each device keeps its own progress.

## Features

- **12 model tests**, each focused on one job sector (Logistik, Pflege, IT, Hotel, Handwerk,
  Einzelhandel, Industrie, Büro, Energie, Banken, Bildung, Verkehr).
- **Explanations**: every closed task has a short German explanation that points to the
  evidence in the text or the audio script.
- **Hören**: the browser reads the scripts with a female and a male German voice.
  Voices and speed can be changed in the settings.
- **Sprechen**: record the answer, listen to it again, and see a live transcript
  (Chrome/Edge). Useful phrases and a model dialogue for Teil 3.
- **Schreiben**: checklist and model answer for tasks 21 and 58.
- **Points**: every part shows its official exam points. The results page shows points per
  skill and the pass rule.
- **Light and dark theme**: switch in the top bar, or "Automatisch" in the settings to follow
  the system.

## Modes

- **Übung**: no time limit, audio can be paused and replayed. Each part has
  "Antworten prüfen" (solutions, explanations, points and the transcript for that part) and
  "Nochmal versuchen".
- **Prüfung**: time limit per block (Lesen 45 min, Lesen und Schreiben 20, Hören und Schreiben 5,
  Sprachbausteine und Schreiben 35), each audio plays once, solutions only at the end.

In both modes, "Test beenden" after the last part locks all answers and shows scores,
explanations, transcripts and model answers for the whole test.

## Scoring

Points follow the official DTB B2 scoring (telc Übungstest 1, 2020, "Punkte und Gewichtung"):

| Skill | Points | Parts |
|---|---|---|
| Lesen | 60 | Lesen 1-4, Lesen und Schreiben 19-20 (3 points per task) |
| Hören | 60 | Hören 1-4, Hören und Schreiben 41 (3 points per task) |
| Schreiben | 60 | Texts 21 and 58, Telefonnotiz 42-45, Sprachbausteine 46-57 |
| Sprechen | 60 | Teil 1-3 |

Pass rule: at least 144 of 240 points, and at least three of the four skills with 60 % or more.
One weaker skill between 40 % and 60 % can be balanced.

The app scores only the closed tasks automatically: Lesen, Hören, the Sprachbausteine and the
Telefonnotiz (key words). Texts 21 and 58 and Sprechen are rated by examiners in the real exam.
The learner compares them with the checklist and the model answer.

## Folder layout

```
app/                     the website (this folder is deployed)
  index.html, styles.css
  js/app.js              routing, rendering, scoring, settings
  js/speech.js           browser text-to-speech for Hören
  tests/testNN.js        one model test per file (window.DTB_TESTS.push({...}))
tools/
  TEST_FORMAT.md         data format of a test
  validate.mjs           checks test files (counts, numbering, answer keys, lengths)
  smoke.mjs              renders every part of every test in jsdom and reports JS errors
  shuffle-keys.mjs       reorders a/b/c options and matching labels so answer keys differ
                         between tests (already applied; run it only on a newly added test)
  package.json           pinned dev tools (jsdom, wrangler) and deploy scripts
.github/workflows/
  deploy-cloudflare.yml  validates the tests and deploys app/ on every push to main
```

## Tools

```bash
cd tools
npm install            # once
node validate.mjs      # check all tests
node smoke.mjs         # render every part of every test, report JS errors
```

## Deployment

The site runs on Cloudflare Pages, project `b2-beruf-training`.

**Automatic**: every push to `main` starts the GitHub Actions workflow
`deploy-cloudflare.yml`. It runs the validator and uploads `app/`. If the validator finds an
error, nothing is uploaded. The workflow needs two repository secrets:

- `CLOUDFLARE_API_TOKEN`: a Cloudflare API token with the permission Account > Cloudflare Pages > Edit
- `CLOUDFLARE_ACCOUNT_ID`: the Cloudflare account ID

Runs are listed on the Actions tab of the repository, or with `gh run list`.

**Manual** (from a local machine):

```bash
cd tools
npm run cf:login       # once: log in to Cloudflare in the browser
npm run cf:create      # once: create the Pages project
npm run cf:deploy      # validate tests, then upload app/
```

## Add a test

Write `app/tests/test13.js` following `tools/TEST_FORMAT.md`, then run
`node tools/validate.mjs` until it reports 0 errors. Run `node tools/shuffle-keys.mjs
app/tests/test13.js` so its answer keys do not repeat the pattern of other tests.
The app loads `test01.js` ... `test20.js` automatically.
