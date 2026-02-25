// ─────────────────────────────────────────────────────────────
//  server.js – Express server serving the PAA frontend + API
//  Supports multiple comma-separated keywords with auto-retry.
// ─────────────────────────────────────────────────────────────

import "dotenv/config";
import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import { getPAA } from "./paa.js";
import { appendToSheet } from "./sheets.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

const MIN_QUESTIONS = 9;     // keep retrying until at least this many unique Qs
const MAX_QUESTIONS = 12;    // cap — never collect more than this
const MAX_RUNS = 6;          // safety cap — avoid infinite loops / API burn

// ─── Middleware ──────────────────────────────────────────────

app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

// ─── Per-keyword pipeline ───────────────────────────────────

/**
 * Process a single keyword:
 *  1. Keep scraping PAA until we have TARGET_QUESTIONS unique questions.
 *  2. Deduplicate across runs using a Set.
 *  3. Write to the Google Sheet only ONCE, after collecting enough.
 *  4. Safety cap at MAX_RUNS to prevent infinite loops.
 */
async function processKeyword(kw, region, url) {
    const collected = [];      // temporary in-memory store
    const seen = new Set();    // lowercase question strings for dedup
    let run = 0;

    while (collected.length < MIN_QUESTIONS && run < MAX_RUNS) {
        run++;
        console.log(`🔍  Run #${run} for "${kw}" (have ${collected.length}/${MIN_QUESTIONS})`);

        const results = await getPAA(kw, region, url || undefined, 12, seen);

        if (results.length === 0) {
            console.log(`   ↳ Run #${run} returned 0 new questions.`);
            continue;
        }

        for (const item of results) {
            const qLower = item.question.toLowerCase();
            if (seen.has(qLower)) continue;
            seen.add(qLower);
            collected.push(item);
        }

        console.log(`   ↳ Now have ${collected.length} unique question(s).`);
    }

    // ── Single sheet write after all runs ────────────────────
    if (collected.length > 0) {
        const final = collected.slice(0, MAX_QUESTIONS);
        try {
            await appendToSheet(kw, region, url || "", final);
            console.log(`📤  Wrote ${final.length} question(s) for "${kw}" to sheet.`);
        } catch (e) {
            console.error(`⚠️  Sheet write failed for "${kw}":`, e.message);
        }
        console.log(`📊  Final count for "${kw}": ${final.length} question(s).\n`);
        return final;
    }

    // ── 0 questions after all retries ────────────────────────
    console.log(`⚠️  No questions found for "${kw}" after ${MAX_RUNS} runs.`);
    try {
        await appendToSheet(kw, region, url || "", []);
    } catch (e) {
        console.error(`⚠️  Sheet write failed for "${kw}":`, e.message);
    }
    console.log(`📊  Final count for "${kw}": 0 question(s).\n`);
    return [];
}

// ─── API Route ──────────────────────────────────────────────

app.post("/api/paa", async (req, res) => {
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

    console.log(`\n📦  Processing ${keywords.length} keyword(s): [${keywords.join(", ")}]\n${"─".repeat(50)}`);

    try {
        const grouped = {};
        let totalCount = 0;

        // Process each keyword sequentially with retry + top-up + sheet writes
        for (const kw of keywords) {
            grouped[kw] = await processKeyword(kw, safeRegion, url);
            totalCount += grouped[kw].length;
        }

        console.log(`${"─".repeat(50)}\n📦  All keywords done — ${totalCount} total questions.\n`);

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
});

// ─── Start ──────────────────────────────────────────────────

if (process.env.NODE_ENV !== "production") {
    app.listen(PORT, () => {
        console.log(`\n🚀  PAA Extractor running at http://localhost:${PORT}\n`);
    });
}

export default app;
