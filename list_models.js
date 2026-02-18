import { GoogleGenerativeAI } from "@google/generative-ai";
import dotenv from "dotenv";

dotenv.config();

const API_KEY = process.env.VITE_GEMINI_API_KEY || "";

if (!API_KEY || API_KEY === "YOUR_GEMINI_API_KEY_HERE") {
    console.error("❌ Error: VITE_GEMINI_API_KEY is not set in .env file.");
    process.exit(1);
}

const genAI = new GoogleGenerativeAI(API_KEY);

async function listModels() {
    try {
        console.log("🔍 Fetching available models...");
        // The SDK might not have a direct listModels on the main class in all versions, 
        // but we can use the fetch API to check the endpoint directly for the most accurate list
        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${API_KEY}`);
        const data = await response.json();

        if (data.error) {
            console.error("❌ API Error:", data.error.message);
            return;
        }

        console.log("\n✅ Available Models and Methods:");
        data.models.forEach(model => {
            console.log(`- ${model.name}`);
            console.log(`  Methods: ${model.supportedGenerationMethods.join(", ")}`);
            console.log(`  Description: ${model.description}\n`);
        });
    } catch (error) {
        console.error("❌ Script Error:", error.message);
    }
}

listModels();
