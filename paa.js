// ─────────────────────────────────────────────────────────────
//  paa.js – Core module for extracting People Also Ask (PAA)
//           questions from Google via SerpAPI.
// ─────────────────────────────────────────────────────────────

import axios from "axios";

const SERPAPI_ENDPOINT = "https://serpapi.com/search.json";
const DEFAULT_MAX_QUESTIONS = 12;

// ─── Helpers ────────────────────────────────────────────────

/**
 * Extract the domain from a URL string.
 * e.g. "https://www.example.com/page" → "example.com"
 */
function extractDomain(url) {
  try {
    const { hostname } = new URL(url);
    return hostname.replace(/^www\./, "");
  } catch {
    console.warn(`⚠️  Invalid URL provided: "${url}" — ignoring site filter.`);
    return null;
  }
}

/**
 * Build the search query string.
 * If a URL is supplied the query becomes: keyword site:domain.com
 */
function buildQuery(keyword, url) {
  if (!url) return keyword;

  const domain = extractDomain(url);
  return domain ? `${keyword} site:${domain}` : keyword;
}

/**
 * Map a single SerpAPI related_question object to our output shape.
 */
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
 * Fetch a single page of PAA questions from SerpAPI.
 */
async function fetchPAAPage(query, region, apiKey) {
  const response = await axios.get(SERPAPI_ENDPOINT, {
    params: {
      engine: "google",
      q: query,
      gl: region,
      hl: "en",
      api_key: apiKey,
    },
    timeout: 15000,
  });

  return response.data?.related_questions || [];
}

// ─── Public API ─────────────────────────────────────────────

/**
 * Fetch PAA questions for a **single keyword**.
 * Recursively expands by searching returned questions to reach ~maxQuestions.
 *
 * @param {string}  keyword       – The search term.
 * @param {string}  region        – "us" or "in".
 * @param {string}  [url]         – Optional URL to scope via `site:`.
 * @param {number}  [maxQuestions] – Target number of PAA questions (default 12).
 * @returns {Promise<Array<{question:string, answer:string, link:string}>>}
 */
export async function getPAA(keyword, region = "us", url, maxQuestions = DEFAULT_MAX_QUESTIONS) {
  const apiKey = process.env.SERPAPI_KEY;

  if (!apiKey) {
    throw new Error(
      "❌  SERPAPI_KEY is not set. Please add it to your .env file."
    );
  }

  if (!keyword || typeof keyword !== "string") {
    throw new Error("❌  A valid keyword string is required.");
  }

  const query = buildQuery(keyword.trim(), url);
  console.log(`\n🔍  Searching PAA for: "${query}" (region: ${region}, target: ${maxQuestions} questions)`);

  const seen = new Set();       // track question text to avoid duplicates
  const results = [];           // final collection
  const queue = [query];        // queries to process

  try {
    while (results.length < maxQuestions && queue.length > 0) {
      const currentQuery = queue.shift();
      console.log(`   ↳ Querying: "${currentQuery}"`);

      const rawQuestions = await fetchPAAPage(currentQuery, region, apiKey);

      if (rawQuestions.length === 0) continue;

      for (const item of rawQuestions) {
        const q = item.question || "";
        if (!q || seen.has(q.toLowerCase())) continue;

        seen.add(q.toLowerCase());
        results.push(mapQuestion(item));

        // Add this question to the queue for expansion
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

    // Return whatever we collected so far
    return results;
  }
}

/**
 * Fetch PAA questions for **multiple keywords** (bulk mode).
 *
 * @param {string[]} keywords      – Array of search terms.
 * @param {string}   region        – "us" or "in".
 * @param {string}   [url]         – Optional URL to scope searches via `site:`.
 * @param {number}   [maxQuestions] – Target per keyword (default 12).
 * @returns {Promise<Record<string, Array<{question:string, answer:string, link:string}>>>}
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
