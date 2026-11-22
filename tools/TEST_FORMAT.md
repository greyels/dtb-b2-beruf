# Modelltest data format (DTB B2 Beruf)

Each Modelltest is one file `app/tests/testNN.js` (NN = 01..12). The app loads it with a
plain `<script>` tag, so the file must look exactly like this:

```js
window.DTB_TESTS = window.DTB_TESTS || [];
window.DTB_TESTS.push({ ...test object... });
```

Write the object as JSON-compatible JavaScript (double-quoted keys and strings are fine).
Check the file with:

```bash
node tools/validate.mjs app/tests/testNN.js
```

The file must pass with **0 errors**. Fix warnings when they are about length or balance.

---

## General content rules

- Level: **B2**, work context ("Deutsch-Test fuer den Beruf"). Real, natural German.
  Use correct umlauts and ß (ä ö ü Ä Ö Ü ß) in all German text.
- **All content must be original.** Do not copy names, companies, sentences or situations from
  any published test book. Invent new people, companies, places and products.
- Every closed task has exactly **one** correct answer that is clearly supported by the text or
  script. Distractors must be plausible: they use words from the text but change the meaning
  (wrong person, wrong time, negation, "only" vs "also", future vs past, etc.).
- Mix the correct letters. Over the whole test, no letter (a/b/c) should be correct in more than
  about 45 % of the a/b/c tasks. Richtig/falsch: about half true, half false.
- Every closed task has an `explain` field: 1-2 short German sentences that quote or point to
  the evidence ("Im Text steht: ... Deshalb ist b richtig."). This is shown to the learner after
  checking.
- Text fields: plain text. Use `\n\n` between paragraphs and `\n` for a line break. No HTML,
  no Markdown.
- Audio scripts (`script`) are lists of lines `{ "s": "Name or role", "g": "m" | "f", "t": "text" }`.
  `g` selects a male or female voice. A monologue (phone message, presentation) is one speaker,
  split into several lines of 1-3 sentences each. Write spoken German: short sentences, fillers
  like "also", "na ja", "genau", repairs, but no stage directions in `t`.

---

## Task numbering (fixed, 1-58)

| Part | Nr | Type |
|---|---|---|
| Lesen Teil 1 | 1-5 | match 5 persons to 8 texts a-h (3 texts unused) |
| Lesen Teil 2 | 6-9 | 2 texts; per text 1 richtig/falsch (6, 8) + 1 a/b/c (7, 9) |
| Lesen Teil 3 | 10-13 | match 4 forum questions to 6 answers a-f; exactly ONE question has no answer -> "x" |
| Lesen Teil 4 | 14-18 | 1 long document, 5 a/b/c |
| Lesen und Schreiben | 19-20 | 2 a/b/c about a forwarded email |
| Lesen und Schreiben | 21 | write a reply email |
| Hoeren Teil 1 | 22-27 | 3 dialogues; per dialogue 1 richtig/falsch (22, 24, 26) + 1 a/b/c (23, 25, 27) |
| Hoeren Teil 2 | 28-31 | 4 short dialogues, match to 6 statements a-f (2 unused) |
| Hoeren Teil 3 | 32-35 | 1 presentation with questions from the audience, 4 a/b/c |
| Hoeren Teil 4 | 36-40 | 5 phone messages, 1 a/b/c each |
| Hoeren und Schreiben | 41 | 1 phone message, reason for the call: a Angebot / b Bestellung/Buchung / c Beschwerde |
| Hoeren und Schreiben | 42-45 | phone note (name, firm, phone, infos, to do) |
| Sprachbausteine Teil 1 | 46-51 | text with 6 gaps, box of 10 words a-j |
| Sprachbausteine Teil 2 | 52-57 | text with 6 gaps, a/b/c per gap |
| Schreiben | 58 | forum post, choose Thema A or B |
| Sprechen | - | Teil 1 (topics), Teil 2 (small talk), Teil 3 (solve a problem) |

---

## Target lengths (words, approximate)

| Item | Words |
|---|---|
| Lesen T1: each person line | 12-25 |
| Lesen T1: each text a-h | 40-70 |
| Lesen T2: each text | 200-280 |
| Lesen T3: each question post | 40-70 |
| Lesen T3: each answer post | 40-70 |
| Lesen T4: document | 380-480 |
| L+S: original customer email | 150-220 |
| Hoeren T1: each dialogue | 200-320 |
| Hoeren T2: each dialogue | 100-170 |
| Hoeren T3: presentation (with audience questions) | 550-750 |
| Hoeren T4: each message | 60-110 |
| H+S: message | 70-110 |
| Sprachbausteine T1 text | 150-220 |
| Sprachbausteine T2 text | 160-240 |
| Model answers (21, 58 A/B) | 150-220 each |

---

## Object structure

Below is the complete structure. `...` marks repeated items. Counts are fixed.

```js
{
  "id": "mt01",                       // "mt" + NN
  "title": "Modelltest 1",
  "sector": "Logistik und Lager",     // the job sector this test focuses on
  "summary": "One German sentence about the topics of this test.",

  "lesen": {
    "teil1": {
      "situation": "Sie lesen ... und möchten ... Entscheiden Sie, welcher Text a-h zu welcher Person 1-5 passt.",
      "persons": [ { "nr": 1, "text": "Name + what they want/need." }, ... 5 items, nr 1-5 ],
      "texts": [ { "key": "a", "title": "Headline", "text": "Teaser text ..." }, ... 8 items, keys a-h ],
      "answers": { "1": "e", "2": "a", "3": "h", "4": "f", "5": "c" },   // 5 different letters
      "explain": { "1": "...", "2": "...", "3": "...", "4": "...", "5": "..." }
    },
    "teil2": {
      "situation": "Sie lesen Informationen für neue Mitarbeitende ... ",
      "texts": [
        {
          "doc": { "title": "Urlaubsplanung", "meta": [], "sections": [ { "heading": "", "text": "..." } ] },
          "tasks": [
            { "nr": 6, "type": "rf", "text": "Statement ...", "answer": true, "explain": "..." },
            { "nr": 7, "type": "mc", "text": "Stem ...", "options": { "a": "...", "b": "...", "c": "..." }, "answer": "b", "explain": "..." }
          ]
        },
        { "doc": { ... }, "tasks": [ { "nr": 8, "type": "rf", ... }, { "nr": 9, "type": "mc", ... } ] }
      ]
    },
    "teil3": {
      "situation": "Sie lesen in einem Forum ... Für eine Frage gibt es keine passende Antwort.",
      "forumTitle": "Forum: ...",
      "questions": [ { "nr": 10, "author": "Thomas", "text": "..." }, ... 4 items, nr 10-13 ],
      "posts": [ { "key": "a", "author": "Alexandra", "text": "..." }, ... 6 items, keys a-f ],
      "answers": { "10": "c", "11": "e", "12": "x", "13": "d" },   // exactly one "x", others different
      "explain": { "10": "...", "11": "...", "12": "...", "13": "..." }
    },
    "teil4": {
      "situation": "Lesen Sie das Protokoll / den Vertrag / die Hausordnung ...",
      "doc": {
        "title": "Protokoll der Teambesprechung",
        "meta": [ ["Datum", "12. März"], ["Ort", "Raum 3.14"], ["Anwesend", "..."] ],
        "sections": [ { "heading": "TOP 1: Begrüßung", "text": "..." }, ... ]
      },
      "tasks": [ { "nr": 14, "type": "mc", "text": "...", "options": {...}, "answer": "c", "explain": "..." }, ... nr 14-18 ]
    }
  },

  "lesenSchreiben": {
    "situation": "Ihre Teamleitung leitet Ihnen diese E-Mail weiter und bittet Sie zu antworten.",
    "forward": { "from": "Name (Rolle)", "subject": "FW: ...", "body": "Internal note: what you must do in the reply (2-3 concrete points)." },
    "original": { "from": "Name, Firma", "to": "Name", "subject": "...", "body": "Customer/partner email ..." },
    "tasks": [ { "nr": 19, "type": "mc", ... }, { "nr": 20, "type": "mc", ... } ],
    "writing": {
      "nr": 21,
      "task": "Schreiben Sie eine E-Mail an ... Setzen Sie alle Punkte Ihrer Teamleitung um. Achten Sie auf angemessene Sprache (Anrede, Höflichkeit, formelle Sprache).",
      "points": [ "point 1 from the forward", "point 2", "point 3" ],
      "checklist": [ "Betreff und passende Anrede", "...", "Grußformel" ],
      "modelAnswer": "Betreff: ...\n\nSehr geehrter Herr ...,\n\n..."
    }
  },

  "hoeren": {
    "teil1": {
      "dialogues": [
        {
          "title": "Gespräch 1",
          "script": [ { "s": "Chefin", "g": "f", "t": "..." }, { "s": "Jonas", "g": "m", "t": "..." }, ... ],
          "tasks": [ { "nr": 22, "type": "rf", ... }, { "nr": 23, "type": "mc", ... } ]
        },
        { ... nr 24, 25 ... },
        { ... nr 26, 27 ... }
      ]
    },
    "teil2": {
      "topic": "Short topic of the 4 dialogues, e.g. 'Teilzeit'",
      "statements": [ { "key": "a", "text": "..." }, ... 6 items, keys a-f ],
      "dialogues": [ { "nr": 28, "script": [ ... ] }, ... 4 items, nr 28-31 ],
      "answers": { "28": "d", "29": "a", "30": "f", "31": "b" },   // 4 different letters
      "explain": { "28": "...", "29": "...", "30": "...", "31": "..." }
    },
    "teil3": {
      "title": "Topic of the presentation",
      "slides": [ "Short slide heading 1", "Heading 2", "Heading 3", "Heading 4" ],
      "script": [ { "s": "Referentin", "g": "f", "t": "..." }, { "s": "Mitarbeiter", "g": "m", "t": "Zwischenfrage ..." }, ... ],
      "tasks": [ { "nr": 32, "type": "mc", ... }, ... nr 32-35 ]
    },
    "teil4": {
      "messages": [
        { "nr": 36, "script": [ { "s": "Herr Brandt", "g": "m", "t": "..." }, ... ],
          "task": { "nr": 36, "type": "mc", "text": "Herr Brandt ...", "options": {...}, "answer": "a", "explain": "..." } },
        ... 5 items, nr 36-40
      ]
    }
  },

  "hoerenSchreiben": {
    "situation": "Sie hören eine telefonische Mitteilung. Informieren Sie Ihre Kollegin. Notieren Sie die Informationen.",
    "script": [ { "s": "Frau ...", "g": "f", "t": "..." }, ... ],
    "task41": { "nr": 41, "answer": "b", "explain": "..." },     // a Angebot, b Bestellung/Buchung, c Beschwerde
    "note": {                                                   // the correct phone note (solution)
      "anrede": "Frau",                 // "Herr" or "Frau"
      "name": "Schmidtbauer",
      "firma": "Böttcher GmbH",
      "telefon": "089 25345222",
      "infos": [ "short fact 1", "short fact 2", "short fact 3" ],   // 2-4 items
      "todo": "What the colleague must do."
    },
    "keywords": {                       // for automatic checking of the learner's notes (lower case, short)
      "name": [ "schmidtbauer" ],
      "telefon": [ "25345222" ],        // digits only
      "infos": [ "kaffeeautomat", "s 120", "2", "399" ],
      "todo": [ "bestätig", "liefertermin" ]
    }
  },

  "sprachbausteine": {
    "teil1": {
      "situation": "Lesen Sie den Text. Welche Wörter a-j passen in die Lücken 46-51? Jedes Wort nur einmal. Nicht alle Wörter passen.",
      "words": { "a": "SEITDEM", "b": "...", ... 10 items, keys a-j, UPPER CASE },
      "text": "Betreff: ...\n\nSehr geehrte ...,\n\n... {{46}} ... {{47}} ...",   // each of {{46}}..{{51}} exactly once
      "answers": { "46": "d", "47": "h", "48": "j", "49": "f", "50": "g", "51": "b" },   // 6 different letters
      "explain": { "46": "...", ... }
    },
    "teil2": {
      "situation": "Lesen Sie den Text. Welcher Ausdruck (a, b oder c) passt in die Lücken 52-57?",
      "text": "... {{52}} ... {{57}} ...",     // each of {{52}}..{{57}} exactly once
      "gaps": [ { "nr": 52, "options": { "a": "...", "b": "...", "c": "..." }, "answer": "b", "explain": "..." }, ... nr 52-57 ]
    }
  },

  "schreiben": {
    "nr": 58,
    "situation": "In Ihrer Firma gibt es ein Forum ... Schreiben Sie einen Forumsbeitrag zu Thema A oder B. Begründen Sie Ihre Meinung, nennen Sie Beispiele, gliedern Sie den Text.",
    "themes": [
      { "key": "A", "title": "...", "text": "1-2 sentences describing the plan or statement." },
      { "key": "B", "title": "...", "text": "..." }
    ],
    "checklist": [ "Einleitung mit Bezug zum Thema", "eigene Meinung mit Begründung", "...", "Schluss" ],
    "modelAnswers": { "A": "...", "B": "..." }
  },

  "sprechen": {
    "teil1": {
      "topics": [ { "title": "Beschreiben Sie ...", "hints": "(z. B. ..., ..., ...)" }, ... 4 items ],
      "examinerQuestions": [ "Follow-up question 1", ... 4-6 items ],
      "usefulPhrases": [ "...", ... 5-8 items ]
    },
    "teil2": {
      "prompts": [ "Informal question from a colleague (Du-form) ...", "second question ..." ],
      "usefulPhrases": [ "...", ... 5-8 items ]
    },
    "teil3": {
      "situation": "Sie arbeiten ... Problem ...",
      "task": "Überlegen Sie gemeinsam, wie Sie ... Sprechen Sie darüber, was zu tun ist und wer was übernimmt.",
      "points": [ "Stichpunkt 1", "Stichpunkt 2", "Stichpunkt 3", "Stichpunkt 4" ],
      "usefulPhrases": [ "...", ... 5-8 items ],
      "modelDialogue": [ { "s": "A", "g": "f", "t": "..." }, { "s": "B", "g": "m", "t": "..." }, ... 8-12 lines ]
    }
  }
}
```

Field rules the validator checks:

- `type: "rf"` tasks have `answer: true | false` and no `options`.
- `type: "mc"` tasks have `options` with exactly `a`, `b`, `c` and `answer` in `a | b | c`.
- `nr` values must match the table above.
- `explain` must be present and non-empty for every closed task (1-20, 22-41, 46-57).
