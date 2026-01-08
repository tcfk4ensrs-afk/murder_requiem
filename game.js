import { sendToAI } from './ai.js';

class Game {
    constructor() {
        this.scenario = null;
        this.currentCharacterId = null;
        this.state = {
            evidences: [],
            history: {}, // { charId: [{role, text}] }
            flags: {}
        };
    }

    async init() {
        try {
            console.log("Game initialising...");
            await this.loadScenario('./scenarios/case1.json');
            this.loadState();
            this.renderCharacterList();
            this.updateAttributesUI();
            console.log("Game initialised successfully.");
        } catch (e) {
            console.error("Critical error during init:", e);
            this.showError("初期化エラー: " + e.message);
        }
    }

    showError(msg) {
        const errLog = document.getElementById('error-log');
        if (errLog) {
            errLog.style.display = 'block';
            errLog.innerText += msg + "\n";
        }
        alert(msg);
    }

    async loadScenario(path) {
        try {
            const res = await fetch(path);
            if (!res.ok) {
                throw new Error(`HTTP Error: ${res.status} ${res.statusText} for ${path}`);
            }
            this.scenario = await res.json();

            // Allow characters to be file paths (Split JSON support)
            if (this.scenario.characters) {
                const charPromises = this.scenario.characters.map(async (charOrPath) => {
                    if (typeof charOrPath === 'string') {
                        const charRes = await fetch(charOrPath);
                        if (!charRes.ok) {
                            throw new Error(`Character JSON Error: ${charRes.status} at ${charOrPath}`);
                        }
                        return await charRes.json();
                    }
                    return charOrPath;
                });
                this.scenario.characters = await Promise.all(charPromises);
            }

            // Title setting
            document.getElementById('case-title').innerText = this.scenario.case.title;
            document.getElementById('case-outline').innerText = this.scenario.case.outline;
        } catch (e) {
            console.error("Failed to load scenario", e);
            const errorMsg = `シナリオ読み込みエラー: ${e.message}\n${path} が存在するか、パスが正しいか確認してください。`;
            alert(errorMsg);
            document.getElementById('case-title').innerText = "Load Error";
            document.getElementById('case-outline').innerText = errorMsg;
            document.getElementById('case-outline').style.color = "red";
        }
    }

    resetGame() {
        if (confirm("本当にリセットしますか？\nこれまでの会話履歴や証拠はすべて失われます。")) {
            localStorage.clear(); // Clear all data
            alert("リセットしました。ページを再読み込みします。");
            location.reload();
        }
    }

    loadState() {
        // ... (existing code, ensure it handles new structure if needed, but strict state loading is fine)
        const saved = localStorage.getItem('mystery_game_state_v1');
        if (saved) {
            this.state = JSON.parse(saved);
        } else {
            // Initial State
            // Unlock initial evidences
            if (this.scenario && this.scenario.evidences) {
                this.scenario.evidences.forEach(ev => {
                    if (ev.unlock_condition === 'start') {
                        this.addEvidence(ev.id);
                    }
                });
            }
        }
    }

    saveState() {
        localStorage.setItem('mystery_game_state_v1', JSON.stringify(this.state));
    }

    addEvidence(evidenceId) {
        if (!this.state.evidences.includes(evidenceId)) {
            this.state.evidences.push(evidenceId);
            this.saveState();
            // TODO: Notify user of new evidence
        }
    }

    getCharacter(id) {
        return this.scenario.characters.find(c => c.id === id);
    }

    renderCharacterList() {
        if (!this.scenario || !this.scenario.characters) {
            console.warn("Cannot render character list: scenario or characters missing.");
            return;
        }
        const list = document.getElementById('character-list');
        list.innerHTML = '';
        this.scenario.characters.forEach(char => {
            const div = document.createElement('div');
            div.className = 'character-card';
            div.innerHTML = `
                <div class="char-icon">👤</div>
                <div class="char-name">${char.name}</div>
                <div class="char-role">${char.role}</div>
            `;
            div.onclick = () => this.openInterrogation(char.id);
            list.appendChild(div);
        });
    }

    openInterrogation(charId) {
        this.currentCharacterId = charId;
        const char = this.getCharacter(charId);

        document.getElementById('main-menu').style.display = 'none';
        document.getElementById('interrogation-room').style.display = 'flex';

        document.getElementById('target-name').innerText = char.name;

        this.renderChatLog();
    }

    closeInterrogation() {
        this.currentCharacterId = null;
        document.getElementById('interrogation-room').style.display = 'none';
        document.getElementById('main-menu').style.display = 'block';
        this.updateAttributesUI();
    }

    renderChatLog() {
        const logContainer = document.getElementById('chat-log');
        logContainer.innerHTML = '';
        const history = this.state.history[this.currentCharacterId] || [];

        history.forEach(msg => {
            const msgDiv = document.createElement('div');
            msgDiv.className = `message ${msg.role}`;
            msgDiv.innerText = msg.text;
            logContainer.appendChild(msgDiv);
        });

        logContainer.scrollTop = logContainer.scrollHeight;
    }

    async sendMessage() {
        const input = document.getElementById('chat-input');
        const text = input.value.trim();
        if (!text) return;

        input.value = '';

        // Add User Message
        this.appendMessage('user', text);

        // Prepare System Prompt
        const char = this.getCharacter(this.currentCharacterId);
        const systemPrompt = this.constructSystemPrompt(char);

        // Call AI
        // Simplify history for API context (optional: for now just sending last turn or implementing full history later)
        // For context-aware AI, we should send history.
        // But sendToAI interface is (system, user). 
        // We might need to adjust sendToAI to accept history or handle it here by concatenating.
        // Let's concat history for now to fit the simple interface.
        const history = this.state.history[this.currentCharacterId] || [];
        // Take last few messages to keep context window manageable if needed, or all.
        const contextStr = history.map(h => `${h.role === 'user' ? 'プレイヤー' : char.name}: ${h.text}`).join("\n");

        // Actually, for better roleplay, we pass the raw user prompt but the 'System' prompt contains context?
        // Let's try combining:
        const combinedUserPrompt = `${contextStr}\nプレイヤー: ${text}\n(この発言に対する返答を生成してください)`;

        const responseText = await sendToAI(systemPrompt, combinedUserPrompt);

        this.appendMessage('model', responseText);

        // Check for evidence unlock conditions
        this.checkEvidenceUnlock(text, responseText);
    }

    appendMessage(role, text) {
        if (!this.state.history[this.currentCharacterId]) {
            this.state.history[this.currentCharacterId] = [];
        }
        this.state.history[this.currentCharacterId].push({ role, text });
        this.saveState();
        this.renderChatLog();
    }

    constructSystemPrompt(char) {
        // Collect known evidences
        const knownEvidences = (this.state.evidences || []).map(eid => {
            const e = (this.scenario.evidences || []).find(ev => ev.id === eid);
            return e ? `${e.name}: ${e.description}` : null;
        }).filter(Boolean).join("\n");

        const personality = Array.isArray(char.personality) ? char.personality.join("、") : char.personality;
        const knowledge = (char.knowledge || char.background || []).join?.("\n") || "なし";
        const secrets = (char.secrets || char.hidden_story || []).join?.("\n") || "なし";
        const lies = (char.lies || []).join?.("\n") || "なし";

        return `
あなたはミステリーゲームの登場人物「${char.name}」として振る舞ってください。
以下の設定を厳守すること。

# キャラクター設定
性格: ${personality}
役割: ${char.role}
口調: ${char.talk_style}

# 知っていること
${knowledge}

# 秘密
${secrets}

# 嘘
${lies}
(証拠を突きつけられるまでは嘘を突き通してください)

# 現在判明している証拠
${knownEvidences}

# ルール
- プレイヤーは探偵です。
- 設定にないことは「わかりません」と答えるか、キャラに合わせて適当にはぐらかしてください。
- 決してAIとして振る舞わないでください。
        `.trim();
    }

    updateAttributesUI() {
        if (!this.scenario) return;
        // Evidence list update
        const list = document.getElementById('evidence-list');
        list.innerHTML = '';
        if (this.state.evidences.length === 0) {
            list.innerHTML = '<p style="color:#666; font-size:0.9rem; padding:10px;">(まだ証拠はありません)</p>';
            return;
        }

        this.state.evidences.forEach(eid => {
            const ev = this.scenario.evidences.find(e => e.id === eid);
            if (ev) {
                const div = document.createElement('div');
                div.className = 'evidence-item';
                div.innerHTML = `<strong>${ev.name}</strong><br><small>${ev.description}</small>`;
                div.style.cssText = "padding:8px; border-bottom:1px solid #444; font-size:0.9rem;";
                list.appendChild(div);
            }
        });
    }

    checkEvidenceUnlock(userText, aiText) {
        if (!this.scenario || !this.scenario.evidences) return;

        this.scenario.evidences.forEach(ev => {
            if (this.state.evidences.includes(ev.id)) return;

            // Logic: talk_butler_lies -> unlock if talking to butler and keyword '鍵' (Key) appears
            if (ev.unlock_condition === 'talk_butler_lies') {
                if (this.currentCharacterId === 'butler' && (userText.includes('鍵') || aiText.includes('鍵'))) {
                    this.addEvidence(ev.id);
                    alert(`【新証拠発見】\n${ev.name}\n${ev.description}`);
                }
            }
        });
    }

    startAccusation() {
        const culpritName = prompt("犯人だと思う人物を入力してください：");
        if (!culpritName) return;

        const target = this.scenario.characters.find(c => c.name === culpritName);
        if (!target) {
            alert("そのような人物はいません。");
            return;
        }

        if (target.id === this.scenario.case.culprit) {
            alert(`【正解！】\nおめでとうございます！真犯人は ${target.name} でした。\n\n真実：\n${this.scenario.case.truth}`);
        } else {
            alert(`【不正解】\n${target.name} は犯人ではありません...。`);
        }
    }
}

const game = new Game();
window.game = game; // For debug

document.addEventListener('DOMContentLoaded', () => {
    game.init();

    // Add Accuse Button
    const accuseBtn = document.createElement('button');
    accuseBtn.innerText = '👉 犯人を指名する';
    accuseBtn.style.cssText = "display:block; width:90%; margin:20px auto; padding:12px; background:#d32f2f; color:white; border:none; border-radius:5px; font-weight:bold; cursor:pointer;";
    accuseBtn.onclick = () => game.startAccusation();
    document.querySelector('#main-menu .content').appendChild(accuseBtn);

    // Add Reset Button
    const resetBtn = document.createElement('button');
    resetBtn.innerText = '🔄 最初からやり直す';
    resetBtn.style.cssText = "display:block; width:90%; margin:10px auto; padding:10px; background:#555; color:white; border:none; border-radius:5px; cursor:pointer; font-size:0.9rem;";
    resetBtn.onclick = () => game.resetGame();
    document.querySelector('#main-menu .content').appendChild(resetBtn);

    document.getElementById('back-btn').onclick = () => game.closeInterrogation();
    document.getElementById('send-btn').onclick = () => game.sendMessage();
    document.getElementById('chat-input').addEventListener('keypress', (e) => {
        if (e.key === 'Enter') game.sendMessage();
    });
});
