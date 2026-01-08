import { CONFIG } from './config.js';

export async function sendToAI(systemPrompt, userPrompt) {
    if (CONFIG.AI_TYPE === 'gemini') {
        return callGemini(systemPrompt, userPrompt);
    } else if (CONFIG.AI_TYPE === 'gpt') {
        return callGPT(systemPrompt, userPrompt);
    } else {
        throw new Error('Unknown AI Type');
    }
}

async function callGemini(system, user) {
    if (!CONFIG.API_KEY) {
        return "エラー: APIキーが設定されていません。config.jsを確認してください。";
    }

    const url = `${CONFIG.API_URL_GEMINI}?key=${CONFIG.API_KEY}`;

    // Gemini 1.5 format
    const contents = [
        {
            role: "model",
            parts: [{ text: system }] // System prompt as initial context/model instruction (simplified for v1)
            // Note: Gemini System Instructions are handled differently in API, 
            // but for simple chat, putting it as first model turn or user turn works often, 
            // or use specific 'system_instruction' field if using that endpoint version.
            // Here we stick to simple content generation for MVP.
        },
        {
            role: "user",
            parts: [{ text: user }]
        }
    ];

    // Better System Instruction Handling for Gemini:
    // Actually, 'system_instruction' param is better.
    const body = {
        contents: [{
            role: "user",
            parts: [{ text: user }]
        }],
        system_instruction: {
            parts: [{ text: system }]
        }
    };

    try {
        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(body)
        });

        if (!response.ok) {
            const err = await response.json();
            console.error(err);
            return `エラー発生: ${err.error?.message || response.statusText}`;
        }

        const data = await response.json();
        const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
        return text || "応答がありませんでした。";

    } catch (e) {
        console.error(e);
        return `通信エラー: ${e.message}`;
    }
}

async function callGPT(system, user) {
    // Placeholder for Phase 4
    return "GPT接続はまだ実装されていません。";
}
