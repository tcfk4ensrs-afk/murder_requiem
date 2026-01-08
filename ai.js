
let LOC_CONFIG = {
    AI_TYPE: 'gemini',
    API_KEY: '',
    API_URL_GEMINI: 'https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent',
};

let configLoaded = false;

async function loadConfig() {
    if (configLoaded) return;
    try {
        const module = await import('./config.js');
        if (module.CONFIG) {
            LOC_CONFIG = { ...LOC_CONFIG, ...module.CONFIG };
        }
    } catch (e) {
        console.log('Running in generic mode (no config.js found).');
        const savedKey = localStorage.getItem('mystery_ai_api_key');
        if (savedKey) {
            LOC_CONFIG.API_KEY = savedKey;
        }
    }
    configLoaded = true;
}

export async function sendToAI(systemPrompt, userPrompt) {
    await loadConfig();

    // Check Config
    if (!LOC_CONFIG.API_KEY || LOC_CONFIG.API_KEY === 'YOUR_API_KEY_HERE') {
        const key = prompt("Google Gemini APIキーを入力してください:\n(ブラウザに保存され、外部には送信されません)");
        if (key) {
            LOC_CONFIG.API_KEY = key;
            localStorage.setItem('mystery_ai_api_key', key);
        } else {
            return "エラー: APIキーが入力されませんでした。";
        }
    }

    if (LOC_CONFIG.AI_TYPE === 'gemini') {
        return callGemini(systemPrompt, userPrompt);
    } // ...
}

async function callGemini(system, user) {
    // LOC_CONFIG used here
    const url = `${LOC_CONFIG.API_URL_GEMINI}?key=${LOC_CONFIG.API_KEY}`;


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
