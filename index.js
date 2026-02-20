// ─────────────────────────────────────────────────────────────
//  index.js – CLI entry point for the PAA extractor
//
//  Usage:
//    node index.js <keyword> [--region us|in] [--url https://...]
//
//  Examples:
//    node index.js "best CRM software"
//    node index.js "best CRM software" --region in
//    node index.js "best CRM software" --region us --url https://hubspot.com
// ─────────────────────────────────────────────────────────────

import "dotenv/config";
import { getPAA } from "./paa.js";

// ─── Parse CLI arguments ────────────────────────────────────

function parseArgs(argv) {
    const args = argv.slice(2); // remove node + script path

    if (args.length === 0) {
        console.error("Usage:  node index.js <keyword> [--region us|in] [--url <url>]\n");
        console.error("Example:  node index.js \"best CRM software\" --region us");
        process.exit(1);
    }

    const keyword = args[0];
    let region = "us";
    let url = undefined;

    for (let i = 1; i < args.length; i++) {
        if (args[i] === "--region" && args[i + 1]) {
            region = args[++i];
        } else if (args[i] === "--url" && args[i + 1]) {
            url = args[++i];
        }
    }

    return { keyword, region, url };
}

// ─── Helpers ────────────────────────────────────────────────

function printJSON(data) {
    console.log(`\n${"═".repeat(60)}`);
    console.log("  Results");
    console.log(`${"═".repeat(60)}`);
    console.log(JSON.stringify(data, null, 2));
}

// ─── Main ───────────────────────────────────────────────────

async function main() {
    const { keyword, region, url } = parseArgs(process.argv);

    console.log(`\n🚀  PAA Extractor`);
    console.log(`   Keyword : ${keyword}`);
    console.log(`   Region  : ${region}`);
    console.log(`   URL     : ${url || "(none)"}`);

    try {
        const results = await getPAA(keyword, region, url);
        printJSON(results);
        console.log(`\n📊  Total: ${results.length} PAA question(s)\n`);
    } catch (error) {
        console.error("\n💥  Fatal error:", error.message);
        process.exit(1);
    }
}

main();
