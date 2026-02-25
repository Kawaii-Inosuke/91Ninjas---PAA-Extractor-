// ─────────────────────────────────────────────────────────────
//  api/paa.js – Vercel serverless function for PAA extraction
//  Supports comma-separated keywords with retry until 8 unique Qs.
// ─────────────────────────────────────────────────────────────

import { getPAA } from "../paa.js";
import { appendToSheet } from "../sheets.js";

const MIN_QUESTIONS = 9;
const MAX_QUESTIONS = 12;
const MAX_RUNS = 6;

/**
 * Process a single keyword: keep scraping until MIN_QUESTIONS
 * unique questions are collected (capped at MAX_QUESTIONS), then write once to the sheet.
 */
async function processKeyword(kw, region, url) {
    const collected = [];
    const seen = new Set();
    let run = 0;

    while (collected.length < MIN_QUESTIONS && run < MAX_RUNS) {
        run++;
        const results = await getPAA(kw, region, url || undefined, 12, seen);

        if (results.length === 0) continue;

        for (const item of results) {
            const qLower = item.question.toLowerCase();
            if (seen.has(qLower)) continue;
            seen.add(qLower);
            collected.push(item);
        }
    }

    const final = collected.slice(0, MAX_QUESTIONS);

    if (final.length > 0) {
        try {
            await appendToSheet(kw, region, url || "", final);
        } catch (e) {
            console.error(`⚠️  Sheet write failed for "${kw}":`, e.message);
        }
    } else {
        try { await appendToSheet(kw, region, url || "", []); } catch { }
    }

    return final;
}

export default async function handler(req, res) {
    if (req.method !== "POST") {
        return res.status(405).json({ error: "Method not allowed" });
    }

    const { keyword, region, url } = req.body;

    if (!keyword || !keyword.trim()) {
        return res.status(400).json({ error: "At least one keyword is required." });
    }

    const validRegions = ["us", "in"];
    const safeRegion = validRegions.includes(region) ? region : "us";

    // Split comma-separated keywords and deduplicate
    const keywords = [...new Set(
        keyword.split(",").map((k) => k.trim()).filter(Boolean)
    )];

    try {
        const grouped = {};
        let totalCount = 0;

        for (const kw of keywords) {
            grouped[kw] = await processKeyword(kw, safeRegion, url);
            totalCount += grouped[kw].length;
        }

        return res.json({
            keywords,
            region: safeRegion,
            totalCount,
            grouped,
            sheetUpdated: true,
        });
    } catch (err) {
        console.error("API error:", err.message);
        return res.status(500).json({ error: err.message });
    }
}

