import { GoogleGenerativeAI } from "@google/generative-ai";

const apiKey = process.env.GEMINI_API_KEY;
if (!apiKey) {
  throw new Error("GEMINI_API_KEY가 .env.local에 설정되어 있지 않습니다.");
}

const modelName = process.env.GEMINI_MODEL ?? "gemini-3.1-flash-lite";

export const genAI = new GoogleGenerativeAI(apiKey);

export const geminiModel = genAI.getGenerativeModel({
  model: modelName,
});
