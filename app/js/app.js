/**
 * DTB B2 Beruf training app: routing, rendering of all exam parts, scoring and local storage.
 * Test data comes from tests/testNN.js (window.DTB_TESTS), see tools/TEST_FORMAT.md.
 */
(() => {
  "use strict";

  // ------------------------------------------------------------------ helpers

  const $ = (sel, root = document) => root.querySelector(sel);

  function el(tag, attrs, ...kids) {
    const node = document.createElement(tag);
    if (attrs) {
      for (const [k, v] of Object.entries(attrs)) {
        if (v === undefined || v === null || v === false) continue;
        if (k === "class") node.className = v;
        else if (k === "text") node.textContent = v;
        else if (k === "on") for (const [ev, fn] of Object.entries(v)) node.addEventListener(ev, fn);
        else if (k === "dataset") Object.assign(node.dataset, v);
        else if (["value", "checked", "disabled", "hidden", "selected", "open"].includes(k)) node[k] = v;
        else node.setAttribute(k, v === true ? "" : v);
      }
    }
    for (const kid of kids.flat(Infinity)) {
      if (kid === undefined || kid === null || kid === false) continue;
      node.append(kid instanceof Node ? kid : document.createTextNode(String(kid)));
    }
    return node;
  }

  /** Plain text with \n\n paragraphs and \n line breaks -> <p> elements. */
  function paras(text, cls) {
    const frag = el("div", { class: cls || "paras" });
    String(text || "").split(/\n{2,}/).forEach((block) => {
      const p = el("p");
      block.split("\n").forEach((line, i) => { if (i) p.append(el("br")); p.append(line); });
      frag.append(p);
    });
    return frag;
  }

  const words = (s) => (String(s || "").trim().match(/\S+/g) || []).length;
  const fmtTime = (sec) => {
    const s = Math.max(0, Math.round(Math.abs(sec)));
    return `${sec < 0 ? "-" : ""}${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
  };
  const norm = (s) => String(s || "").toLowerCase()
    .replace(/ä/g, "ae").replace(/ö/g, "oe").replace(/ü/g, "ue").replace(/ß/g, "ss")
    .replace(/[^a-z0-9]/g, "");
  const digits = (s) => String(s || "").replace(/\D/g, "");
  const shuffle = (a) => a.map((v) => [Math.random(), v]).sort((x, y) => x[0] - y[0]).map((x) => x[1]);

  // ------------------------------------------------------------------ storage

  const STORE_KEY = "dtb-b2-beruf.v1";

  function loadStore() {
    try { return JSON.parse(localStorage.getItem(STORE_KEY)) || {}; } catch { return {}; }
  }
  let store = loadStore();
  store.settings = Object.assign({ mode: "practice", voiceF: "", voiceM: "", rate: 0.95 }, store.settings || {});
  store.tests = store.tests || {};

  let saveTimer = null;
  function save(now) {
    clearTimeout(saveTimer);
    const write = () => { try { localStorage.setItem(STORE_KEY, JSON.stringify(store)); } catch { /* storage full or blocked */ } };
    if (now) write(); else saveTimer = setTimeout(write, 250);
  }
  try { localStorage.removeItem("dtb-b2-beruf.apiKey"); } catch { /* storage blocked */ }

  function testState(id) {
    const s = store.tests[id] = store.tests[id] || {};
    for (const k of ["answers", "checked", "writing", "notes", "played", "timers", "speaking"]) s[k] = s[k] || {};
    return s;
  }

  Speech.configure({ voiceF: store.settings.voiceF, voiceM: store.settings.voiceM, rate: Number(store.settings.rate) || 0.95 });

  // ------------------------------------------------------------------ exam structure

  const BLOCKS = [
    { id: "lesen", title: "Lesen", minutes: 45, parts: [["lesen1", "Lesen Teil 1"], ["lesen2", "Lesen Teil 2"], ["lesen3", "Lesen Teil 3"], ["lesen4", "Lesen Teil 4"]] },
    { id: "ls", title: "Lesen und Schreiben", minutes: 20, parts: [["ls", "Aufgaben 19-21"]] },
    { id: "hoeren", title: "Hören", minutes: 0, parts: [["hoeren1", "Hören Teil 1"], ["hoeren2", "Hören Teil 2"], ["hoeren3", "Hören Teil 3"], ["hoeren4", "Hören Teil 4"]] },
    { id: "hs", title: "Hören und Schreiben", minutes: 5, parts: [["hs", "Telefonnotiz 41-45"]] },
    { id: "sb", title: "Sprachbausteine und Schreiben", minutes: 35, parts: [["sb1", "Sprachbausteine Teil 1"], ["sb2", "Sprachbausteine Teil 2"], ["schreiben", "Schreiben 58"]] },
    { id: "sprechen", title: "Sprechen", minutes: 0, parts: [["sp1", "Sprechen Teil 1"], ["sp2", "Sprechen Teil 2"], ["sp3", "Sprechen Teil 3"]] },
  ];
  const PART_ORDER = BLOCKS.flatMap((b) => b.parts.map((p) => p[0]));
  const PART_TITLE = Object.fromEntries(BLOCKS.flatMap((b) => b.parts));
  const BLOCK_OF = Object.fromEntries(BLOCKS.flatMap((b) => b.parts.map((p) => [p[0], b])));
  const LETTERS = "abcdefghij".split("");

  /**
   * Official DTB B2 points per part: [label, Fertigkeit, calculation, max points].
   * Source: telc Übungstest 1 Deutsch-Test für den Beruf B2 (2020), "Punkte und Gewichtung".
   */
  const POINTS = {
    lesen1: [["Aufgaben 1-5", "Lesen", "5 × 3", 15]],
    lesen2: [["Aufgaben 6-9", "Lesen", "4 × 3", 12]],
    lesen3: [["Aufgaben 10-13", "Lesen", "4 × 3", 12]],
    lesen4: [["Aufgaben 14-18", "Lesen", "5 × 3", 15]],
    ls: [["Aufgaben 19-20", "Lesen", "2 × 3", 6], ["Aufgabe 21 (E-Mail)", "Schreiben", "Kriterium I", 7]],
    hoeren1: [["Aufgaben 22-27", "Hören", "6 × 3", 18]],
    hoeren2: [["Aufgaben 28-31", "Hören", "4 × 3", 12]],
    hoeren3: [["Aufgaben 32-35", "Hören", "4 × 3", 12]],
    hoeren4: [["Aufgaben 36-40", "Hören", "5 × 3", 15]],
    hs: [["Aufgabe 41", "Hören", "1 × 3", 3], ["Aufgaben 42-45 (Notiz)", "Schreiben", "42 und 43: je 0,5 · 44: 4 · 45: 1", 6]],
    sb1: [["Aufgaben 46-51", "Schreiben", "6 × 0,5", 3]],
    sb2: [["Aufgaben 52-57", "Schreiben", "6 × 0,5", 3]],
    schreiben: [["Aufgabe 58 (Forumsbeitrag)", "Schreiben", "Kriterium I", 14]],
    sp1: [["Teil 1A: Über ein Thema sprechen", "Sprechen", "Kriterium I", 5], ["Teil 1B: Prüferfragen", "Sprechen", "Kriterium I", 5], ["Teil 1C: Erläuterung eines Aspekts", "Sprechen", "Kriterium I", 2]],
    sp2: [["Teil 2: Mit Kolleginnen und Kollegen sprechen", "Sprechen", "Kriterium I", 8]],
    sp3: [["Teil 3: Lösungswege diskutieren", "Sprechen", "Kriterium I", 10]],
  };
  const CRITERIA_NOTE = {
    Schreiben: "Dazu kommen für den ganzen Subtest Schreiben 27 Punkte für die Texte 21 und 58: Kriterium II Kommunikative Gestaltung, III Formale Richtigkeit, IV Spektrum sprachlicher Mittel (je 9 Punkte).",
    Sprechen: "Dazu kommen für den ganzen Subtest Sprechen 30 Punkte: Kriterium II Aussprache/Intonation, III Formale Richtigkeit, IV Spektrum sprachlicher Mittel (je 10 Punkte).",
  };
  const ITEM_POINTS = (nr) => (nr <= 41 ? 3 : 0.5);
  const NOTE_POINTS = { 42: 0.5, 43: 0.5, 44: 4, 45: 1 };
  const fmtPts = (n) => String(Math.round(n * 10) / 10).replace(".", ",");

  /** Closed items of a part: { nr, answer, explain } (answer: letter, "x" or boolean). */
  function partItems(t, pid) {
    const fromTasks = (tasks) => tasks.map((x) => ({ nr: x.nr, answer: x.answer, explain: x.explain }));
    const fromMatch = (nrs, answers, explain) => nrs.map((nr) => ({ nr, answer: answers[nr], explain: explain[nr] }));
    switch (pid) {
      case "lesen1": return fromMatch([1, 2, 3, 4, 5], t.lesen.teil1.answers, t.lesen.teil1.explain);
      case "lesen2": return fromTasks(t.lesen.teil2.texts.flatMap((x) => x.tasks));
      case "lesen3": return fromMatch([10, 11, 12, 13], t.lesen.teil3.answers, t.lesen.teil3.explain);
      case "lesen4": return fromTasks(t.lesen.teil4.tasks);
      case "ls": return fromTasks(t.lesenSchreiben.tasks);
      case "hoeren1": return fromTasks(t.hoeren.teil1.dialogues.flatMap((d) => d.tasks));
      case "hoeren2": return fromMatch([28, 29, 30, 31], t.hoeren.teil2.answers, t.hoeren.teil2.explain);
      case "hoeren3": return fromTasks(t.hoeren.teil3.tasks);
      case "hoeren4": return fromTasks(t.hoeren.teil4.messages.map((m) => m.task));
      case "hs": return [{ nr: 41, answer: t.hoerenSchreiben.task41.answer, explain: t.hoerenSchreiben.task41.explain }];
      case "sb1": return fromMatch([46, 47, 48, 49, 50, 51], t.sprachbausteine.teil1.answers, t.sprachbausteine.teil1.explain);
      case "sb2": return fromTasks(t.sprachbausteine.teil2.gaps);
      default: return [];
    }
  }
  const isRight = (item, given) => given !== undefined && given !== null && given !== "" && String(given) === String(item.answer);

  /** Phone note 42-45, checked against the keywords of the test. */
  function gradeNotes(hs, notes) {
    const has = (text, kws) => kws.filter((k) => norm(text).includes(norm(k))).length;
    const kw = hs.keywords;
    const infos = [1, 2, 3, 4].map((i) => notes["info" + i] || "").join(" ");
    return {
      42: has(`${notes.name || ""} ${notes.firma || ""}`, kw.name) > 0,
      43: kw.telefon.some((k) => digits(notes.telefon).includes(k)),
      44: has(infos, kw.infos) >= Math.ceil(kw.infos.length / 2),
      45: has(notes.todo, kw.todo) >= Math.ceil(kw.todo.length / 2),
    };
  }

  // ------------------------------------------------------------------ state per view

  let TESTS = [];
  const byId = (id) => TESTS.find((t) => t.id === id);
  let view = { testId: null, pid: null };
  let timerHandle = null;

  const mode = () => store.settings.mode;

  function ctxFor(t, pid) {
    const st = testState(t.id);
    const block = BLOCK_OF[pid];
    const revealed = !!st.finished || (mode() === "practice" && !!st.checked[pid]);
    return { t, st, pid, block, revealed, locked: revealed, exam: mode() === "exam" };
  }

  // ------------------------------------------------------------------ closed-task widgets

  function setAnswer(ctx, nr, value) {
    ctx.st.answers[nr] = value;
    save();
    updateNav(ctx.t);
  }

  function explainBox(item, given, solutionLabel) {
    const ok = isRight(item, given);
    return el("div", { class: "explain" },
      el("span", { class: "sol" }, ok ? "Richtig. " : `Lösung: ${solutionLabel}. `),
      item.explain || "");
  }

  function taskShell(ctx, item, ...body) {
    const given = ctx.st.answers[item.nr];
    const cls = ["task", ctx.revealed ? (isRight(item, given) ? "correct" : "wrong") : ""].join(" ");
    return el("div", { class: cls, id: `task-${item.nr}` }, ...body);
  }

  function mcTask(ctx, task, opts = {}) {
    const given = ctx.st.answers[task.nr];
    const item = { nr: task.nr, answer: task.answer, explain: task.explain };
    const options = el("div", { class: "options" });
    for (const k of ["a", "b", "c"]) {
      const right = ctx.revealed && k === task.answer;
      const wrong = ctx.revealed && k === given && k !== task.answer;
      options.append(el("label", { class: `opt${right ? " is-right" : ""}${wrong ? " is-wrong" : ""}` },
        el("input", {
          type: "radio", name: `${ctx.t.id}-q${task.nr}`, value: k, checked: given === k, disabled: ctx.locked,
          on: { change: () => setAnswer(ctx, task.nr, k) },
        }),
        el("span", { class: "letter" }, k),
        el("span", null, opts.optionText ? opts.optionText(k) : task.options[k])));
    }
    return taskShell(ctx, item,
      el("div", { class: "q" }, el("span", { class: "nr" }, task.nr), el("div", null, opts.stem ?? task.text)),
      options,
      ctx.revealed && explainBox(item, given, task.answer));
  }

  function rfTask(ctx, task) {
    const given = ctx.st.answers[task.nr];
    const item = { nr: task.nr, answer: task.answer, explain: task.explain };
    const row = el("div", { class: "rf" });
    for (const [val, label] of [[true, "richtig"], [false, "falsch"]]) {
      const right = ctx.revealed && val === task.answer;
      const wrong = ctx.revealed && given === val && val !== task.answer;
      row.append(el("label", { class: `opt${right ? " is-right" : ""}${wrong ? " is-wrong" : ""}` },
        el("input", {
          type: "radio", name: `${ctx.t.id}-q${task.nr}`, checked: given === val, disabled: ctx.locked,
          on: { change: () => setAnswer(ctx, task.nr, val) },
        }),
        el("span", null, label)));
    }
    return taskShell(ctx, item,
      el("div", { class: "q" }, el("span", { class: "nr" }, task.nr), el("div", null, task.text, " ", el("em", { class: "note" }, "(richtig/falsch?)"))),
      row,
      ctx.revealed && explainBox(item, given, task.answer ? "richtig" : "falsch"));
  }

  function anyTask(ctx, task) { return task.type === "rf" ? rfTask(ctx, task) : mcTask(ctx, task); }

  function matchSelect(ctx, nr, letters, labelFor) {
    const given = ctx.st.answers[nr];
    return el("select", {
      "aria-label": `Lösung für ${nr}`, disabled: ctx.locked,
      on: { change: (e) => setAnswer(ctx, nr, e.target.value) },
    },
    el("option", { value: "", text: "–" }),
    letters.map((l) => el("option", { value: l, selected: given === l, text: labelFor ? labelFor(l) : l })));
  }

  function matchTask(ctx, item, letters, content) {
    const given = ctx.st.answers[item.nr];
    return taskShell(ctx, item,
      el("div", { class: "q" }, el("span", { class: "nr" }, item.nr),
        el("div", { class: "match-row" }, el("div", { style: "flex:1;min-width:200px" }, content), matchSelect(ctx, item.nr, letters))),
      ctx.revealed && explainBox(item, given, item.answer));
  }

  // ------------------------------------------------------------------ text widgets

  function docView(doc) {
    const box = el("div", { class: "panel doc" }, el("h3", null, doc.title));
    if (doc.meta && doc.meta.length) {
      box.append(el("dl", { class: "doc-meta" }, doc.meta.map(([k, v]) => [el("dt", null, k), el("dd", null, v)])));
    }
    doc.sections.forEach((s) => box.append(el("div", { class: "sec" }, s.heading ? el("h4", null, s.heading) : null, paras(s.text))));
    return box;
  }

  function emailView(mail, label) {
    const rows = [["Von", mail.from]];
    if (mail.to) rows.push(["An", mail.to]);
    rows.push(["Betreff", mail.subject]);
    return el("div", { class: "panel email" },
      label ? el("div", { class: "note" }, label) : null,
      el("dl", { class: "hdr" }, rows.map(([k, v]) => [el("dt", null, k + ":"), el("dd", null, v)])),
      el("div", { class: "body" }, mail.body));
  }

  // ------------------------------------------------------------------ audio player

  let activePlayer = null;

  function audioPlayer(ctx, script, key, opts = {}) {
    const once = ctx.exam && !ctx.revealed;
    const box = el("div");
    const status = el("span", { class: "status" }, "bereit");
    const barFill = el("span");
    const bar = el("div", { class: "bar" }, barFill);
    const btnPlay = el("button", { class: "btn btn-primary btn-small", type: "button" }, "▶ Abspielen");
    const btnPause = el("button", { class: "btn btn-small", type: "button", hidden: once }, "Pause");
    const btnStop = el("button", { class: "btn btn-small", type: "button", hidden: once }, "Stopp");
    const allowText = ctx.revealed || !!opts.allowTranscript;
    const showTranscript = allowText && (opts.transcriptOpen ?? ctx.revealed);
    const lines = script.map((l) => el("p", { class: "line" }, el("span", { class: "sp" }, `${l.s}: `), l.t));
    const transcript = el("div", { class: "transcript panel muted", hidden: !showTranscript }, lines);
    const btnText = el("button", { class: "btn btn-small", type: "button", hidden: !allowText },
      showTranscript ? "Transkript ausblenden" : "Transkript zeigen");

    let player = null;
    const total = script.length;
    const mark = (i) => {
      lines.forEach((ln, j) => ln.classList.toggle("current", j === i));
      barFill.style.width = `${Math.round((i / Math.max(1, total)) * 100)}%`;
    };
    const used = () => once && ctx.st.played[key];
    const refresh = (state) => {
      if (state === "playing") { status.textContent = `läuft ... (${Math.min(player.index + 1, total)}/${total})`; btnPause.textContent = "Pause"; }
      if (state === "paused") { status.textContent = "pausiert"; btnPause.textContent = "Weiter"; }
      if (state === "ended") { status.textContent = "Ende"; barFill.style.width = "100%"; mark(-1); }
      if (state === "stopped") { status.textContent = "gestoppt"; mark(-1); }
      if (state === "error") status.textContent = "Fehler bei der Sprachausgabe";
      btnPlay.disabled = state === "playing" || state === "paused" || used();
      if (used() && state !== "playing" && state !== "paused") status.textContent = "Im Prüfungsmodus nur einmal hörbar. Schon gehört.";
    };

    btnPlay.addEventListener("click", () => {
      if (activePlayer && activePlayer !== player) activePlayer.stop();
      if (!player) player = Speech.createPlayer({ onLine: mark, onState: refresh });
      activePlayer = player;
      if (once) { ctx.st.played[key] = true; save(); }
      player.play(script);
    });
    btnPause.addEventListener("click", () => {
      if (!player) return;
      if (player.state === "playing") player.pause(); else if (player.state === "paused") player.resume();
    });
    btnStop.addEventListener("click", () => player && player.stop());
    btnText.addEventListener("click", () => {
      transcript.hidden = !transcript.hidden;
      btnText.textContent = transcript.hidden ? "Transkript zeigen" : "Transkript ausblenden";
    });

    if (used()) { btnPlay.disabled = true; status.textContent = "Im Prüfungsmodus nur einmal hörbar. Schon gehört."; }
    if (!Speech.available || Speech.voices().length === 0) {
      box.append(el("div", { class: "warnbox" }, "Keine deutsche Stimme gefunden. Bitte Chrome oder Edge verwenden oder eine deutsche Stimme im Betriebssystem installieren. Sie können das Transkript lesen."));
      btnText.hidden = false;
    }
    box.append(el("div", { class: "player" }, btnPlay, btnPause, btnStop, bar, status, btnText), transcript);
    return box;
  }

  // ------------------------------------------------------------------ writing

  function writingArea(ctx, key, placeholder) {
    const count = el("span", { class: "wordcount" });
    const ta = el("textarea", { class: "write", placeholder, spellcheck: "false", lang: "de" });
    ta.value = ctx.st.writing[key] || "";
    const upd = () => { count.textContent = `${words(ta.value)} Wörter (Ziel: ca. 150)`; };
    ta.addEventListener("input", () => { ctx.st.writing[key] = ta.value; upd(); save(); });
    upd();
    return { ta, node: el("div", null, ta, count) };
  }

  // ------------------------------------------------------------------ speaking helpers

  function countdown(label, seconds) {
    const out = el("span", { class: "timer" }, fmtTime(seconds));
    const btn = el("button", { class: "btn btn-small", type: "button" }, `${label} starten`);
    let h = null;
    btn.addEventListener("click", () => {
      if (h) { clearInterval(h); h = null; btn.textContent = `${label} starten`; out.textContent = fmtTime(seconds); out.classList.remove("low"); return; }
      const end = Date.now() + seconds * 1000;
      btn.textContent = "Zurücksetzen";
      h = setInterval(() => {
        const left = (end - Date.now()) / 1000;
        out.textContent = fmtTime(left);
        out.classList.toggle("low", left < 15);
        if (left <= 0) { clearInterval(h); h = null; out.textContent = "Zeit um"; btn.textContent = `${label} starten`; }
      }, 250);
    });
    return el("span", { class: "rec" }, btn, out);
  }

  const SpeechRec = window.SpeechRecognition || window.webkitSpeechRecognition || null;

  /** Record audio (for listening back) and transcribe live into the textarea, where supported. */
  function recorder(ctx, key, ta) {
    const box = el("div", { class: "panel muted" });
    const btn = el("button", { class: "btn btn-primary", type: "button" }, "● Aufnahme starten");
    const state = el("span", { class: "note" });
    const audioOut = el("div");
    let media = null, chunks = [], rec = null, running = false, stream = null;

    async function start() {
      running = true;
      btn.textContent = "■ Aufnahme stoppen";
      state.replaceChildren(el("span", { class: "dot" }), " Aufnahme läuft");
      try {
        if (navigator.mediaDevices && window.MediaRecorder) {
          stream = await navigator.mediaDevices.getUserMedia({ audio: true });
          media = new MediaRecorder(stream);
          chunks = [];
          media.ondataavailable = (e) => e.data.size && chunks.push(e.data);
          media.onstop = () => {
            const url = URL.createObjectURL(new Blob(chunks, { type: media.mimeType || "audio/webm" }));
            audioOut.replaceChildren(el("p", { class: "note", style: "margin:8px 0 4px" }, "Ihre Aufnahme (nur in diesem Fenster, wird nicht gespeichert):"), el("audio", { controls: true, src: url }));
            stream.getTracks().forEach((tr) => tr.stop());
          };
          media.start();
        }
      } catch {
        state.textContent = "Kein Mikrofonzugriff. Sie können Ihre Antwort auch tippen.";
      }
      if (SpeechRec) {
        rec = new SpeechRec();
        rec.lang = "de-DE";
        rec.continuous = true;
        rec.interimResults = false;
        rec.onresult = (e) => {
          for (let i = e.resultIndex; i < e.results.length; i++) {
            if (e.results[i].isFinal) {
              const add = e.results[i][0].transcript.trim();
              ta.value = (ta.value.trim() ? ta.value.trim() + " " : "") + add;
              ctx.st.speaking[key] = ta.value;
              ta.dispatchEvent(new Event("input"));
            }
          }
        };
        rec.onend = () => { if (running) { try { rec.start(); } catch { /* already started */ } } };
        try { rec.start(); } catch { /* ignore */ }
      }
    }
    function stop() {
      running = false;
      btn.textContent = "● Aufnahme starten";
      state.textContent = "";
      if (media && media.state !== "inactive") media.stop();
      if (rec) { try { rec.stop(); } catch { /* ignore */ } }
    }
    btn.addEventListener("click", () => (running ? stop() : start()));
    cleanupFns.push(() => running && stop());

    box.append(
      el("div", { class: "rec" }, btn, state),
      el("p", { class: "note", style: "margin:8px 0 0" }, SpeechRec
        ? "Live-Transkription: Chrome/Edge schickt das Audio dafür an den Spracherkennungsdienst des Browsers. Sie können den Text danach korrigieren oder ganz tippen."
        : "Live-Transkription gibt es in diesem Browser nicht (nur Chrome/Edge). Sie können Ihre Antwort auch tippen."),
      audioOut);
    return box;
  }

  function speakingAnswer(ctx, key) {
    const ta = el("textarea", { class: "write", style: "min-height:160px", placeholder: "Transkription Ihrer Antwort (automatisch beim Aufnehmen oder selbst tippen)", lang: "de" });
    ta.value = ctx.st.speaking[key] || "";
    const count = el("span", { class: "wordcount" });
    const upd = () => { count.textContent = `${words(ta.value)} Wörter`; };
    ta.addEventListener("input", () => { ctx.st.speaking[key] = ta.value; upd(); save(); });
    upd();
    return el("div", null,
      el("h3", { style: "margin-top:18px" }, "Ihre Antwort"),
      recorder(ctx, key, ta),
      ta, count);
  }

  function phrases(list) {
    return el("details", null, el("summary", null, "Nützliche Redemittel"), el("ul", { class: "phrases" }, list.map((p) => el("li", null, p))));
  }

  // ------------------------------------------------------------------ part renderers

  const RENDER = {
    lesen1(ctx) {
      const p = ctx.t.lesen.teil1;
      return [
        el("div", { class: "instruction" }, paras(p.situation)),
        el("div", { class: "split" },
          el("div", { class: "textlist" }, p.texts.map((x) => el("div", { class: "item" },
            el("span", { class: "key" }, x.key), el("h4", null, x.title), el("p", null, x.text)))),
          el("div", { class: "panel sticky" }, el("h3", null, "Personen 1-5"),
            p.persons.map((pe) => matchTask(ctx, { nr: pe.nr, answer: p.answers[pe.nr], explain: p.explain[pe.nr] }, LETTERS.slice(0, 8), pe.text)))),
      ];
    },
    lesen2(ctx) {
      const p = ctx.t.lesen.teil2;
      return [
        el("div", { class: "instruction" }, paras(p.situation)),
        p.texts.map((x, i) => el("div", { class: "split", style: "margin-bottom:22px" },
          el("div", null, el("div", { class: "note" }, `Text ${i + 1}`), docView(x.doc)),
          el("div", { class: "panel sticky" }, x.tasks.map((task) => anyTask(ctx, task))))),
      ];
    },
    lesen3(ctx) {
      const p = ctx.t.lesen.teil3;
      return [
        el("div", { class: "instruction" }, paras(p.situation)),
        el("div", { class: "split" },
          el("div", null,
            el("h3", null, p.forumTitle),
            el("div", { class: "panel" }, el("h3", null, "Fragen 10-13"), p.questions.map((q) =>
              matchTask(ctx, { nr: q.nr, answer: p.answers[q.nr], explain: p.explain[q.nr] }, [...LETTERS.slice(0, 6), "x"],
                el("div", { class: "post" }, el("span", { class: "author" }, q.author), el("p", null, q.text)))))),
          el("div", { class: "sticky" }, el("h3", null, "Antworten a-f"),
            el("div", { class: "textlist" }, p.posts.map((x) => el("div", { class: "item post" },
              el("span", { class: "key" }, x.key), el("span", { class: "author" }, x.author), el("p", null, x.text)))),
            el("p", { class: "note", style: "margin-top:8px" }, "x = Für diese Frage gibt es keine passende Antwort."))),
      ];
    },
    lesen4(ctx) {
      const p = ctx.t.lesen.teil4;
      return [
        el("div", { class: "instruction" }, paras(p.situation)),
        el("div", { class: "split" }, el("div", null, docView(p.doc)), el("div", { class: "panel sticky" }, p.tasks.map((task) => anyTask(ctx, task)))),
      ];
    },
    ls(ctx) {
      const p = ctx.t.lesenSchreiben;
      const w = p.writing;
      const area = writingArea(ctx, "21", "Betreff: ...\n\nSehr geehrte/r ...");
      return [
        el("div", { class: "instruction" }, paras(p.situation)),
        el("div", { class: "split" },
          el("div", null, emailView(p.forward, "Weitergeleitet"), emailView(p.original, "Ursprüngliche Nachricht")),
          el("div", { class: "panel sticky" }, p.tasks.map((task) => anyTask(ctx, task)))),
        el("div", { class: "panel" },
          el("h3", null, "21  Schreiben Sie eine E-Mail"),
          paras(w.task),
          el("ul", { class: "checklist" }, w.points.map((x) => el("li", null, x))),
          area.node,
          el("details", null, el("summary", null, "Checkliste"), el("ul", { class: "checklist" }, w.checklist.map((x) => el("li", null, x)))),
          ctx.revealed ? el("details", null, el("summary", null, "Musterlösung"), el("div", { class: "model" }, w.modelAnswer))
            : el("p", { class: "note" }, "Die Musterlösung sehen Sie am Ende des Tests.")),
      ];
    },
    hoeren1(ctx) {
      const p = ctx.t.hoeren.teil1;
      return [
        el("div", { class: "instruction" }, el("p", null, "Sie hören drei Gespräche. Zu jedem Gespräch gibt es zwei Aufgaben. Ist die Aussage richtig oder falsch und welche Antwort (a, b oder c) passt am besten? Sie hören jedes Gespräch einmal.")),
        p.dialogues.map((d, i) => el("div", { class: "panel" },
          el("h3", null, d.title || `Gespräch ${i + 1}`),
          el("div", { class: "note" }, "Lesen Sie zuerst die Aufgaben, dann starten Sie das Gespräch."),
          d.tasks.map((task) => anyTask(ctx, task)),
          audioPlayer(ctx, d.script, `h1-${i}`))),
      ];
    },
    hoeren2(ctx) {
      const p = ctx.t.hoeren.teil2;
      return [
        el("div", { class: "instruction" }, el("p", null, `Sie hören vier Gespräche zum Thema „${p.topic}“. Welcher Satz a-f passt am besten zu welchem Gespräch? Zwei Sätze passen nicht. Lesen Sie zuerst die Sätze (ca. 1 Minute).`)),
        el("div", { class: "split" },
          el("div", null, p.dialogues.map((d) => el("div", { class: "panel" },
            matchTask(ctx, { nr: d.nr, answer: p.answers[d.nr], explain: p.explain[d.nr] }, LETTERS.slice(0, 6), el("strong", null, `Gespräch ${d.nr}`)),
            audioPlayer(ctx, d.script, `h2-${d.nr}`)))),
          el("div", { class: "sticky" }, el("div", { class: "textlist" }, p.statements.map((s) => el("div", { class: "item" }, el("span", { class: "key" }, s.key), s.text))))),
      ];
    },
    hoeren3(ctx) {
      const p = ctx.t.hoeren.teil3;
      return [
        el("div", { class: "instruction" }, el("p", null, "Sie hören eine Präsentation. Dazu gibt es vier Aufgaben. Welche Lösung (a, b oder c) passt am besten? Lesen Sie zuerst die Aufgaben (ca. 1 Minute). Sie hören die Präsentation einmal.")),
        el("div", { class: "panel" },
          el("h3", null, p.title),
          el("div", { class: "slides" }, p.slides.map((s) => el("span", null, s))),
          p.tasks.map((task) => anyTask(ctx, task)),
          audioPlayer(ctx, p.script, "h3")),
      ];
    },
    hoeren4(ctx) {
      const p = ctx.t.hoeren.teil4;
      return [
        el("div", { class: "instruction" }, el("p", null, "Sie hören fünf telefonische Mitteilungen. Zu jeder Mitteilung gibt es eine Aufgabe. Welche Lösung (a, b oder c) passt am besten? Sie hören jede Mitteilung einmal.")),
        p.messages.map((m) => el("div", { class: "panel" }, anyTask(ctx, m.task), audioPlayer(ctx, m.script, `h4-${m.nr}`))),
      ];
    },
    hs(ctx) {
      const p = ctx.t.hoerenSchreiben;
      const n = ctx.st.notes;
      const graded = ctx.revealed ? gradeNotes(p, n) : null;
      const setNote = (k) => (e) => { n[k] = e.target.value; save(); updateNav(ctx.t); };
      const input = (k, ph) => el("input", { class: "line", type: "text", value: n[k] || "", placeholder: ph || "", disabled: ctx.locked, on: { input: setNote(k) } });
      const res = (nr, label) => graded ? el("div", { class: `res scoreline ${graded[nr] ? "good" : "bad"}` }, `${nr}: ${graded[nr] ? "erkannt" : "nicht vollständig"} (${label})`) : null;
      const t41 = { nr: 41, type: "mc", text: "Grund für den Anruf", options: { a: "Angebot", b: "Bestellung/Buchung", c: "Beschwerde" }, answer: p.task41.answer, explain: p.task41.explain };
      const sol = p.note;
      return [
        el("div", { class: "instruction" }, paras(p.situation)),
        el("div", { class: "panel" }, audioPlayer(ctx, p.script, "hs")),
        el("div", { class: "panel" },
          el("h3", null, "Telefonnotiz"),
          mcTask(ctx, t41),
          el("div", { class: "phonenote", style: "margin-top:12px" },
            el("div", { class: "row" }, el("label", null, "42  Name / Firma"),
              el("div", null, el("div", { class: "inline" },
                el("select", { disabled: ctx.locked, on: { change: setNote("anrede") } }, ["", "Herr", "Frau"].map((v) => el("option", { value: v, selected: (n.anrede || "") === v, text: v || "–" }))),
                input("name", "Name"), input("firma", "Firma")), res(42, "Name"))),
            el("div", { class: "row" }, el("label", null, "43  Kontakt / Telefon"), el("div", null, input("telefon", "Telefonnummer"), res(43, "Telefon"))),
            el("div", { class: "row" }, el("label", null, "44  Weitere Informationen"),
              el("div", null, el("div", { class: "infos" }, input("info1", "•"), input("info2", "•"), input("info3", "•"), input("info4", "•")), res(44, "Informationen"))),
            el("div", { class: "row" }, el("label", null, "45  Zu erledigen"), el("div", null, input("todo", "..."), res(45, "Aufgabe")))),
          ctx.revealed && el("div", { class: "explain", style: "margin-left:0;margin-top:14px" },
            el("div", { class: "sol" }, "Musterlösung"),
            el("div", null, `${sol.anrede} ${sol.name}, ${sol.firma}, Tel. ${sol.telefon}`),
            el("ul", { class: "checklist" }, sol.infos.map((x) => el("li", null, x))),
            el("div", null, el("strong", null, "Zu erledigen: "), sol.todo),
            el("p", { class: "note", style: "margin:6px 0 0" }, "Die automatische Prüfung sucht Schlüsselwörter. Vergleichen Sie Ihre Notiz auch selbst mit der Musterlösung."))),
      ];
    },
    sb1(ctx) {
      const p = ctx.t.sprachbausteine.teil1;
      const gaptext = el("div", { class: "panel gaptext" });
      p.text.split(/(\{\{\d+\}\})/).forEach((part) => {
        const m = part.match(/^\{\{(\d+)\}\}$/);
        if (!m) { gaptext.append(part); return; }
        const nr = Number(m[1]);
        const item = { nr, answer: p.answers[nr] };
        const cls = ctx.revealed ? (isRight(item, ctx.st.answers[nr]) ? "correct" : "wrong") : "";
        gaptext.append(el("span", { class: `gap ${cls}` }, el("span", { class: "gnr" }, nr),
          el("select", { class: "gap-select", disabled: ctx.locked, on: { change: (e) => setAnswer(ctx, nr, e.target.value) } },
            el("option", { value: "", text: "–" }),
            LETTERS.map((l) => el("option", { value: l, selected: ctx.st.answers[nr] === l, text: `${l}) ${p.words[l]}` })))));
      });
      return [
        el("div", { class: "instruction" }, paras(p.situation)),
        el("div", { class: "panel" }, el("div", { class: "wordbox" }, LETTERS.map((l) => el("span", null, el("b", null, l), p.words[l])))),
        gaptext,
        ctx.revealed && el("div", { class: "panel" }, partItems(ctx.t, "sb1").map((it) =>
          taskShell(ctx, it, el("div", { class: "q" }, el("span", { class: "nr" }, it.nr), el("div", null, `${it.answer}) ${p.words[it.answer]}`)), explainBox(it, ctx.st.answers[it.nr], `${it.answer}) ${p.words[it.answer]}`)))),
      ];
    },
    sb2(ctx) {
      const p = ctx.t.sprachbausteine.teil2;
      const gaps = Object.fromEntries(p.gaps.map((g) => [g.nr, g]));
      const gaptext = el("div", { class: "panel gaptext" });
      p.text.split(/(\{\{\d+\}\})/).forEach((part) => {
        const m = part.match(/^\{\{(\d+)\}\}$/);
        if (!m) { gaptext.append(part); return; }
        const nr = Number(m[1]);
        gaptext.append(el("span", { class: "gap" }, el("span", { class: "gnr" }, nr), el("span", { class: "gnr" }, "____")));
      });
      return [
        el("div", { class: "instruction" }, paras(p.situation)),
        el("div", { class: "split" },
          el("div", null, gaptext),
          el("div", { class: "panel sticky" }, Object.values(gaps).map((g) => mcTask(ctx, { ...g, type: "mc", text: `Lücke ${g.nr}` })))),
      ];
    },
    schreiben(ctx) {
      const p = ctx.t.schreiben;
      const st = ctx.st;
      const theme = st.writing["58theme"] || "A";
      const area = writingArea(ctx, "58", "Ihr Forumsbeitrag ...");
      const themeRow = el("div", { class: "topic-list" }, p.themes.map((th) => el("label", { class: th.key === theme ? "sel" : "" },
        el("input", { type: "radio", name: `${ctx.t.id}-theme`, checked: th.key === theme, on: { change: () => { st.writing["58theme"] = th.key; save(); renderRoute(); } } }),
        el("div", null, el("strong", null, `Thema ${th.key}: ${th.title}`), el("p", { style: "margin:4px 0 0" }, th.text)))));
      return [
        el("div", { class: "instruction" }, paras(p.situation)),
        el("div", { class: "panel" },
          el("h3", null, "58  Wählen Sie ein Thema"),
          themeRow,
          el("div", { style: "margin-top:14px" }, area.node),
          el("details", null, el("summary", null, "Checkliste"), el("ul", { class: "checklist" }, p.checklist.map((x) => el("li", null, x)))),
          ctx.revealed ? el("details", null, el("summary", null, `Musterlösung Thema ${theme}`), el("div", { class: "model" }, p.modelAnswers[theme]))
            : el("p", { class: "note" }, "Die Musterlösung sehen Sie am Ende des Tests.")),
      ];
    },
    sp1(ctx) {
      const p = ctx.t.sprechen.teil1;
      const st = ctx.st;
      const sel = st.speaking.sp1topic ?? 0;
      const topic = p.topics[sel] || p.topics[0];
      const qList = el("ol", null, p.examinerQuestions.map((q) => el("li", null, q)));
      const qBtn = el("button", { class: "btn", type: "button", on: { click: () => Speech.say(shuffle(p.examinerQuestions)[0], "m") } }, "Zufällige Prüferfrage vorlesen");
      return [
        el("div", { class: "instruction" },
          el("p", null, "Teil 1A: Wählen Sie ein Thema und sprechen Sie ca. 2 Minuten darüber. Zeigen Sie, was Sie können."),
          el("p", null, "Teil 1B: Danach stellt die Prüferin / der Prüfer Ihnen Fragen (ca. 2 Minuten).")),
        el("div", { class: "panel" },
          el("h3", null, "Themen"),
          el("div", { class: "topic-list" }, p.topics.map((tp, i) => el("label", { class: i === sel ? "sel" : "" },
            el("input", { type: "radio", name: `${ctx.t.id}-sp1`, checked: i === sel, on: { change: () => { st.speaking.sp1topic = i; save(); renderRoute(); } } }),
            el("div", null, el("strong", null, tp.title), " ", el("span", { class: "note" }, tp.hints))))),
          el("div", { class: "actions" }, countdown("2 Minuten", 120)),
          phrases(p.usefulPhrases)),
        el("div", { class: "panel" }, el("h3", null, "Teil 1B: Prüferfragen"), el("div", { class: "actions" }, qBtn),
          el("details", null, el("summary", null, "Alle Fragen anzeigen"), qList)),
        el("div", { class: "panel" }, speakingAnswer(ctx, "sp1")),
      ];
    },
    sp2(ctx) {
      const p = ctx.t.sprechen.teil2;
      return [
        el("div", { class: "instruction" },
          el("p", null, "Teil 2: Mit Kolleginnen und Kollegen sprechen (ca. 3 Minuten). Eine Kollegin / ein Kollege stellt Ihnen eine Frage. Antworten Sie, erzählen Sie von sich und stellen Sie auch Gegenfragen.")),
        el("div", { class: "panel" }, p.prompts.map((q, i) => el("div", { class: "task" },
          el("div", { class: "q" }, el("span", { class: "nr" }, i + 1), el("div", null, q)),
          el("div", { class: "actions", style: "margin:6px 0 0 40px" },
            el("button", { class: "btn btn-small", type: "button", on: { click: () => Speech.say(q, i % 2 ? "m" : "f") } }, "▶ Frage anhören"),
            countdown("90 Sekunden", 90)))),
        phrases(p.usefulPhrases)),
        el("div", { class: "panel" }, speakingAnswer(ctx, "sp2")),
      ];
    },
    sp3(ctx) {
      const p = ctx.t.sprechen.teil3;
      return [
        el("div", { class: "instruction" },
          el("p", null, "Teil 3: Lösungswege diskutieren (ca. 4 Minuten). Besprechen Sie mit Ihrer Partnerin / Ihrem Partner das Problem. Machen Sie Vorschläge, reagieren Sie auf die Vorschläge und einigen Sie sich, wer was übernimmt.")),
        el("div", { class: "panel" },
          el("h3", null, "Situation"), paras(p.situation),
          el("h3", null, "Aufgabe"), paras(p.task),
          el("ul", { class: "checklist" }, p.points.map((x) => el("li", null, x))),
          el("div", { class: "actions" }, countdown("4 Minuten", 240)),
          phrases(p.usefulPhrases)),
        el("div", { class: "panel" }, el("h3", null, "Beispieldialog"),
          el("p", { class: "note" }, "Zuerst selbst versuchen, dann den Beispieldialog anhören."),
          audioPlayer({ ...ctx, exam: false }, p.modelDialogue, "sp3-model", { allowTranscript: true, transcriptOpen: false })),
        el("div", { class: "panel" }, speakingAnswer(ctx, "sp3")),
      ];
    },
  };

  // ------------------------------------------------------------------ scoring

  function partScore(t, pid) {
    const st = testState(t.id);
    const items = partItems(t, pid);
    let right = items.filter((it) => isRight(it, st.answers[it.nr])).length;
    let total = items.length;
    let answered = items.filter((it) => st.answers[it.nr] !== undefined && st.answers[it.nr] !== "").length;
    if (pid === "hs") {
      const g = gradeNotes(t.hoerenSchreiben, st.notes);
      right += Object.values(g).filter(Boolean).length;
      total += 4;
      answered += ["name", "telefon", "info1", "todo"].filter((k) => (st.notes[k] || "").trim()).length;
    }
    return { right, total, answered };
  }

  /** Official points of the automatically scored tasks of a part. */
  function partPoints(t, pid) {
    const st = testState(t.id);
    let got = 0, max = 0;
    for (const it of partItems(t, pid)) {
      max += ITEM_POINTS(it.nr);
      if (isRight(it, st.answers[it.nr])) got += ITEM_POINTS(it.nr);
    }
    if (pid === "hs") {
      const g = gradeNotes(t.hoerenSchreiben, st.notes);
      for (const [nr, pts] of Object.entries(NOTE_POINTS)) { max += pts; if (g[nr]) got += pts; }
    }
    return { got, max };
  }

  /** Official points per Fertigkeit for the automatically scored tasks. */
  function skillPoints(t) {
    const st = testState(t.id);
    const sum = { Lesen: 0, Hören: 0, Schreiben: 0 };
    for (const pid of PART_ORDER) {
      for (const it of partItems(t, pid)) {
        if (!isRight(it, st.answers[it.nr])) continue;
        const skill = it.nr <= 20 ? "Lesen" : it.nr <= 41 ? "Hören" : "Schreiben";
        sum[skill] += ITEM_POINTS(it.nr);
      }
    }
    const g = gradeNotes(t.hoerenSchreiben, st.notes);
    for (const [nr, pts] of Object.entries(NOTE_POINTS)) if (g[nr]) sum.Schreiben += pts;
    return sum;
  }

  function pointsBox(pid) {
    const rows = POINTS[pid];
    if (!rows) return null;
    const total = rows.reduce((n, r) => n + r[3], 0);
    const skills = [...new Set(rows.map((r) => r[1]))];
    return el("details", { class: "points" },
      el("summary", null, `Punkte in der Prüfung: ${fmtPts(total)}`),
      el("table", null, el("tbody", null, rows.map(([label, skill, calc, pts]) => el("tr", null,
        el("td", null, label), el("td", null, skill), el("td", { class: "note" }, calc), el("td", { class: "num" }, `${fmtPts(pts)} P.`))))),
      skills.filter((k) => CRITERIA_NOTE[k]).map((k) => el("p", { class: "note" }, CRITERIA_NOTE[k])),
      el("p", { class: "note" }, "Jede Fertigkeit (Lesen, Hören, Schreiben, Sprechen) zählt 60 Punkte, insgesamt 240."));
  }

  function revealedFor(t, pid) {
    const st = testState(t.id);
    return !!st.finished || (mode() === "practice" && !!st.checked[pid]);
  }

  function testSummary(t) {
    let answered = 0, total = 0, right = 0, checkedTotal = 0;
    for (const pid of PART_ORDER) {
      const s = partScore(t, pid);
      answered += s.answered; total += s.total;
      if (revealedFor(t, pid)) { right += s.right; checkedTotal += s.total; }
    }
    return { answered, total, right, checkedTotal };
  }

  // ------------------------------------------------------------------ views

  function setTopbar(t) {
    const mid = $("#topbar-mid");
    mid.replaceChildren();
    if (!t) return;
    const sw = el("div", { class: "mode-switch", role: "group", "aria-label": "Modus" },
      el("button", { type: "button", class: mode() === "practice" ? "on" : "", on: { click: () => setMode("practice") } }, "Übung"),
      el("button", { type: "button", class: mode() === "exam" ? "on" : "", on: { click: () => setMode("exam") } }, "Prüfung"));
    mid.append(el("span", { class: "crumb" }, `${t.title} · ${t.sector}`), sw);
  }

  function setMode(m) {
    store.settings.mode = m;
    save(true);
    renderRoute();
  }

  function navBadge(t, pid) {
    const st = testState(t.id);
    if (pid.startsWith("sp")) return [(st.speaking[pid] || "").trim() ? "✎" : "", false];
    if (pid === "schreiben") return [(st.writing["58"] || "").trim() ? "✎" : "", false];
    const s = partScore(t, pid);
    if (revealedFor(t, pid)) return [`${s.right}/${s.total}`, true];
    return [`${s.answered}/${s.total}`, false];
  }

  function updateNav(t) {
    document.querySelectorAll("[data-nav-pid]").forEach((a) => {
      const [txt, done] = navBadge(t, a.dataset.navPid);
      const b = a.querySelector(".badge");
      if (b) { b.textContent = txt; b.classList.toggle("done", done); }
    });
  }

  function sideNav(t, pid) {
    const nav = el("nav", { class: "sidenav", "aria-label": "Prüfungsteile" });
    for (const b of BLOCKS) {
      const st = testState(t.id);
      const g = el("div", { class: "group" }, el("div", { class: "group-title" },
        el("span", null, b.title), el("span", null, b.minutes ? `${b.minutes} min` : "")));
      for (const [id, title] of b.parts) {
        const [txt, done] = navBadge(t, id);
        g.append(el("a", { href: `#/t/${t.id}/${id}`, class: id === pid ? "active" : "", dataset: { navPid: id } },
          el("span", null, title), el("span", { class: `badge${done ? " done" : ""}` }, txt)));
      }
      nav.append(g);
    }
    nav.append(el("div", { class: "group" }, el("a", { href: `#/t/${t.id}/ergebnis`, class: pid === "ergebnis" ? "active" : "" }, el("span", null, "Ergebnis"))));
    return nav;
  }

  function mobileNav(t, pid) {
    const sel = el("select", { on: { change: (e) => { location.hash = `#/t/${t.id}/${e.target.value}`; } } },
      BLOCKS.map((b) => el("optgroup", { label: b.title }, b.parts.map(([id, title]) => el("option", { value: id, selected: id === pid, text: title })))),
      el("option", { value: "ergebnis", selected: pid === "ergebnis", text: "Ergebnis" }));
    return el("div", { class: "mobile-nav" }, sel);
  }

  function partFooter(ctx) {
    const { t, st, pid } = ctx;
    const idx = PART_ORDER.indexOf(pid);
    const prev = PART_ORDER[idx - 1];
    const next = PART_ORDER[idx + 1] || "ergebnis";
    const bar = el("div", { class: "actions" });
    const closed = partItems(t, pid).length > 0;
    const checkable = closed || pid === "schreiben";
    if (!ctx.exam && !ctx.revealed && checkable) {
      bar.append(el("button", {
        class: "btn btn-primary", type: "button",
        on: { click: () => { st.checked[pid] = true; save(true); renderRoute(); } },
      }, closed ? "Antworten prüfen" : "Musterlösung zeigen"));
    }
    if (ctx.revealed && closed) {
      const s = partScore(t, pid);
      const pp = partPoints(t, pid);
      bar.append(el("span", { class: `scoreline ${s.right / s.total >= 0.6 ? "good" : "bad"}` },
        `${s.right} von ${s.total} richtig · ${fmtPts(pp.got)} von ${fmtPts(pp.max)} Punkten`));
    }
    if (ctx.revealed && !st.finished && checkable) {
      bar.append(el("button", { class: "btn", type: "button", on: { click: () => resetPart(t, pid) } }, "Nochmal versuchen"));
    }
    const navRow = el("div", { class: "actions", style: "justify-content:space-between" },
      prev ? el("a", { class: "btn", href: `#/t/${t.id}/${prev}` }, `← ${PART_TITLE[prev]}`) : el("span"),
      el("a", { class: next === "ergebnis" ? "btn btn-primary" : "btn", href: `#/t/${t.id}/${next}` },
        next === "ergebnis" ? (st.finished ? "Ergebnis →" : "Test beenden →") : `${PART_TITLE[next]} →`));
    return [bar, navRow];
  }

  function resetPart(t, pid) {
    const st = testState(t.id);
    partItems(t, pid).forEach((it) => delete st.answers[it.nr]);
    if (pid === "hs") st.notes = {};
    delete st.checked[pid];
    save(true);
    renderRoute();
  }

  function startBlockTimer(ctx) {
    clearInterval(timerHandle);
    const timer = $("#timer");
    timer.hidden = true;
    const { block, st } = ctx;
    if (!ctx.exam || !block.minutes || ctx.revealed) return;
    st.timers[block.id] = st.timers[block.id] || { start: Date.now() };
    save();
    const tick = () => {
      const left = block.minutes * 60 - (Date.now() - st.timers[block.id].start) / 1000;
      timer.hidden = false;
      timer.textContent = left > 0 ? `${block.title}: ${fmtTime(left)}` : `${block.title}: Zeit um (${fmtTime(left)})`;
      timer.classList.toggle("low", left < 120);
    };
    tick();
    timerHandle = setInterval(tick, 1000);
  }

  function renderPart(t, pid) {
    const ctx = ctxFor(t, pid);
    const app = $("#app");
    const block = ctx.block;
    const head = el("div", { class: "part-head" },
      el("h1", null, PART_TITLE[pid]),
      el("span", { class: "tag" }, `${block.title}${block.minutes ? ` · ${block.minutes} Minuten` : ""} · ${ctx.exam ? "Prüfungsmodus" : "Übungsmodus"}`));
    const body = el("div", null, head, pointsBox(pid), ...RENDER[pid](ctx).flat(), ...partFooter(ctx));
    app.replaceChildren(el("div", { class: "test-layout" }, sideNav(t, pid), el("div", null, mobileNav(t, pid), body)));
    startBlockTimer(ctx);
  }

  function renderResults(t) {
    const app = $("#app");
    const st = testState(t.id);
    clearInterval(timerHandle);
    $("#timer").hidden = true;
    const layout = (...content) => app.replaceChildren(el("div", { class: "test-layout" },
      sideNav(t, "ergebnis"), el("div", null, mobileNav(t, "ergebnis"), ...content)));

    if (!st.finished) {
      const openRows = BLOCKS.filter((b) => b.id !== "sprechen").map((b) => {
        let answered = 0, total = 0;
        b.parts.forEach(([pid]) => { const s = partScore(t, pid); answered += s.answered; total += s.total; });
        const writingKey = b.id === "ls" ? "21" : b.id === "sb" ? "58" : null;
        const written = writingKey ? words(st.writing[writingKey]) : null;
        return el("tr", null, el("td", null, b.title),
          el("td", { class: "num" }, total ? `${answered} / ${total} beantwortet` : ""),
          el("td", { class: "note" }, writingKey ? `Text ${writingKey}: ${written} Wörter` : ""));
      });
      layout(
        el("h1", null, `Test beenden: ${t.title}`),
        el("p", null, "Prüfen Sie, ob Sie alle Aufgaben beantwortet haben. Nach dem Beenden sehen Sie alle Lösungen, Erklärungen, Transkripte und Musterlösungen. Ihre Antworten können Sie dann nicht mehr ändern."),
        el("table", { class: "results" }, el("tbody", null, openRows)),
        el("div", { class: "actions", style: "margin-top:22px" },
          el("button", {
            class: "btn btn-primary", type: "button",
            on: { click: () => { if (confirm("Test beenden und alle Lösungen anzeigen?")) { st.finished = true; save(true); renderRoute(); } } },
          }, "Test beenden und Lösungen anzeigen")));
      return;
    }

    const sp = skillPoints(t);
    const status = (pts) => (pts >= 36 ? ["60 % erreicht", "good"] : pts >= 24 ? ["40-60 %: nur in einer Fertigkeit ausgleichbar", "bad"] : ["unter 40 %", "bad"]);
    const skillRow = (name, pts) => {
      const [txt, cls] = status(pts);
      return el("tr", null, el("td", null, name), el("td", { class: "num" }, `${fmtPts(pts)} / 60`),
        el("td", { class: "num" }, `${Math.round((pts / 60) * 100)} %`), el("td", { class: `scoreline ${cls}` }, txt));
    };
    const overview = PART_ORDER.flatMap((pid) => POINTS[pid].map(([label, skill, calc, pts]) => el("tr", null,
      el("td", null, label), el("td", null, skill), el("td", { class: "note" }, calc), el("td", { class: "num" }, fmtPts(pts)))));

    layout(
      el("h1", null, `Ergebnis: ${t.title}`),
      el("p", null, "Öffnen Sie die einzelnen Teile links, um Ihre Antworten mit Lösungen und Erklärungen zu sehen."),
      el("h3", null, "Punkte nach Fertigkeit"),
      el("table", { class: "results" },
        el("thead", null, el("tr", null, el("th", null, "Fertigkeit"), el("th", null, "Punkte"), el("th", null, "%"), el("th", null, ""))),
        el("tbody", null,
          skillRow("Lesen (Aufgaben 1-20)", sp.Lesen),
          skillRow("Hören (Aufgaben 22-41)", sp.Hören),
          el("tr", null, el("td", null, "Schreiben"), el("td", { class: "num" }, `${fmtPts(sp.Schreiben)} / 12`),
            el("td", { class: "num" }, ""), el("td", { class: "note" }, "automatisch nur Sprachbausteine (6) und Telefonnotiz (6). Die Texte 21 und 58 (48 Punkte) bewerten Prüfende.")),
          el("tr", null, el("td", null, "Sprechen"), el("td", { class: "num" }, "– / 60"), el("td"),
            el("td", { class: "note" }, "wird in der Prüfung von Prüfenden bewertet")))),
      el("div", { class: "panel muted", style: "margin-top:16px" },
        el("h3", null, "So besteht man die Prüfung"),
        el("ul", { class: "checklist" },
          el("li", null, "Insgesamt mindestens 60 % der 240 Punkte, also 144 Punkte."),
          el("li", null, "Mindestens drei der vier Fertigkeiten mit 60 % oder mehr (mindestens 36 von 60 Punkten)."),
          el("li", null, "Eine schwächere Fertigkeit kann ausgeglichen werden, wenn sie zwischen 40 % und 60 % liegt (24 bis 36 Punkte).")),
        el("p", { class: "note", style: "margin:0" }, "Quelle: telc, Übungstest 1 Deutsch-Test für den Beruf B2 (2020), Punkte und Gewichtung. Die Punkte hier sind eine Orientierung für das Training.")),
      el("details", null, el("summary", null, "Alle Teile mit Punkten"),
        el("table", { class: "results" },
          el("thead", null, el("tr", null, el("th", null, "Teil"), el("th", null, "Fertigkeit"), el("th", null, "Berechnung"), el("th", null, "Punkte"))),
          el("tbody", null, overview)),
        el("p", { class: "note" }, CRITERIA_NOTE.Schreiben),
        el("p", { class: "note" }, CRITERIA_NOTE.Sprechen)),
      el("div", { class: "actions", style: "margin-top:22px" },
        el("button", { class: "btn btn-danger", type: "button", on: { click: () => { if (confirm(`Alle Antworten von ${t.title} löschen?`)) { delete store.tests[t.id]; save(true); renderRoute(); } } } }, "Test neu starten (alle Antworten löschen)")));
  }

  function renderHome() {
    clearInterval(timerHandle);
    $("#timer").hidden = true;
    setTopbar(null);
    const app = $("#app");
    const cards = TESTS.map((t, i) => {
      const s = testSummary(t);
      const pct = s.total ? Math.round((s.answered / s.total) * 100) : 0;
      return el("a", { class: "card", href: `#/t/${t.id}/lesen1` },
        el("span", { class: "num" }, `Modelltest ${i + 1}`),
        el("span", { class: "sector" }, t.sector),
        el("span", { class: "summary" }, t.summary),
        el("div", { class: "progress", title: `${pct} % beantwortet` }, el("span", { style: `width:${pct}%` })),
        el("div", { class: "meta" }, el("span", null, `${s.answered}/${s.total} beantwortet`), el("span", null, s.checkedTotal ? `${Math.round((s.right / s.checkedTotal) * 100)} % richtig` : "")));
    });
    app.replaceChildren(
      el("div", { class: "hero" },
        el("h1", null, "Deutsch-Test für den Beruf B2: Modelltests"),
        el("p", null, `${TESTS.length} vollständige Übungstests im Format der DTB-B2-Prüfung: Lesen, Hören, Sprachbausteine, Schreiben und Sprechen. Alle Inhalte sind eigene Übungstexte, keine echten Prüfungsaufgaben.`)),
      TESTS.length ? el("div", { class: "cards" }, cards) : el("div", { class: "warnbox" }, "Keine Tests gefunden. Die Dateien app/tests/test01.js ... fehlen."));
  }

  const cleanupFns = [];

  function renderRoute() {
    while (cleanupFns.length) { try { cleanupFns.pop()(); } catch { /* ignore */ } }
    Speech.stopAll();
    activePlayer = null;
    const m = location.hash.match(/^#\/t\/(mt\d\d)\/([a-z0-9]+)$/);
    const t = m && byId(m[1]);
    if (!t || !(m[2] === "ergebnis" || RENDER[m[2]])) {
      view = { testId: null, pid: null };
      renderHome();
      return;
    }
    const changed = view.testId !== t.id || view.pid !== m[2];
    const oldNav = $(".sidenav");
    const navScroll = oldNav ? oldNav.scrollTop : 0;
    const pageScroll = window.scrollY;
    view = { testId: t.id, pid: m[2] };
    setTopbar(t);
    if (m[2] === "ergebnis") renderResults(t); else renderPart(t, m[2]);
    window.scrollTo(0, changed ? 0 : pageScroll);
    const nav = $(".sidenav");
    if (nav) {
      nav.scrollTop = navScroll;
      const active = nav.querySelector("a.active");
      if (active) {
        const top = active.offsetTop - nav.offsetTop;
        if (top < nav.scrollTop) nav.scrollTop = top - 8;
        else if (top + active.offsetHeight > nav.scrollTop + nav.clientHeight) nav.scrollTop = top + active.offsetHeight - nav.clientHeight + 8;
      }
    }
  }

  // ------------------------------------------------------------------ settings dialog

  function fillVoiceSelect(sel, current, g) {
    const vs = Speech.voices();
    sel.replaceChildren(el("option", { value: "", text: "Automatisch" }),
      vs.map((v) => el("option", { value: v.name, selected: v.name === current, text: `${v.name} (${v.lang})` })));
    if (!vs.length) sel.append(el("option", { value: "", text: "Keine deutsche Stimme gefunden", disabled: true }));
    sel.dataset.g = g;
  }

  function openSettings() {
    const dlg = $("#settings");
    fillVoiceSelect($("#set-voice-f"), store.settings.voiceF, "f");
    fillVoiceSelect($("#set-voice-m"), store.settings.voiceM, "m");
    $("#set-rate").value = store.settings.rate;
    $("#set-rate-out").textContent = Number(store.settings.rate).toFixed(2);
    dlg.showModal();
  }

  function initSettings() {
    $("#btn-settings").addEventListener("click", openSettings);
    $("#set-cancel").addEventListener("click", () => $("#settings").close());
    $("#set-rate").addEventListener("input", (e) => { $("#set-rate-out").textContent = Number(e.target.value).toFixed(2); });
    $("#set-voice-test").addEventListener("click", () => {
      Speech.configure({ voiceF: $("#set-voice-f").value, voiceM: $("#set-voice-m").value, rate: Number($("#set-rate").value) });
      const p = Speech.createPlayer();
      p.play([{ s: "A", g: "f", t: "Guten Tag, hier spricht die weibliche Stimme." }, { s: "B", g: "m", t: "Und hier ist die männliche Stimme. Hören Sie uns gut?" }]);
    });
    $("#set-reset").addEventListener("click", () => {
      if (!confirm("Alle Antworten und Ergebnisse aller Tests löschen?")) return;
      store.tests = {};
      save(true);
      $("#settings").close();
      renderRoute();
    });
    $("#settings-form").addEventListener("submit", () => {
      store.settings.voiceF = $("#set-voice-f").value;
      store.settings.voiceM = $("#set-voice-m").value;
      store.settings.rate = Number($("#set-rate").value);
      Speech.configure({ voiceF: store.settings.voiceF, voiceM: store.settings.voiceM, rate: store.settings.rate });
      save(true);
    });
    Speech.onVoices(() => { if (view.pid && view.pid.startsWith("hoeren")) renderRoute(); });
  }

  // ------------------------------------------------------------------ boot

  function loadTests() {
    const files = Array.from({ length: 20 }, (_, i) => `tests/test${String(i + 1).padStart(2, "0")}.js`);
    return Promise.all(files.map((src) => new Promise((resolve) => {
      const s = document.createElement("script");
      s.src = src;
      s.onload = resolve;
      s.onerror = () => { s.remove(); resolve(); };
      document.body.append(s);
    }))).then(() => {
      const seen = new Set();
      TESTS = (window.DTB_TESTS || []).filter((t) => t && t.id && !seen.has(t.id) && seen.add(t.id))
        .sort((a, b) => a.id.localeCompare(b.id));
    });
  }

  window.addEventListener("hashchange", renderRoute);
  window.addEventListener("beforeunload", () => save(true));
  initSettings();
  loadTests().then(renderRoute);
})();
