#!/usr/bin/env node
/**
 * Smoke test: load app/index.html in jsdom, render every part of every test in practice and
 * exam mode, press "Antworten prüfen" everywhere, and report JavaScript errors.
 *
 * Usage: node tools/smoke.mjs
 */
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { JSDOM, VirtualConsole } from "jsdom";

const here = path.dirname(fileURLToPath(import.meta.url));
const indexFile = path.join(here, "..", "app", "index.html");

const errors = [];
const vc = new VirtualConsole();
vc.on("jsdomError", (e) => {
  if (/Could not load script/.test(e.message)) return;
  errors.push(e.stack || e.message);
});
vc.on("error", (...a) => errors.push(a.join(" ")));

const dom = await JSDOM.fromFile(indexFile, {
  runScripts: "dangerously",
  resources: "usable",
  pretendToBeVisual: true,
  url: pathToFileURL(indexFile).href,
  virtualConsole: vc,
  beforeParse(window) {
    const voices = [
      { name: "Anna", lang: "de-DE", localService: true },
      { name: "Stefan", lang: "de-DE", localService: true },
    ];
    window.speechSynthesis = {
      getVoices: () => voices, speak: (u) => setTimeout(() => u.onend && u.onend(), 5),
      cancel() {}, pause() {}, resume() {}, addEventListener() {},
    };
    window.SpeechSynthesisUtterance = function (t) { this.text = t; };
    window.HTMLDialogElement.prototype.showModal = function () { this.open = true; };
    window.HTMLDialogElement.prototype.close = function () { this.open = false; };
    window.scrollTo = () => {};
    window.confirm = () => true;
  },
});

const { window } = dom;
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
for (let i = 0; i < 100 && !window.document.querySelector(".cards, .warnbox"); i++) await wait(50);

const tests = window.DTB_TESTS || [];
console.log(`tests loaded: ${tests.length} (${tests.map((t) => t.id).join(", ")})`);
if (!window.document.querySelector(".cards")) errors.push("home page did not render cards");

const parts = ["lesen1", "lesen2", "lesen3", "lesen4", "ls", "hoeren1", "hoeren2", "hoeren3", "hoeren4", "hs", "sb1", "sb2", "schreiben", "sp1", "sp2", "sp3", "ergebnis"];
const go = async (hash) => { window.location.hash = hash; await wait(5); };

for (const t of tests) {
  for (const modeLabel of ["Übung", "Prüfung"]) {
    await go(`#/t/${t.id}/lesen1`);
    const btn = [...window.document.querySelectorAll(".mode-switch button")].find((b) => b.textContent === modeLabel);
    btn && btn.click();
    for (const p of parts) {
      const before = errors.length;
      await go(`#/t/${t.id}/${p}`);
      const h1 = window.document.querySelector("#app h1");
      if (!h1) errors.push(`${t.id}/${p} (${modeLabel}): nothing rendered`);
      // answer every radio with the first option and every select with its 2nd option
      window.document.querySelectorAll('#app input[type=radio]').forEach((r) => { if (!r.disabled && !r.checked && r.value === "a") { r.checked = true; r.dispatchEvent(new window.Event("change")); } });
      window.document.querySelectorAll("#app select").forEach((s) => { if (!s.disabled && s.options.length > 1) { s.selectedIndex = 1; s.dispatchEvent(new window.Event("change")); } });
      const check = [...window.document.querySelectorAll("#app button")].find((b) => /Antworten prüfen|abgeben|Lösungen anzeigen/.test(b.textContent));
      if (check) { check.click(); await wait(5); }
      const play = [...window.document.querySelectorAll("#app button")].find((b) => b.textContent.includes("Abspielen"));
      if (play && !play.disabled) { play.click(); await wait(120); }
      if (errors.length > before) console.log(`  error in ${t.id}/${p} (${modeLabel})`);
    }
  }
  delete window.localStorage;
}
await go("#/");

if (errors.length) {
  console.log(`\n${errors.length} error(s):`);
  errors.slice(0, 20).forEach((e) => console.log("- " + e.split("\n").slice(0, 4).join("\n  ")));
  process.exit(1);
}
console.log("smoke test OK");
window.close();
