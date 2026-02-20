import "dotenv/config";
import { appendToSheet } from "./sheets.js";

async function test() {
    try {
        await appendToSheet("test keyword", "us", "http://test.com", [{question: "Test Question?"}]);
        console.log("Success!");
    } catch (e) {
        console.error("Error:", e.message);
    }
}
test();
