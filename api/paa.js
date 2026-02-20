// ─────────────────────────────────────────────────────────────
//  api/paa.js – Vercel serverless function for PAA extraction
// ─────────────────────────────────────────────────────────────

import { getPAA } from "../paa.js";
import { appendToSheet } from "../sheets.js";

export default async function handler(req, res) {
    if (req.method !== "POST") {
        return res.status(405).json({ error: "Method not allowed" });
    }

    const { keyword, region, url } = req.body;

    if (!keyword || !keyword.trim()) {
        return res.status(400).json({ error: "Keyword is required." });
    }

    const validRegions = ["us", "in"];
    const safeRegion = validRegions.includes(region) ? region : "us";

    try {
        const results = await getPAA(keyword.trim(), safeRegion, url || undefined);

        try {
            await appendToSheet(keyword.trim(), safeRegion, url || "", results);
        } catch (sheetErr) {
            console.error("⚠️  Sheet write failed:", sheetErr.message);
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
}
