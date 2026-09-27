require('dotenv').config();

/**
 * Call Gemini API at seed time to generate patient-friendly medicine explanations.
 * Falls back gracefully to null if no key is provided or if network/API calls fail.
 */
async function generateMedicineExplanation(name, composition) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey.trim() === '') {
    return null;
  }

  const prompt = `Explain in simple but professional language, suitable for a patient reading their own prescription, what the medicine ${name} (composition: ${composition}) is commonly used for. 2–3 sentences. Avoid alarming or overly casual language, and avoid jargon a non-doctor wouldn't know.`;

  try {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey.trim()}`;
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          maxOutputTokens: 200,
          temperature: 0.3
        }
      })
    });

    if (!response.ok) {
      const errText = await response.text();
      console.warn(`[Gemini Seed Warning] API returned ${response.status} for ${name}: ${errText.slice(0, 100)}`);
      return null;
    }

    const data = await response.json();
    const candidate = data.candidates?.[0]?.content?.parts?.[0]?.text;
    if (candidate) {
      return candidate.trim();
    }
    return null;
  } catch (error) {
    console.warn(`[Gemini Seed Warning] Failed to generate explanation for ${name}: ${error.message}`);
    return null;
  }
}

module.exports = { generateMedicineExplanation };
