#!/usr/bin/env node
/**
 * Validate one or more Modelltest files against tools/TEST_FORMAT.md.
 *
 * Usage: node tools/validate.mjs app/tests/test01.js [more files...]
 * With no arguments, all app/tests/test*.js files are checked.
 * Exit code 1 when any file has errors.
 */
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const testsDir = path.join(here, "..", "app", "tests");

function loadTests(file) {
  const code = fs.readFileSync(file, "utf8");
  const sandbox = { window: {} };
  vm.createContext(sandbox);
  vm.runInContext(code, sandbox, { filename: file });
  return sandbox.window.DTB_TESTS || [];
}

function words(s) {
  return typeof s === "string" ? s.trim().split(/\s+/).filter(Boolean).length : 0;
}

function scriptWords(script) {
  return Array.isArray(script) ? script.reduce((n, l) => n + words(l && l.t), 0) : 0;
}

function docWords(doc) {
  if (!doc || !Array.isArray(doc.sections)) return 0;
  return doc.sections.reduce((n, s) => n + words(s.text), 0);
}

function checkTest(t) {
  const errors = [];
  const warnings = [];
  const err = (m) => errors.push(m);
  const warn = (m) => warnings.push(m);
  const mcLetters = [];
  const rfValues = [];
  const seenNr = new Set();

  const isStr = (v) => typeof v === "string" && v.trim().length > 0;
  const need = (cond, msg) => { if (!cond) err(msg); return !!cond; };
  const len = (where, n, lo, hi) => {
    if (n < lo * 0.85 || n > hi * 1.2) warn(`${where}: ${n} words (target ${lo}-${hi})`);
  };

  function markNr(nr, where) {
    if (seenNr.has(nr)) err(`${where}: task nr ${nr} used twice`);
    seenNr.add(nr);
  }

  function checkTask(task, nr, type, where) {
    if (!need(task && typeof task === "object", `${where}: task ${nr} missing`)) return;
    need(task.nr === nr, `${where}: expected nr ${nr}, got ${task.nr}`);
    markNr(nr, where);
    need(task.type === type, `${where} nr ${nr}: type must be "${type}"`);
    need(isStr(task.text), `${where} nr ${nr}: text missing`);
    need(isStr(task.explain), `${where} nr ${nr}: explain missing`);
    if (type === "rf") {
      need(typeof task.answer === "boolean", `${where} nr ${nr}: rf answer must be true/false`);
      need(task.options === undefined, `${where} nr ${nr}: rf task must not have options`);
      rfValues.push(task.answer);
    } else {
      checkOptions(task.options, `${where} nr ${nr}`);
      need(["a", "b", "c"].includes(task.answer), `${where} nr ${nr}: answer must be a/b/c`);
      mcLetters.push(task.answer);
    }
  }

  function checkOptions(opts, where) {
    if (!need(opts && typeof opts === "object", `${where}: options missing`)) return;
    const keys = Object.keys(opts).sort().join(",");
    need(keys === "a,b,c", `${where}: options must be exactly a,b,c (got ${keys})`);
    for (const k of ["a", "b", "c"]) need(isStr(opts[k]), `${where}: option ${k} empty`);
    const vals = ["a", "b", "c"].map((k) => (opts[k] || "").trim().toLowerCase());
    need(new Set(vals).size === 3, `${where}: options are not different`);
  }

  function checkScript(script, where, minLines = 1) {
    if (!need(Array.isArray(script) && script.length >= minLines, `${where}: script needs >= ${minLines} lines`)) return;
    script.forEach((l, i) => {
      need(l && isStr(l.s), `${where} line ${i + 1}: speaker "s" missing`);
      need(l && (l.g === "m" || l.g === "f"), `${where} line ${i + 1}: g must be "m" or "f"`);
      need(l && isStr(l.t), `${where} line ${i + 1}: text "t" missing`);
    });
  }

  function checkDoc(doc, where) {
    if (!need(doc && typeof doc === "object", `${where}: doc missing`)) return;
    need(isStr(doc.title), `${where}: doc.title missing`);
    need(Array.isArray(doc.meta), `${where}: doc.meta must be an array (can be empty)`);
    (doc.meta || []).forEach((m, i) => need(Array.isArray(m) && m.length === 2 && isStr(m[0]) && isStr(m[1]), `${where}: meta[${i}] must be [label, value]`));
    if (need(Array.isArray(doc.sections) && doc.sections.length > 0, `${where}: doc.sections missing`)) {
      doc.sections.forEach((s, i) => {
        need(typeof s.heading === "string", `${where}: section ${i + 1} heading must be a string (can be "")`);
        need(isStr(s.text), `${where}: section ${i + 1} text missing`);
      });
    }
  }

  function checkMatch(answers, explain, nrs, letters, where, allowX) {
    if (!need(answers && typeof answers === "object", `${where}: answers missing`)) return;
    const used = [];
    let xCount = 0;
    for (const nr of nrs) {
      markNr(nr, where);
      const a = answers[String(nr)];
      if (allowX && a === "x") { xCount++; } else {
        need(letters.includes(a), `${where}: answer for ${nr} must be one of ${letters.join("")}${allowX ? " or x" : ""}`);
        used.push(a);
      }
      need(explain && isStr(explain[String(nr)]), `${where}: explain for ${nr} missing`);
    }
    need(new Set(used).size === used.length, `${where}: an answer letter is used twice`);
    if (allowX) need(xCount === 1, `${where}: exactly one answer must be "x" (got ${xCount})`);
    need(Object.keys(answers).length === nrs.length, `${where}: answers has extra keys`);
  }

  function checkKeyed(list, keys, where, field = "text") {
    if (!need(Array.isArray(list) && list.length === keys.length, `${where}: need ${keys.length} items`)) return;
    list.forEach((it, i) => {
      need(it && it.key === keys[i], `${where} item ${i + 1}: key must be "${keys[i]}"`);
      need(it && isStr(it[field]), `${where} item ${keys[i]}: ${field} missing`);
    });
  }

  function checkGapText(text, nrs, where) {
    if (!need(isStr(text), `${where}: text missing`)) return;
    for (const nr of nrs) {
      const n = text.split(`{{${nr}}}`).length - 1;
      need(n === 1, `${where}: {{${nr}}} must appear exactly once (found ${n})`);
    }
    const all = text.match(/\{\{\d+\}\}/g) || [];
    need(all.length === nrs.length, `${where}: unexpected gap markers ${all.join(" ")}`);
  }

  const L = "abcdefghij".split("");

  need(/^mt\d\d$/.test(t.id || ""), `id must look like "mt01"`);
  need(isStr(t.title), "title missing");
  need(isStr(t.sector), "sector missing");
  need(isStr(t.summary), "summary missing");

  // ---- Lesen
  const le = t.lesen || {};
  const t1 = le.teil1 || {};
  need(isStr(t1.situation), "lesen.teil1.situation missing");
  if (need(Array.isArray(t1.persons) && t1.persons.length === 5, "lesen.teil1.persons: need 5")) {
    t1.persons.forEach((p, i) => {
      need(p.nr === i + 1, `lesen.teil1.persons[${i}] nr must be ${i + 1}`);
      need(isStr(p.text), `lesen.teil1.persons[${i}] text missing`);
      len(`lesen.teil1 person ${i + 1}`, words(p.text), 12, 25);
    });
  }
  checkKeyed(t1.texts, L.slice(0, 8), "lesen.teil1.texts");
  (t1.texts || []).forEach((x) => { need(isStr(x.title), `lesen.teil1.texts ${x.key}: title missing`); len(`lesen.teil1 text ${x.key}`, words(x.text), 40, 70); });
  checkMatch(t1.answers, t1.explain, [1, 2, 3, 4, 5], L.slice(0, 8), "lesen.teil1", false);

  const t2 = le.teil2 || {};
  need(isStr(t2.situation), "lesen.teil2.situation missing");
  if (need(Array.isArray(t2.texts) && t2.texts.length === 2, "lesen.teil2.texts: need 2")) {
    t2.texts.forEach((x, i) => {
      checkDoc(x.doc, `lesen.teil2.texts[${i}]`);
      len(`lesen.teil2 text ${i + 1}`, docWords(x.doc), 200, 280);
      const base = 6 + i * 2;
      if (need(Array.isArray(x.tasks) && x.tasks.length === 2, `lesen.teil2.texts[${i}].tasks: need 2`)) {
        checkTask(x.tasks[0], base, "rf", "lesen.teil2");
        checkTask(x.tasks[1], base + 1, "mc", "lesen.teil2");
      }
    });
  }

  const t3 = le.teil3 || {};
  need(isStr(t3.situation), "lesen.teil3.situation missing");
  need(isStr(t3.forumTitle), "lesen.teil3.forumTitle missing");
  if (need(Array.isArray(t3.questions) && t3.questions.length === 4, "lesen.teil3.questions: need 4")) {
    t3.questions.forEach((q, i) => {
      need(q.nr === 10 + i, `lesen.teil3.questions[${i}] nr must be ${10 + i}`);
      need(isStr(q.author) && isStr(q.text), `lesen.teil3.questions[${i}] author/text missing`);
      len(`lesen.teil3 question ${10 + i}`, words(q.text), 40, 70);
    });
  }
  checkKeyed(t3.posts, L.slice(0, 6), "lesen.teil3.posts");
  (t3.posts || []).forEach((p) => { need(isStr(p.author), `lesen.teil3.posts ${p.key}: author missing`); len(`lesen.teil3 post ${p.key}`, words(p.text), 40, 70); });
  checkMatch(t3.answers, t3.explain, [10, 11, 12, 13], L.slice(0, 6), "lesen.teil3", true);

  const t4 = le.teil4 || {};
  need(isStr(t4.situation), "lesen.teil4.situation missing");
  checkDoc(t4.doc, "lesen.teil4");
  len("lesen.teil4 doc", docWords(t4.doc), 380, 480);
  if (need(Array.isArray(t4.tasks) && t4.tasks.length === 5, "lesen.teil4.tasks: need 5")) {
    t4.tasks.forEach((x, i) => checkTask(x, 14 + i, "mc", "lesen.teil4"));
  }

  // ---- Lesen und Schreiben
  const ls = t.lesenSchreiben || {};
  need(isStr(ls.situation), "lesenSchreiben.situation missing");
  for (const k of ["from", "subject", "body"]) need(ls.forward && isStr(ls.forward[k]), `lesenSchreiben.forward.${k} missing`);
  for (const k of ["from", "to", "subject", "body"]) need(ls.original && isStr(ls.original[k]), `lesenSchreiben.original.${k} missing`);
  len("lesenSchreiben.original", words(ls.original && ls.original.body), 150, 220);
  if (need(Array.isArray(ls.tasks) && ls.tasks.length === 2, "lesenSchreiben.tasks: need 2")) {
    ls.tasks.forEach((x, i) => checkTask(x, 19 + i, "mc", "lesenSchreiben"));
  }
  const w = ls.writing || {};
  need(w.nr === 21, "lesenSchreiben.writing.nr must be 21");
  markNr(21, "lesenSchreiben.writing");
  need(isStr(w.task), "lesenSchreiben.writing.task missing");
  need(Array.isArray(w.points) && w.points.length >= 2, "lesenSchreiben.writing.points: need >= 2");
  need(Array.isArray(w.checklist) && w.checklist.length >= 3, "lesenSchreiben.writing.checklist: need >= 3");
  need(isStr(w.modelAnswer), "lesenSchreiben.writing.modelAnswer missing");
  len("lesenSchreiben modelAnswer", words(w.modelAnswer), 150, 220);

  // ---- Hoeren
  const h = t.hoeren || {};
  const h1 = h.teil1 || {};
  if (need(Array.isArray(h1.dialogues) && h1.dialogues.length === 3, "hoeren.teil1.dialogues: need 3")) {
    h1.dialogues.forEach((d, i) => {
      need(isStr(d.title), `hoeren.teil1.dialogues[${i}].title missing`);
      checkScript(d.script, `hoeren.teil1.dialogues[${i}]`, 4);
      len(`hoeren.teil1 dialogue ${i + 1}`, scriptWords(d.script), 200, 320);
      const base = 22 + i * 2;
      if (need(Array.isArray(d.tasks) && d.tasks.length === 2, `hoeren.teil1.dialogues[${i}].tasks: need 2`)) {
        checkTask(d.tasks[0], base, "rf", "hoeren.teil1");
        checkTask(d.tasks[1], base + 1, "mc", "hoeren.teil1");
      }
    });
  }
  const h2 = h.teil2 || {};
  need(isStr(h2.topic), "hoeren.teil2.topic missing");
  checkKeyed(h2.statements, L.slice(0, 6), "hoeren.teil2.statements");
  if (need(Array.isArray(h2.dialogues) && h2.dialogues.length === 4, "hoeren.teil2.dialogues: need 4")) {
    h2.dialogues.forEach((d, i) => {
      need(d.nr === 28 + i, `hoeren.teil2.dialogues[${i}].nr must be ${28 + i}`);
      checkScript(d.script, `hoeren.teil2.dialogues[${i}]`, 4);
      len(`hoeren.teil2 dialogue ${28 + i}`, scriptWords(d.script), 100, 170);
    });
  }
  checkMatch(h2.answers, h2.explain, [28, 29, 30, 31], L.slice(0, 6), "hoeren.teil2", false);

  const h3 = h.teil3 || {};
  need(isStr(h3.title), "hoeren.teil3.title missing");
  need(Array.isArray(h3.slides) && h3.slides.length >= 3, "hoeren.teil3.slides: need >= 3");
  checkScript(h3.script, "hoeren.teil3", 8);
  len("hoeren.teil3 presentation", scriptWords(h3.script), 550, 750);
  if (need(Array.isArray(h3.tasks) && h3.tasks.length === 4, "hoeren.teil3.tasks: need 4")) {
    h3.tasks.forEach((x, i) => checkTask(x, 32 + i, "mc", "hoeren.teil3"));
  }

  const h4 = h.teil4 || {};
  if (need(Array.isArray(h4.messages) && h4.messages.length === 5, "hoeren.teil4.messages: need 5")) {
    h4.messages.forEach((m, i) => {
      need(m.nr === 36 + i, `hoeren.teil4.messages[${i}].nr must be ${36 + i}`);
      checkScript(m.script, `hoeren.teil4.messages[${i}]`, 1);
      len(`hoeren.teil4 message ${36 + i}`, scriptWords(m.script), 60, 110);
      checkTask(m.task, 36 + i, "mc", "hoeren.teil4");
    });
  }

  // ---- Hoeren und Schreiben
  const hs = t.hoerenSchreiben || {};
  need(isStr(hs.situation), "hoerenSchreiben.situation missing");
  checkScript(hs.script, "hoerenSchreiben", 1);
  len("hoerenSchreiben message", scriptWords(hs.script), 70, 110);
  const t41 = hs.task41 || {};
  need(t41.nr === 41, "hoerenSchreiben.task41.nr must be 41");
  markNr(41, "hoerenSchreiben");
  need(["a", "b", "c"].includes(t41.answer), "hoerenSchreiben.task41.answer must be a/b/c");
  need(isStr(t41.explain), "hoerenSchreiben.task41.explain missing");
  const note = hs.note || {};
  need(note.anrede === "Herr" || note.anrede === "Frau", 'hoerenSchreiben.note.anrede must be "Herr" or "Frau"');
  for (const k of ["name", "firma", "telefon", "todo"]) need(isStr(note[k]), `hoerenSchreiben.note.${k} missing`);
  need(Array.isArray(note.infos) && note.infos.length >= 2 && note.infos.length <= 4, "hoerenSchreiben.note.infos: need 2-4");
  const kw = hs.keywords || {};
  for (const k of ["name", "telefon", "infos", "todo"]) {
    if (need(Array.isArray(kw[k]) && kw[k].length > 0, `hoerenSchreiben.keywords.${k}: need >= 1`)) {
      kw[k].forEach((s) => need(isStr(s) && s === s.toLowerCase(), `hoerenSchreiben.keywords.${k}: "${s}" must be lower case`));
    }
  }
  (kw.telefon || []).forEach((s) => need(/^\d+$/.test(s), `hoerenSchreiben.keywords.telefon: "${s}" must be digits only`));
  for (let nr = 42; nr <= 45; nr++) markNr(nr, "hoerenSchreiben");

  // ---- Sprachbausteine
  const sb = t.sprachbausteine || {};
  const s1 = sb.teil1 || {};
  need(isStr(s1.situation), "sprachbausteine.teil1.situation missing");
  if (need(s1.words && Object.keys(s1.words).join("") === "abcdefghij", "sprachbausteine.teil1.words: need keys a-j in order")) {
    const vals = Object.values(s1.words);
    vals.forEach((v) => need(isStr(v) && v === v.toUpperCase(), `sprachbausteine.teil1.words: "${v}" must be UPPER CASE`));
    need(new Set(vals).size === 10, "sprachbausteine.teil1.words: words must be different");
  }
  checkGapText(s1.text, [46, 47, 48, 49, 50, 51], "sprachbausteine.teil1");
  len("sprachbausteine.teil1 text", words(s1.text), 150, 220);
  checkMatch(s1.answers, s1.explain, [46, 47, 48, 49, 50, 51], L, "sprachbausteine.teil1", false);

  const s2 = sb.teil2 || {};
  need(isStr(s2.situation), "sprachbausteine.teil2.situation missing");
  checkGapText(s2.text, [52, 53, 54, 55, 56, 57], "sprachbausteine.teil2");
  len("sprachbausteine.teil2 text", words(s2.text), 160, 240);
  if (need(Array.isArray(s2.gaps) && s2.gaps.length === 6, "sprachbausteine.teil2.gaps: need 6")) {
    s2.gaps.forEach((g, i) => {
      const nr = 52 + i;
      need(g.nr === nr, `sprachbausteine.teil2.gaps[${i}].nr must be ${nr}`);
      markNr(nr, "sprachbausteine.teil2");
      checkOptions(g.options, `sprachbausteine.teil2 nr ${nr}`);
      need(["a", "b", "c"].includes(g.answer), `sprachbausteine.teil2 nr ${nr}: answer must be a/b/c`);
      need(isStr(g.explain), `sprachbausteine.teil2 nr ${nr}: explain missing`);
      mcLetters.push(g.answer);
    });
  }

  // ---- Schreiben
  const sc = t.schreiben || {};
  need(sc.nr === 58, "schreiben.nr must be 58");
  markNr(58, "schreiben");
  need(isStr(sc.situation), "schreiben.situation missing");
  if (need(Array.isArray(sc.themes) && sc.themes.length === 2, "schreiben.themes: need 2")) {
    sc.themes.forEach((th, i) => {
      need(th.key === ["A", "B"][i], `schreiben.themes[${i}].key must be ${["A", "B"][i]}`);
      need(isStr(th.title) && isStr(th.text), `schreiben.themes[${i}] title/text missing`);
    });
  }
  need(Array.isArray(sc.checklist) && sc.checklist.length >= 3, "schreiben.checklist: need >= 3");
  for (const k of ["A", "B"]) {
    need(sc.modelAnswers && isStr(sc.modelAnswers[k]), `schreiben.modelAnswers.${k} missing`);
    len(`schreiben modelAnswer ${k}`, words(sc.modelAnswers && sc.modelAnswers[k]), 150, 220);
  }

  // ---- Sprechen
  const sp = t.sprechen || {};
  const p1 = sp.teil1 || {};
  if (need(Array.isArray(p1.topics) && p1.topics.length === 4, "sprechen.teil1.topics: need 4")) {
    p1.topics.forEach((tp, i) => need(isStr(tp.title) && isStr(tp.hints), `sprechen.teil1.topics[${i}] title/hints missing`));
  }
  need(Array.isArray(p1.examinerQuestions) && p1.examinerQuestions.length >= 4, "sprechen.teil1.examinerQuestions: need >= 4");
  need(Array.isArray(p1.usefulPhrases) && p1.usefulPhrases.length >= 5, "sprechen.teil1.usefulPhrases: need >= 5");
  const p2 = sp.teil2 || {};
  need(Array.isArray(p2.prompts) && p2.prompts.length === 2, "sprechen.teil2.prompts: need 2");
  need(Array.isArray(p2.usefulPhrases) && p2.usefulPhrases.length >= 5, "sprechen.teil2.usefulPhrases: need >= 5");
  const p3 = sp.teil3 || {};
  need(isStr(p3.situation) && isStr(p3.task), "sprechen.teil3 situation/task missing");
  need(Array.isArray(p3.points) && p3.points.length >= 3, "sprechen.teil3.points: need >= 3");
  need(Array.isArray(p3.usefulPhrases) && p3.usefulPhrases.length >= 5, "sprechen.teil3.usefulPhrases: need >= 5");
  checkScript(p3.modelDialogue, "sprechen.teil3.modelDialogue", 8);

  // ---- Numbering and balance
  const missing = [];
  for (let nr = 1; nr <= 58; nr++) if (!seenNr.has(nr)) missing.push(nr);
  need(missing.length === 0, `task numbers missing: ${missing.join(", ")}`);

  const counts = { a: 0, b: 0, c: 0 };
  mcLetters.forEach((l) => { if (counts[l] !== undefined) counts[l]++; });
  const total = mcLetters.length || 1;
  for (const [l, n] of Object.entries(counts)) {
    if (n / total > 0.45) warn(`a/b/c balance: "${l}" is correct in ${n} of ${total} tasks (> 45 %)`);
    if (n / total < 0.2) warn(`a/b/c balance: "${l}" is correct in only ${n} of ${total} tasks (< 20 %)`);
  }
  const trues = rfValues.filter(Boolean).length;
  if (rfValues.length && (trues === 0 || trues === rfValues.length)) warn(`richtig/falsch balance: ${trues} of ${rfValues.length} are true`);

  return { errors, warnings, stats: { mc: counts, rfTrue: `${trues}/${rfValues.length}` } };
}

let files = process.argv.slice(2);
if (files.length === 0) {
  files = fs.readdirSync(testsDir).filter((f) => /^test\d\d\.js$/.test(f)).sort().map((f) => path.join(testsDir, f));
}

let failed = false;
const ids = new Map();
for (const file of files) {
  let tests;
  try {
    tests = loadTests(file);
  } catch (e) {
    console.log(`\n${file}\n  ERROR: cannot load file: ${e.message}`);
    failed = true;
    continue;
  }
  if (tests.length !== 1) {
    console.log(`\n${file}\n  ERROR: file must push exactly 1 test (pushed ${tests.length})`);
    failed = true;
    continue;
  }
  const t = tests[0];
  const { errors, warnings, stats } = checkTest(t);
  if (ids.has(t.id)) errors.push(`id "${t.id}" also used in ${ids.get(t.id)}`);
  ids.set(t.id, file);
  console.log(`\n${file}  (${t.id}, ${t.sector || "?"})`);
  console.log(`  a/b/c correct: a=${stats.mc.a} b=${stats.mc.b} c=${stats.mc.c}   richtig: ${stats.rfTrue}`);
  errors.forEach((m) => console.log(`  ERROR: ${m}`));
  warnings.forEach((m) => console.log(`  warn:  ${m}`));
  console.log(`  => ${errors.length} errors, ${warnings.length} warnings`);
  if (errors.length) failed = true;
}
process.exit(failed ? 1 : 0);
