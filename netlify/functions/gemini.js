const API_KEY = process.env.GEMINI_API_KEY;
// 修正後のURL形式：末尾を gemini-1.5-flash-latest に固定します
const API_URL = "https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash-latest:generateContent";

export const handler = async (event) => {
    // POSTメソッド以外は受け付けない
    if (event.httpMethod !== "POST") {
        return { statusCode: 405, body: "Method Not Allowed" };
    }

    try {
        const { systemPrompt, userPrompt, history } = JSON.parse(event.body);

        // 【トークン節約】履歴を直近の10件（約5往復）に絞る
        const limitedHistory = (history || []).slice(-10);

        // APIに送るメッセージ形式の構築
        const contents = limitedHistory.map(h => ({
            role: h.role === 'user' ? 'user' : 'model',
            parts: [{ text: h.text }]
        }));
        
        // 最新の発言を追加
        contents.push({
            role: 'user',
            parts: [{ text: userPrompt }]
        });

        const body = {
            contents: contents,
            system_instruction: {
                parts: [{ text: systemPrompt }]
            }
        };

        const response = await fetch(`${API_URL}?key=${API_KEY}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body)
        });

        const data = await response.json();

        if (!response.ok) {
            return {
                statusCode: response.status,
                body: JSON.stringify({ error: data.error?.message || "Gemini API Error" })
            };
        }

        return {
            statusCode: 200,
            body: JSON.stringify({ text: data.candidates?.[0]?.content?.parts?.[0]?.text })
        };
    } catch (e) {
        return {
            statusCode: 500,
            body: JSON.stringify({ error: e.message })
        };
    }
};
