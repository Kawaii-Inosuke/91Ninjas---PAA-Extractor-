// ─────────────────────────────────────────────────────────────
//  sheets.js – Google Sheets helper for appending PAA results
//
//  Supports two auth modes:
//    - Local: reads credentials.json file
//    - Vercel: reads GOOGLE_CREDENTIALS env var (base64-encoded JSON)
// ─────────────────────────────────────────────────────────────

import { google } from "googleapis";
import { existsSync, readFileSync } from "fs";
import { fileURLToPath } from "url";
import path from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Get an authenticated Google Sheets client.
 * Tries credentials.json first (local dev), falls back to env vars (Vercel).
 */
function getAuthClient() {
    const credPath = path.join(__dirname, "credentials.json");

    // Option 1: Local file
    if (existsSync(credPath)) {
        return new google.auth.GoogleAuth({
            keyFile: credPath,
            scopes: ["https://www.googleapis.com/auth/spreadsheets"],
        });
    }

    // Option 2: Env vars (Vercel deployment)
    if (process.env.GOOGLE_CLIENT_EMAIL && process.env.GOOGLE_PRIVATE_KEY) {
        // Handle escaped newlines properly on Vercel
        const privateKey = process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, '\n');

        return new google.auth.GoogleAuth({
            credentials: {
                client_email: process.env.GOOGLE_CLIENT_EMAIL,
                private_key: privateKey,
                project_id: process.env.GOOGLE_PROJECT_ID
            },
            scopes: ["https://www.googleapis.com/auth/spreadsheets"],
        });
    }

    throw new Error(
        "❌  No Google credentials found. Provide credentials.json locally, or GOOGLE_CLIENT_EMAIL and GOOGLE_PRIVATE_KEY env vars."
    );
}

/**
 * Append PAA results to a Google Sheet.
 *
 * Columns: A = url, B = keyword, C = region, D = questions
 */
export async function appendToSheet(keyword, region, url, results) {
    const sheetId = process.env.GOOGLE_SHEET_ID;

    if (!sheetId) {
        throw new Error("❌  GOOGLE_SHEET_ID is missing from env.");
    }

    const auth = getAuthClient();
    const sheets = google.sheets({ version: "v4", auth });

    const rows = results.map((item) => [
        url || "",
        keyword,
        region,
        item.question,
    ]);

    if (rows.length === 0) {
        rows.push([url || "", keyword, region, "No PAA questions found"]);
    }

    console.log(`📤  Writing ${rows.length} row(s) to Google Sheet...`);

    await sheets.spreadsheets.values.append({
        spreadsheetId: sheetId,
        range: "Sheet1!A:D",
        valueInputOption: "USER_ENTERED",
        insertDataOption: "INSERT_ROWS",
        requestBody: { values: rows },
    });

    console.log(`✅  Google Sheet updated successfully.`);
}
