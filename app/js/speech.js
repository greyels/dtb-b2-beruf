/**
 * Text-to-speech for the Hören parts, built on the browser's speechSynthesis API.
 *
 * Speech.configure({ voiceF, voiceM, rate }) sets the preferred voices (by voice name) and rate.
 * Speech.createPlayer() returns a player that reads a script (list of { s, g, t } lines)
 * line by line, with a female or male voice per line.
 */
window.Speech = (() => {
  const synth = window.speechSynthesis || null;
  const available = !!synth && typeof window.SpeechSynthesisUtterance === "function";
  const FEMALE_HINT = /(anna|katja|hedda|petra|marlene|vicki|helena|ingrid|amala|seraphina|katharina|louisa|maja|elke|female|weiblich|google deutsch)/i;
  const MALE_HINT = /(stefan|conrad|markus|yannick|hans|killian|florian|ralf|jonas|bernd|christoph|kasper|male|männlich)/i;

  let voices = [];
  let config = { voiceF: "", voiceM: "", rate: 0.95 };
  const listeners = new Set();

  function loadVoices() {
    if (!available) return;
    voices = synth.getVoices().filter((v) => /^de([-_]|$)/i.test(v.lang));
    voices.sort((a, b) => Number(b.localService === false) - Number(a.localService === false) || a.name.localeCompare(b.name));
    listeners.forEach((fn) => fn(voices));
  }
  if (available) {
    loadVoices();
    synth.addEventListener?.("voiceschanged", loadVoices);
    if (!synth.addEventListener) synth.onvoiceschanged = loadVoices;
  }

  function guess(g) {
    const hint = g === "m" ? MALE_HINT : FEMALE_HINT;
    const other = g === "m" ? FEMALE_HINT : MALE_HINT;
    return voices.find((v) => hint.test(v.name) && !other.test(v.name)) || null;
  }

  function voiceFor(g) {
    const wanted = g === "m" ? config.voiceM : config.voiceF;
    const byName = wanted && voices.find((v) => v.name === wanted);
    return byName || guess(g) || voices[0] || null;
  }

  function utterance(line) {
    const u = new SpeechSynthesisUtterance(line.t);
    const v = voiceFor(line.g);
    if (v) { u.voice = v; u.lang = v.lang; } else { u.lang = "de-DE"; }
    u.rate = config.rate;
    const other = voiceFor(line.g === "m" ? "f" : "m");
    if (v && other && v.name === other.name) u.pitch = line.g === "m" ? 0.75 : 1.15;
    return u;
  }

  function createPlayer({ onLine, onState } = {}) {
    let lines = [];
    let index = 0;
    let state = "idle";
    let current = null;
    let gapTimer = null;
    let token = 0;

    const setState = (s) => { state = s; onState && onState(s, index, lines.length); };

    function speakFrom(i, myToken) {
      if (myToken !== token) return;
      if (i >= lines.length) { index = lines.length; current = null; setState("ended"); return; }
      index = i;
      onLine && onLine(i);
      current = utterance(lines[i]);
      current.onend = () => {
        if (myToken !== token) return;
        const nextSpeakerChanges = lines[i + 1] && lines[i + 1].s !== lines[i].s;
        gapTimer = setTimeout(() => speakFrom(i + 1, myToken), nextSpeakerChanges ? 450 : 150);
      };
      current.onerror = (e) => {
        if (myToken !== token || e.error === "interrupted" || e.error === "canceled") return;
        setState("error");
      };
      synth.speak(current);
      setState("playing");
    }

    return {
      get state() { return state; },
      get index() { return index; },
      play(script, from = 0) {
        if (!available) { setState("error"); return; }
        this.stop(true);
        lines = script || [];
        token++;
        const myToken = token;
        setTimeout(() => speakFrom(from, myToken), 60);
      },
      pause() {
        if (state !== "playing") return;
        synth.pause();
        setState("paused");
      },
      resume() {
        if (state !== "paused") return;
        synth.resume();
        setState("playing");
      },
      stop(silent) {
        token++;
        clearTimeout(gapTimer);
        if (available) synth.cancel();
        current = null;
        if (!silent) setState("stopped");
      },
    };
  }

  /** Speak a single short text (e.g. one examiner question). */
  function say(text, g = "f") {
    if (!available) return;
    synth.cancel();
    synth.speak(utterance({ s: "", g, t: text }));
  }

  return {
    available,
    voices: () => voices.slice(),
    onVoices: (fn) => { listeners.add(fn); return () => listeners.delete(fn); },
    configure: (c) => { config = { ...config, ...c }; },
    voiceFor,
    createPlayer,
    say,
    stopAll: () => { if (available) synth.cancel(); },
  };
})();
