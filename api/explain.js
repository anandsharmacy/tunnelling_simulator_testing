const SERVER_ENV = globalThis.process?.env || {};
const DEFAULT_MODEL = SERVER_ENV.GEMINI_MODEL || "gemini-2.0-flash";
const GEMINI_API_URL =
  "https://generativelanguage.googleapis.com/v1beta/models";

function sendJson(res, statusCode, payload) {
  res.status(statusCode).json(payload);
}

function normalizeBody(body) {
  if (!body) return null;
  if (typeof body === "string") {
    try {
      return JSON.parse(body);
    } catch {
      return null;
    }
  }
  if (typeof body === "object") return body;
  return null;
}

function isFiniteNumber(value) {
  return typeof value === "number" && Number.isFinite(value);
}

function sanitizeText(value, maxLength = 240) {
  if (typeof value !== "string") return "";
  return value.replace(/\s+/g, " ").trim().slice(0, maxLength);
}

function validatePayload(payload) {
  if (!payload || typeof payload !== "object") {
    return "Missing explanation payload.";
  }

  const requiredText = [
    "particleType",
    "energyLabel",
    "barrierHeightLabel",
    "barrierWidthLabel",
    "regime",
  ];
  for (const key of requiredText) {
    if (!sanitizeText(payload[key])) return `Missing or invalid field: ${key}.`;
  }

  const requiredNumbers = [
    "T",
    "R",
    "ratio",
    "gamma",
    "delta",
    "lambda",
    "betaL",
  ];
  for (const key of requiredNumbers) {
    if (!isFiniteNumber(payload[key]))
      return `Missing or invalid numeric field: ${key}.`;
  }

  if (payload.messages && !Array.isArray(payload.messages)) {
    return "Invalid messages field.";
  }

  return null;
}

function buildPrompt(payload) {
  const messages = Array.isArray(payload.messages)
    ? payload.messages
        .map((message) => `- ${sanitizeText(String(message), 320)}`)
        .join("\n")
    : "";

  return [
    "You are helping explain a quantum tunneling calculation.",
    "Do not recompute the physics from scratch and do not invent alternate formulas.",
    "Use the provided deterministic results exactly as the basis for the explanation.",
    "Return strict JSON with this shape:",
    '{"summary":"...","regime":"...","interpretation":"...","practicalNote":"..."}',
    "Keep each value concise. Avoid markdown. Avoid lists. Avoid code fences.",
    "",
    `Particle: ${payload.particleType}`,
    `Energy: ${payload.energyLabel}`,
    `Barrier height: ${payload.barrierHeightLabel}`,
    `Barrier width: ${payload.barrierWidthLabel}`,
    `Transmission coefficient T: ${payload.T}`,
    `Reflection coefficient R: ${payload.R}`,
    `Energy ratio E/U0: ${payload.ratio}`,
    `Gamma: ${payload.gamma}`,
    `Penetration depth delta (m): ${payload.delta}`,
    `de Broglie wavelength lambda (m): ${payload.lambda}`,
    `Barrier regime marker betaL: ${payload.betaL}`,
    `Regime: ${payload.regime}`,
    messages
      ? `Deterministic calculator notes:\n${messages}`
      : "Deterministic calculator notes: none",
    "",
    "Interpret the result physically. Explain what the transmission value means, whether tunneling is strongly suppressed or not, and one practical takeaway.",
  ].join("\n");
}

function extractTextFromGemini(data) {
  const text = data?.candidates?.[0]?.content?.parts
    ?.map((part) => (typeof part?.text === "string" ? part.text : ""))
    .join("")
    .trim();
  return text || "";
}

function normalizeExplanation(text) {
  try {
    const parsed = JSON.parse(text);
    return {
      summary: sanitizeText(parsed.summary, 320),
      regime: sanitizeText(parsed.regime, 320),
      interpretation: sanitizeText(parsed.interpretation, 600),
      practicalNote: sanitizeText(parsed.practicalNote, 400),
    };
  } catch {
    return {
      summary: sanitizeText(text, 320),
      regime: "",
      interpretation: "",
      practicalNote: "",
    };
  }
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return sendJson(res, 405, { error: "Method not allowed." });
  }

  const apiKey = SERVER_ENV.GEMINI_API_KEY;
  if (!apiKey) {
    return sendJson(res, 503, {
      error: "Gemini API key is not configured on the server.",
    });
  }

  const payload = normalizeBody(req.body);
  const validationError = validatePayload(payload);
  if (validationError) {
    return sendJson(res, 400, { error: validationError });
  }

  const prompt = buildPrompt(payload);

  try {
    const response = await fetch(
      `${GEMINI_API_URL}/${DEFAULT_MODEL}:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          contents: [
            {
              role: "user",
              parts: [{ text: prompt }],
            },
          ],
          generationConfig: {
            temperature: 0.2,
            maxOutputTokens: 400,
            responseMimeType: "application/json",
          },
        }),
      },
    );

    const data = await response.json();
    if (!response.ok) {
      const message = sanitizeText(
        data?.error?.message || "Gemini request failed.",
        240,
      );
      return sendJson(res, response.status, { error: message });
    }

    const text = extractTextFromGemini(data);
    if (!text) {
      return sendJson(res, 502, {
        error: "Gemini returned an empty response.",
      });
    }

    return sendJson(res, 200, { explanation: normalizeExplanation(text) });
  } catch {
    return sendJson(res, 502, { error: "Unable to reach Gemini right now." });
  }
}
