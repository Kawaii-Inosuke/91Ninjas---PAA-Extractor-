// ─────────────────────────────────────────────────────────────
//  paa.js – Core module for extracting People Also Ask (PAA)
//           questions from Google via SerpAPI.
//
//  Supports multiple API keys (comma-separated in SERPAPI_KEY).
//  Auto-rotates to the next key when one hits its rate limit.
// ─────────────────────────────────────────────────────────────

import axios from "axios";

const SERPAPI_ENDPOINT = "https://serpapi.com/search.json";
const DEFAULT_MAX_QUESTIONS = 12;

// ─── API Key Manager ────────────────────────────────────────

class KeyManager {
  constructor() {
    const raw = process.env.SERPAPI_KEY || "";
    this.keys = raw.split(",").map((k) => k.trim()).filter(Boolean);
    this.index = 0;
    this.exhausted = new Set(); // keys that hit their limit
  }

  get current() {
    if (this.keys.length === 0) {
      throw new Error("❌  SERPAPI_KEY is not set. Add it to your .env file.");
    }
    return this.keys[this.index];
  }

  /** Rotate to the next available key. Returns false if all keys are exhausted. */
  rotate() {
    this.exhausted.add(this.index);

    // Find next non-exhausted key
    for (let i = 0; i < this.keys.length; i++) {
      const next = (this.index + 1 + i) % this.keys.length;
      if (!this.exhausted.has(next)) {
        this.index = next;
        console.log(`🔄  Rotated to API key #${next + 1} of ${this.keys.length}`);
        return true;
      }
    }

    console.error("❌  All API keys have been exhausted.");
    return false;
  }

  get totalKeys() {
    return this.keys.length;
  }
}

// Singleton — created once when the module loads
let keyManager;
function getKeyManager() {
  if (!keyManager) keyManager = new KeyManager();
  return keyManager;
}

// ─── Helpers ────────────────────────────────────────────────

function extractDomain(url) {
  try {
    const { hostname } = new URL(url);
    return hostname.replace(/^www\./, "");
  } catch {
    console.warn(`⚠️  Invalid URL provided: "${url}" — ignoring site filter.`);
    return null;
  }
}

function buildQuery(keyword, url) {
  if (!url) return keyword;
  const domain = extractDomain(url);
  return domain ? `${keyword} site:${domain}` : keyword;
}

function mapQuestion(item) {
  return {
    question: item.question || "",
    answer:
      item.snippet ||
      item.answer ||
      item.snippet_highlighted_words?.join(" ") ||
      "No answer available",
    link: item.link || item.displayed_link || "",
  };
}

/**
 * Fetch a single page of PAA questions.
 * If the key hits its limit (429 or error message), auto-rotates and retries once.
 */
async function fetchPAAPage(query, region, km) {
  try {
    const response = await axios.get(SERPAPI_ENDPOINT, {
      params: {
        engine: "google",
        q: query,
        gl: region,
        hl: "en",
        api_key: km.current,
      },
      timeout: 15000,
    });

    // SerpAPI sometimes returns 200 with an error message in the body
    if (response.data?.error) {
      const errMsg = response.data.error.toLowerCase();
      if (errMsg.includes("limit") || errMsg.includes("quota") || errMsg.includes("exceeded")) {
        console.warn(`⚠️  Key #${km.index + 1} hit its limit.`);
        if (km.rotate()) {
          return fetchPAAPage(query, region, km); // retry with next key
        }
      }
      return [];
    }

    return response.data?.related_questions || [];
  } catch (error) {
    // 429 Too Many Requests — rotate key
    if (error.response?.status === 429) {
      console.warn(`⚠️  Key #${km.index + 1} rate limited (429).`);
      if (km.rotate()) {
        return fetchPAAPage(query, region, km);
      }
    }
    throw error;
  }
}

// ─── Public API ─────────────────────────────────────────────

const MIN_QUESTIONS = 8;

/**
 * Generate fallback queries to expand PAA results when the queue runs dry.
 */
function generateFallbackQueries(keyword) {
  const prefixes = [
    "what is", "how to", "why", "best", "how does",
    "what are", "is it worth", "tips for", "guide to",
  ];
  return prefixes.map((p) => `${p} ${keyword}`);
}

/**
 * Fetch PAA questions for a **single keyword**.
 *
 * @param {string}      keyword
 * @param {string}      region       - "us" | "in"
 * @param {string}      [url]        - optional site filter
 * @param {number}      maxQuestions  - target count (default 12)
 * @param {Set<string>} [exclude]    - lowercased question strings to skip
 *                                     (useful for top-up retries)
 */
export async function getPAA(keyword, region = "us", url, maxQuestions = DEFAULT_MAX_QUESTIONS, exclude = new Set()) {
  const km = getKeyManager();

  if (!keyword || typeof keyword !== "string") {
    throw new Error("❌  A valid keyword string is required.");
  }

  const query = buildQuery(keyword.trim(), url);
  console.log(`\n🔍  Searching PAA for: "${query}" (region: ${region}, target: ${maxQuestions}, min: ${MIN_QUESTIONS}, keys: ${km.totalKeys})`);

  const seen = new Set(exclude); // start with excluded questions
  const results = [];
  const queue = [query];

  // Prepare fallback queries in case primary queue dries up
  const fallbacks = generateFallbackQueries(keyword.trim());
  let fallbackIndex = 0;

  try {
    while (results.length < maxQuestions) {
      // If primary queue is empty, try fallback queries
      if (queue.length === 0) {
        if (results.length >= MIN_QUESTIONS || fallbackIndex >= fallbacks.length) {
          break;
        }
        const fb = fallbacks[fallbackIndex++];
        console.log(`   ↳ Queue empty (${results.length}/${maxQuestions}), trying fallback: "${fb}"`);
        queue.push(buildQuery(fb, url));
      }

      const currentQuery = queue.shift();
      console.log(`   ↳ Querying: "${currentQuery}"`);

      const rawQuestions = await fetchPAAPage(currentQuery, region, km);

      if (rawQuestions.length === 0) continue;

      for (const item of rawQuestions) {
        const q = item.question || "";
        if (!q || seen.has(q.toLowerCase())) continue;

        seen.add(q.toLowerCase());
        results.push(mapQuestion(item));

        if (results.length < maxQuestions) {
          queue.push(q);
        }
      }
    }

    if (results.length === 0) {
      console.log("ℹ️  No PAA questions found for this query.");
    } else {
      console.log(`✅  Collected ${results.length} unique PAA question(s).`);
    }

    return results;
  } catch (error) {
    if (error.response) {
      console.error(
        `❌  SerpAPI returned ${error.response.status}: ${error.response.data?.error || error.response.statusText
        }`
      );
    } else if (error.request) {
      console.error("❌  No response received from SerpAPI (timeout / network issue).");
    } else {
      console.error(`❌  Request setup error: ${error.message}`);
    }

    return results;
  }
}

