/**
 * AI feedback for the open tasks (Schreiben 21 and 58, Sprechen 1-3), using the Claude API.
 *
 * The browser calls the API directly with the learner's own API key (dangerouslyAllowBrowser).
 * The key stays in this browser's localStorage and is sent only to api.anthropic.com.
 *
 * Feedback.evaluate({ kind, apiKey, lang, task, text }) resolves to
 * { summary, criteria[], corrections[], strengths[], improvements[], improved_version }.
 */
window.Feedback = (() => {
  const MODEL = "claude-opus-5-5";

  const LANG_NAMES = { de: "einfachem Deutsch (B1-Niveau)", en: "English", ru: "Russian", uk: "Ukrainian" };

  const CRITERIA = {
    writing: [
      ["Aufgabenerfüllung", "Alle Inhaltspunkte bearbeitet? Passende Textsorte? Angemessene Länge?"],
      ["Kommunikative Gestaltung", "Register (formell/informell), Anrede und Gruß, Textaufbau, Absätze, Verknüpfung der Sätze."],
      ["Formale Richtigkeit", "Grammatik, Satzbau, Rechtschreibung, Zeichensetzung."],
      ["Wortschatz", "Spektrum und Angemessenheit des Wortschatzes für B2 im Beruf."],
    ],
    speaking: [
      ["Aufgabenerfüllung", "Thema/Aufgabe vollständig bearbeitet, genug Inhalt für die Sprechzeit?"],
      ["Kohärenz und Interaktion", "Logischer Aufbau, Verknüpfung, Redemittel für Meinung, Vorschlag, Reaktion."],
      ["Formale Richtigkeit", "Grammatik und Satzbau in der Transkription."],
      ["Wortschatz", "Spektrum und Angemessenheit des Wortschatzes für B2 im Beruf."],
    ],
  };

  const SCHEMA = {
    type: "object",
    properties: {
      summary: { type: "string" },
      criteria: {
        type: "array",
        items: {
          type: "object",
          properties: {
            name: { type: "string" },
            points: { type: "integer" },
            max: { type: "integer" },
            comment: { type: "string" },
          },
          required: ["name", "points", "max", "comment"],
          additionalProperties: false,
        },
      },
      corrections: {
        type: "array",
        items: {
          type: "object",
          properties: {
            original: { type: "string" },
            corrected: { type: "string" },
            explanation: { type: "string" },
          },
          required: ["original", "corrected", "explanation"],
          additionalProperties: false,
        },
      },
      strengths: { type: "array", items: { type: "string" } },
      improvements: { type: "array", items: { type: "string" } },
      improved_version: { type: "string" },
    },
    required: ["summary", "criteria", "corrections", "strengths", "improvements", "improved_version"],
    additionalProperties: false,
  };

  function systemPrompt(kind, lang) {
    const crit = CRITERIA[kind]
      .map(([name, desc], i) => `${i + 1}. "${name}" (0-5 Punkte): ${desc}`)
      .join("\n");
    const what = kind === "writing"
      ? "einen schriftlichen Text aus dem Prüfungsteil Schreiben"
      : "die Transkription einer mündlichen Antwort aus dem Prüfungsteil Sprechen (automatische Spracherkennung oder getippt)";
    return [
      "Du bist erfahrene Prüferin für den \"Deutsch-Test für den Beruf B2\" (DTB B2 Beruf).",
      `Du bewertest ${what}. Die Lernenden bereiten sich auf die Prüfung vor.`,
      "",
      "Bewerte nach genau diesen vier Kriterien, in dieser Reihenfolge, mit genau diesen Namen und max = 5:",
      crit,
      "",
      "Regeln:",
      "- Bewerte streng, aber fair, so wie in der echten Prüfung auf Niveau B2. 3 von 5 Punkten bedeutet: B2 knapp erreicht.",
      "- Wenn der Text leer, sehr kurz oder zum Thema unpassend ist, gib entsprechend wenige Punkte und sage es klar.",
      kind === "speaking"
        ? "- Aussprache und Flüssigkeit kannst du aus der Transkription nicht beurteilen. Erkennungsfehler der Spracherkennung (falsch erkannte Wörter) zählst du nicht als Fehler, wenn das gemeinte Wort klar ist."
        : "- Prüfe, ob jeder geforderte Inhaltspunkt bearbeitet wurde, und nenne fehlende Punkte.",
      "- corrections: die wichtigsten Fehler (höchstens 12), jeweils der originale Ausschnitt, die korrigierte Fassung auf Deutsch und eine kurze Erklärung der Regel.",
      "- strengths: 2-4 konkrete Stärken. improvements: 2-4 konkrete Tipps für die Prüfung.",
      "- improved_version: eine verbesserte Fassung des Textes der lernenden Person auf Deutsch, auf B2-Niveau, mit ihren Ideen, nicht komplett neu geschrieben.",
      `- Schreibe summary, comment, explanation, strengths und improvements in ${LANG_NAMES[lang] || LANG_NAMES.de}. Kurze, klare Sätze.`,
    ].join("\n");
  }

  function userContent(task, text) {
    return [
      "<aufgabe>",
      task,
      "</aufgabe>",
      "",
      "<antwort_der_lernenden_person>",
      text && text.trim() ? text.trim() : "(leer)",
      "</antwort_der_lernenden_person>",
    ].join("\n");
  }

  function errorMessage(err) {
    const A = window.AnthropicSDK && window.AnthropicSDK.default;
    if (A) {
      if (err instanceof A.AuthenticationError) return "Der API-Schlüssel ist ungültig. Bitte in den Einstellungen prüfen.";
      if (err instanceof A.PermissionDeniedError) return "Der API-Schlüssel hat keine Berechtigung für dieses Modell.";
      if (err instanceof A.RateLimitError) return "Zu viele Anfragen. Bitte in einer Minute noch einmal versuchen.";
      if (err instanceof A.BadRequestError) return `Die Anfrage wurde abgelehnt: ${err.message}`;
      if (err instanceof A.APIConnectionError) return "Keine Verbindung zur Claude API. Internetverbindung prüfen.";
      if (err instanceof A.APIError) return `Fehler der Claude API (${err.status ?? "?"}): ${err.message}`;
    }
    return err && err.message ? err.message : String(err);
  }

  async function evaluate({ kind, apiKey, lang, task, text }) {
    const A = window.AnthropicSDK && window.AnthropicSDK.default;
    if (!A) throw new Error("Die Claude-Bibliothek wurde nicht geladen (vendor/anthropic-sdk.js fehlt).");
    if (!apiKey) throw new Error("Kein API-Schlüssel gespeichert. Bitte in den Einstellungen eintragen.");

    const client = new A({ apiKey, dangerouslyAllowBrowser: true, maxRetries: 2 });
    let response;
    try {
      response = await client.beta.messages.create({
        model: MODEL,
        max_tokens: 16000,
        betas: ["server-side-fallback-2026-07-01"],
        fallbacks: "default",
        output_config: { effort: "medium", format: { type: "json_schema", schema: SCHEMA } },
        system: systemPrompt(kind, lang),
        messages: [{ role: "user", content: userContent(task, text) }],
      });
    } catch (err) {
      throw new Error(errorMessage(err));
    }

    if (response.stop_reason === "refusal") {
      throw new Error("Claude hat diese Anfrage nicht bearbeitet. Bitte den Text prüfen und erneut versuchen.");
    }
    if (response.stop_reason === "max_tokens") {
      throw new Error("Die Antwort war zu lang und wurde abgeschnitten. Bitte erneut versuchen.");
    }
    const textBlock = (response.content || []).find((b) => b.type === "text");
    if (!textBlock) throw new Error("Leere Antwort von der Claude API.");
    try {
      return JSON.parse(textBlock.text);
    } catch {
      throw new Error("Die Antwort der Claude API war kein gültiges JSON.");
    }
  }

  return { evaluate, MODEL };
})();
