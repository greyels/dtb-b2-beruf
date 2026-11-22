#!/usr/bin/env node
/**
 * Break repeating answer-key patterns across tests.
 *
 * For each test (seeded by its id, so the result is reproducible):
 * - a/b/c tasks: assign a balanced random sequence of correct letters and reorder the options.
 * - Lesen Teil 1 (texts a-h), Lesen Teil 3 (posts a-f), Hören Teil 2 (statements a-f):
 *   relabel the texts randomly. Lesen Teil 3 also gets a random question order.
 * Letter references in the `explain` texts are remapped with the same permutation.
 *
 * Usage: node tools/shuffle-keys.mjs [--dry] app/tests/test01.js [...]
 * Prints every changed explanation so the remapping can be reviewed.
 */
import fs from "node:fs";
import vm from "node:vm";

const args = process.argv.slice(2);
const dry = args.includes("--dry");
const files = args.filter((a) => a !== "--dry");

function rng(seedText) {
  let h = 2166136261;
  for (const c of seedText.repeat(4)) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  let state = h >>> 0;
  const next = () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let z = state;
    z = Math.imul(z ^ (z >>> 15), z | 1);
    z ^= z + Math.imul(z ^ (z >>> 7), z | 61);
    return ((z ^ (z >>> 14)) >>> 0) / 4294967296;
  };
  for (let i = 0; i < 32; i++) next();
  return next;
}

function shuffle(arr, rand) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** Replace standalone letters from `map` (old -> new) in text, skipping abbreviations like "d. h.", "u. a.". */
function remapLetters(text, map) {
  const letters = Object.keys(map).join("");
  const re = new RegExp(
    `(?<![A-Za-zÄÖÜäöüß0-9\\-])(?<![A-Za-zÄÖÜäöü]\\.\\s)(?<![A-Za-zÄÖÜäöü]\\.)([${letters}])(?![A-Za-zÄÖÜäöüß0-9\\-])(?!\\.\\s?[A-Za-zÄÖÜäöü]\\.)`,
    "g",
  );
  return text.replace(re, (m, l) => map[l]);
}

const log = [];
function note(where, before, after) {
  if (before !== after) log.push(`  ${where}\n    - ${before}\n    + ${after}`);
}

function balancedLetters(n, rand) {
  const base = [];
  for (let i = 0; i < n; i++) base.push("abc"[i % 3]);
  let seq;
  for (let tries = 0; tries < 200; tries++) {
    seq = shuffle(base, rand);
    let run = 1, ok = true;
    for (let i = 1; i < seq.length; i++) {
      run = seq[i] === seq[i - 1] ? run + 1 : 1;
      if (run > 2) { ok = false; break; }
    }
    if (ok) break;
  }
  return seq;
}

function reorderMc(task, target, rand, where) {
  const others = shuffle(["a", "b", "c"].filter((k) => k !== task.answer), rand);
  const newPos = { [task.answer]: target };
  const free = ["a", "b", "c"].filter((k) => k !== target);
  others.forEach((k, i) => { newPos[k] = free[i]; });
  const opts = {};
  for (const k of ["a", "b", "c"]) opts[newPos[k]] = task.options[k];
  task.options = { a: opts.a, b: opts.b, c: opts.c };
  task.answer = target;
  const before = task.explain;
  task.explain = remapLetters(task.explain, newPos);
  note(`${where} nr ${task.nr}`, before, task.explain);
}

function relabel(list, letters, answers, explain, rand, where, keyField = "key") {
  const perm = shuffle(letters, rand);
  const map = Object.fromEntries(letters.map((l, i) => [l, perm[i]]));
  list.forEach((item) => { item[keyField] = map[item[keyField]]; });
  list.sort((x, y) => x[keyField].localeCompare(y[keyField]));
  for (const nr of Object.keys(answers)) {
    if (answers[nr] !== "x") answers[nr] = map[answers[nr]];
    const before = explain[nr];
    explain[nr] = remapLetters(explain[nr], map);
    note(`${where} ${nr}`, before, explain[nr]);
  }
}

for (const file of files) {
  const ctx = { window: {} };
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(file, "utf8"), ctx);
  const t = JSON.parse(JSON.stringify(ctx.window.DTB_TESTS[0]));
  const rand = rng(`dtb-${t.id}-v2`);
  log.push(`\n${file} (${t.id})`);

  const mc = [
    ...t.lesen.teil2.texts.flatMap((x) => x.tasks),
    ...t.lesen.teil4.tasks,
    ...t.lesenSchreiben.tasks,
    ...t.hoeren.teil1.dialogues.flatMap((d) => d.tasks),
    ...t.hoeren.teil3.tasks,
    ...t.hoeren.teil4.messages.map((m) => m.task),
    ...t.sprachbausteine.teil2.gaps,
  ].filter((x) => x.type !== "rf");
  const targets = balancedLetters(mc.length, rand);
  mc.forEach((task, i) => reorderMc(task, targets[i], rand, "mc"));

  const l1 = t.lesen.teil1;
  relabel(l1.texts, "abcdefgh".split(""), l1.answers, l1.explain, rand, "lesen1");

  const l3 = t.lesen.teil3;
  relabel(l3.posts, "abcdef".split(""), l3.answers, l3.explain, rand, "lesen3");
  const order = shuffle([0, 1, 2, 3], rand);
  const oldQ = l3.questions.slice();
  const oldA = { ...l3.answers };
  const oldE = { ...l3.explain };
  l3.questions = order.map((i, pos) => ({ ...oldQ[i], nr: 10 + pos }));
  l3.answers = {};
  l3.explain = {};
  order.forEach((i, pos) => {
    l3.answers[10 + pos] = oldA[oldQ[i].nr];
    l3.explain[10 + pos] = oldE[oldQ[i].nr];
  });

  const h2 = t.hoeren.teil2;
  relabel(h2.statements, "abcdef".split(""), h2.answers, h2.explain, rand, "hoeren2");

  if (!dry) {
    fs.writeFileSync(file, `window.DTB_TESTS = window.DTB_TESTS || [];\nwindow.DTB_TESTS.push(${JSON.stringify(t, null, 2)});\n`);
  }
}
console.log(log.join("\n"));
