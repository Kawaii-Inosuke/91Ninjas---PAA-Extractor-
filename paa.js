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

/**
 * Fetch PAA questions for a **single keyword**.
 */
export async function getPAA(keyword, region = "us", url, maxQuestions = DEFAULT_MAX_QUESTIONS) {
  const km = getKeyManager();

  if (!keyword || typeof keyword !== "string") {
    throw new Error("❌  A valid keyword string is required.");
  }

  const query = buildQuery(keyword.trim(), url);
  console.log(`\n🔍  Searching PAA for: "${query}" (region: ${region}, target: ${maxQuestions} questions, keys: ${km.totalKeys})`);

  const seen = new Set();
  const results = [];
  const queue = [query];

  try {
    while (results.length < maxQuestions && queue.length > 0) {
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

/**
 * Fetch PAA questions for **multiple keywords** (bulk mode).
 */
export async function getBulkPAA(keywords, region = "us", url, maxQuestions = DEFAULT_MAX_QUESTIONS) {
  if (!Array.isArray(keywords) || keywords.length === 0) {
    throw new Error("❌  An array of keywords is required for bulk extraction.");
  }

  console.log(`\n📦  Bulk PAA extraction — ${keywords.length} keyword(s)\n${"─".repeat(50)}`);

  const results = {};

  for (const keyword of keywords) {
    results[keyword] = await getPAA(keyword, region, url, maxQuestions);
  }

  console.log(`\n${"─".repeat(50)}\n📦  Bulk extraction complete.\n`);
  return results;
}
