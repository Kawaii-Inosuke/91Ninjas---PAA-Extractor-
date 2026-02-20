// ─────────────────────────────────────────────────────────────
//  server.js – Express server serving the PAA frontend + API
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

// ─── Middleware ──────────────────────────────────────────────

app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

// ─── API Route ──────────────────────────────────────────────

app.post("/api/paa", async (req, res) => {
    const { keyword, region, url } = req.body;

    if (!keyword || !keyword.trim()) {
        return res.status(400).json({ error: "Keyword is required." });
    }

    const validRegions = ["us", "in"];
    const safeRegion = validRegions.includes(region) ? region : "us";

    try {
        // 1. Fetch PAA questions
        const results = await getPAA(keyword.trim(), safeRegion, url || undefined);

        // 2. Write to Google Sheet
        try {
            await appendToSheet(keyword.trim(), safeRegion, url || "", results);
        } catch (sheetErr) {
            console.error("⚠️  Sheet write failed:", sheetErr.message);
            // Don't fail the whole request if sheet write fails
        }

        return res.json({
            keyword,
            region: safeRegion,
            count: results.length,
            results,
            sheetUpdated: true,
        });
    } catch (err) {
        console.error("API error:", err.message);
        return res.status(500).json({ error: err.message });
    }
});

// ─── Start ──────────────────────────────────────────────────

app.listen(PORT, () => {
    console.log(`\n🚀  PAA Extractor running at http://localhost:${PORT}\n`);
});
