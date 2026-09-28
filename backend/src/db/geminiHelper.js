/**
 * Gemini AI helpers (Round 2 Block VI).
 *
 * - generateMedicineExplanation: the existing seed-time text helper (unchanged
 *   behavior, shared model-resolution logic).
 * - extractLabReport: NEW vision extraction for patient lab-report photos.
 *
 * Key/config pattern is unchanged: GEMINI_API_KEY from .env. Phase 89 finding:
 * the seeded key is currently EMPTY, so every caller must treat "no key" as a
 * first-class state — extraction returns null and the lab-report flow lands the
 * patient on the manual-entry review screen (never a dead end).
 *
 * Model selection (Phase 89: verify, don't assume): the historical model string
 * may be retired; at call time we probe a small ordered candidate list and cache
 * the first model that answers, so a retired model never silently breaks the
 * feature or the seed.
 */
require('dotenv').config();

const TEXT_MODEL_CANDIDATES = [
  'gemini-2.5-flash',
  'gemini-2.0-flash',
  'gemini-flash-latest',
  'gemini-1.5-flash',
  'gemini-1.5-flash-001'
];

let resolvedTextModel = null;

async function callGemini(model, parts, { maxOutputTokens = 512, temperature = 0.3, timeoutMs = 30000 } = {}) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey.trim() === '') {
    const err = new Error('NO_KEY');
    err.code = 'NO_KEY';
    throw err;
  }

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey.trim()}`;
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts }],
      generationConfig: { maxOutputTokens, temperature }
    }),
    signal: AbortSignal.timeout(timeoutMs)
  });

  if (!response.ok) {
    const errText = await response.text().catch(() => '');
    const err = new Error(`Gemini API ${response.status}: ${errText.slice(0, 120)}`);
    err.code = response.status === 404 ? 'MODEL_NOT_FOUND' : 'API_ERROR';
    throw err;
  }

  const data = await response.json();
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) {
    const err = new Error('Gemini returned no text content');
    err.code = 'EMPTY_RESPONSE';
    throw err;
  }
  return text;
}

/** Resolve the first live text model; caches the winner for the process. */
async function resolveTextModel() {
  if (resolvedTextModel) return resolvedTextModel;
  for (const model of TEXT_MODEL_CANDIDATES) {
    try {
      const reply = await callGemini(model, [{ text: 'Reply with the single word OK' }], {
        maxOutputTokens: 8, timeoutMs: 15000
      });
      if (reply) {
        resolvedTextModel = model;
        return model;
      }
    } catch (err) {
      if (err.code === 'NO_KEY') throw err;
      // model retired / network hiccup → try next candidate
    }
  }
  const err = new Error('No working Gemini model found');
  err.code = 'NO_MODEL';
  throw err;
}

/**
 * Seed-time medicine explanation (unchanged contract: returns string or null).
 */
async function generateMedicineExplanation(name, composition) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey.trim() === '') return null;

  const prompt = `Explain in simple but professional language, suitable for a patient reading their own prescription, what the medicine ${name} (composition: ${composition}) is commonly used for. 2–3 sentences. Avoid alarming or overly casual language, and avoid jargon a non-doctor wouldn't know.`;

  try {
    const model = await resolveTextModel();
    return await callGemini(model, [{ text: prompt }], { maxOutputTokens: 200, temperature: 0.3 });
  } catch (error) {
    console.warn(`[Gemini Seed Warning] Failed to generate explanation for ${name}: ${error.message}`);
    return null;
  }
}

/**
 * Vision extraction for lab-report photos (Phases 78–79).
 * Returns a promise of { rows: [{test_name, value, unit, reference_range?, confidence}],
 * report_date } or null when there is no key / nothing parseable.
 */
async function extractLabReport(base64Image, mimeType) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey.trim() === '') {
    console.warn('[Gemini Vision] No GEMINI_API_KEY configured — lab report needs manual entry.');
    return null;
  }

  const prompt = `You are reading a photo of a medical lab report. Extract every test result visible. Return ONLY valid JSON — no markdown fences, no commentary — shaped exactly like this:
{"rows":[{"test_name":"string","value":"string or number","unit":"string or null","reference_range":"string or null","confidence":0.0-1.0}],"report_date":"YYYY-MM-DD or null"}
Rules: test_name is the human-readable test label (e.g. "Hemoglobin", "Fasting Blood Sugar"). value is the numeric result. Include reference_range only if printed. confidence reflects how certain you are the value was read correctly. If the image is not a lab report or nothing is readable, return {"rows":[],"report_date":null}.`;

  const visionModelCandidates = ['gemini-2.5-flash', 'gemini-2.0-flash', 'gemini-flash-latest', 'gemini-1.5-flash'];
  let lastError = null;

  for (const model of visionModelCandidates) {
    try {
      const text = await callGemini(model, [
        { text: prompt },
        { inline_data: { mime_type: mimeType, data: base64Image } }
      ], { maxOutputTokens: 1200, temperature: 0.1, timeoutMs: 45000 });

      // Defensive parse (Phase 78): strip fences, find the outermost JSON object
      let cleaned = text.trim().replace(/^```(?:json)?/i, '').replace(/```$/i, '').trim();
      const start = cleaned.indexOf('{');
      const end = cleaned.lastIndexOf('}');
      if (start === -1 || end === -1 || end <= start) throw new Error('no JSON object in response');
      const parsed = JSON.parse(cleaned.slice(start, end + 1));

      const rows = Array.isArray(parsed.rows)
        ? parsed.rows
            .filter(r => r && r.test_name && r.value !== undefined && r.value !== null && r.value !== '')
            .map(r => ({
              test_name: String(r.test_name).slice(0, 80),
              value: String(r.value).slice(0, 40),
              unit: r.unit ? String(r.unit).slice(0, 24) : null,
              reference_range: r.reference_range ? String(r.reference_range).slice(0, 40) : null,
              confidence: typeof r.confidence === 'number' ? Math.max(0, Math.min(1, r.confidence)) : null
            }))
        : [];
      const reportDate = typeof parsed.report_date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(parsed.report_date)
        ? parsed.report_date
        : null;

      return { rows, report_date: reportDate };
    } catch (err) {
      lastError = err;
      if (err.code === 'NO_KEY') return null;
      // model retired / bad JSON / transient → next candidate
    }
  }

  console.warn(`[Gemini Vision] extraction failed after all candidates: ${lastError?.message}`);
  return null;
}

module.exports = { generateMedicineExplanation, extractLabReport, resolveTextModel };
