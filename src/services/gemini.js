import { GoogleGenerativeAI } from "@google/generative-ai";

const API_KEY = import.meta.env.VITE_GEMINI_API_KEY || "";
const genAI = new GoogleGenerativeAI(API_KEY);

export const analyzeReceipt = async (imageFile, decodeWalmart = false) => {
    if (!API_KEY) {
        throw new Error("Gemini API key is missing. Please add VITE_GEMINI_API_KEY to your .env file.");
    }

    const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash-lite" });

    const convertFileToBase64 = (file) => {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.readAsDataURL(file);
            reader.onload = () => resolve(reader.result.split(',')[1]);
            reader.onerror = (error) => reject(error);
        });
    };

    const base64Image = await convertFileToBase64(imageFile);

    const prompt = `
    Extract the items, subtotal, tax, and total from this receipt image.
    
    CRITICAL INSTRUCTION:
    Receipt items use very abbreviated codes (like "GV WHOLE GAL", "OIK PRO VANI", "BNLS CK BRST"). 
    You MUST use your internal knowledge of retailer inventory (especially Walmart/Great Value) to decode these into clear, human-readable names.
    
    ${decodeWalmart ? `
    REQUIRED FORMAT: "ABBREVIATED NAME (Full Decoded Name)"
    Example: "GV WHOLE GAL (Great Value Whole Milk Gallon)"
    Example: "BNLS CK BRST (Boneless Chicken Breast)"
    Example: "OIK PRO VANI (Oikos Pro Vanilla Yogurt)"
    ` : `
    REQUIRED FORMAT: Just the "Full Decoded Name"
    Example: "Great Value Whole Milk Gallon"
    Example: "Boneless Chicken Breast"
    Example: "Oikos Pro Vanilla Yogurt"
    `}
    
    Return ONLY a valid JSON object with the following structure:
    {
      "items": [
        { "name": "Name following the format above", "price": 0.00 }
      ],
      "subtotal": 0.00,
      "tax": 0.00,
      "total": 0.00
    }
    Ensure all prices are numbers, not strings. Do not include any markdown formatting like \`\`\`json.
  `;

    console.log("📄 Prompt sent to Gemini:", prompt);

    const result = await model.generateContent([
        prompt,
        {
            inlineData: {
                data: base64Image,
                mimeType: imageFile.type,
            },
        },
    ]);

    const response = await result.response;
    const text = response.text();

    try {
        // Remove potential markdown blocks if Gemini includes them
        const jsonStr = text.replace(/```json/g, "").replace(/```/g, "").trim();
        const data = JSON.parse(jsonStr);
        console.log("📄 Extracted Receipt JSON:", data);
        return data;
    } catch (error) {
        console.error("Failed to parse Gemini response:", text);
        throw new Error("Could not parse receipt data. Please try again or enter manually.");
    }
};

export const autoAssignItems = async (receiptData, people, userPrompt, currentAssignments = {}) => {
    if (!API_KEY) {
        throw new Error("Gemini API key is missing.");
    }

    const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash-lite" });

    const prompt = `
    You are an AI assistant helping to split a bill. 
    
    RECEIPT DATA:
    ${JSON.stringify(receiptData, null, 2)}
    
    FRIENDS LIST:
    ${people.join(", ")}
    
    CURRENT ASSIGNMENTS (Item ID -> [Friend Names]):
    ${JSON.stringify(currentAssignments, null, 2)}
    
    USER NEW INSTRUCTION:
    "${userPrompt}"
    
    TASK:
    Update the assignments based on the new instruction. 
    - You can ADD people to items, REMOVE people, or OVERWRITE the logic.
    - If the instruction is "add X to Y", keep existing assignments for Y and add X.
    - If the instruction is "X doesn't share Y", remove X from Y.
    - If it's a completely new split rule (e.g. "everyone shares everything"), ignore the current assignments and start fresh.
    - Items like Apple, Banana, Orange, Grapes, Strawberry, Tomato, Onion, Garlic (produce/fruits/veggies) should be identified correctly.
    
    Return ONLY a JSON object where keys are item IDs (strings) and values are arrays of friend names.
    Return the FULL updated state of all assignments.
    `;

    const result = await model.generateContent(prompt);
    const response = await result.response;
    const text = response.text();

    try {
        const jsonStr = text.replace(/```json/g, "").replace(/```/g, "").trim();
        return JSON.parse(jsonStr);
    } catch (error) {
        console.error("Failed to parse AI assignment:", text);
        throw new Error("AI could not process the assignment logic.");
    }
};
