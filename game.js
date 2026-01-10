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
                throw new Error(`ファイルが見つかりません (${res.status}): ${path}`);
            }

            const text = await res.text();
            try {
                this.scenario = JSON.parse(text);
            } catch (jsonErr) {
                throw new Error(`JSON形式が正しくありません。\nパス: ${path}`);
            }

            if (this.scenario.characters) {
                const charPromises = this.scenario.characters.map(async (charOrPath) => {
                    if (typeof charOrPath === 'string') {
                        const fullPath = charOrPath.startsWith('.') ? charOrPath : `./${charOrPath}`;
                        const charRes = await fetch(fullPath);
                        if (!charRes.ok) throw new Error(`キャラファイル不在: ${fullPath}`);
                        return await charRes.json();
                    }
                    return charOrPath;
                });
                this.scenario.characters = await Promise.all(charPromises);
            }

            if (this.scenario.case) {
                document.getElementById('case-title').innerText = this.scenario.case.title || "No Title";
                document.getElementById('case-outline').innerText = this.scenario.case.outline || "No Outline";
            }
        } catch (e) {
            console.error("Failed to load scenario", e);
            document.getElementById('case-title').innerText = "Load Error";
            document.getElementById('case-outline').innerText = e.message;
            throw e;
        }
    }

    resetGame() {
        if (confirm("本当にリセットしますか？\n履歴や証拠がすべて失われます。")) {
            localStorage.clear();
            location.reload();
        }
    }

    loadState() {
        const saved = localStorage.getItem('mystery_game_state_v1');
        if (saved) {
            this.state = JSON.parse(saved);
        } else {
            if (this.scenario && this.scenario.evidences) {
                this.scenario.evidences.forEach(ev => {
                    if (ev.unlock_condition === 'start') this.addEvidence(ev.id);
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
        }
    }

    getCharacter(id) {
        return this.scenario.characters.find(c => c.id === id);
    }

    renderCharacterList() {
        if (!this.scenario || !this.scenario.characters) return;
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

    // 【修正点】Netlify Functions経由で通信し、履歴を渡すように変更
    async sendMessage() {
        const input = document.getElementById('chat-input');
        const text = input.value.trim();
        if (!text) return;

        input.value = '';
        this.appendMessage('user', text);

        const char = this.getCharacter(this.currentCharacterId);
        const systemPrompt = this.constructSystemPrompt(char);

        // 会話履歴をAIに渡す（Netlify側でトークン制限処理を行う）
        const history = this.state.history[this.currentCharacterId] || [];

        // ai.js の sendToAI を呼び出し（引数に history を追加）
        const responseText = await sendToAI(systemPrompt, text, history);

        this.appendMessage('model', responseText);
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
        const knownEvidences = (this.state.evidences || []).map(eid => {
            const e = (this.scenario.evidences || []).find(ev => ev.id === eid);
            return e ? `${e.name}: ${e.description}` : null;
        }).filter(Boolean).join("\n");

        const personality = Array.isArray(char.personality) ? char.personality.join("、") : char.personality;
        // background オブジェクトを文字列化
        const knowledge = JSON.stringify(char.background || {});
        const secrets = (char.secrets || char.hidden_story || []).join?.("\n") || "なし";
        const forbidden = (char.forbidden_reveals || []).join?.("\n") || "なし";

        return `
あなたはミステリーゲームの登場人物「${char.name}」として振る舞ってください。
以下の設定を厳守すること。

# キャラクター設定
性格: ${personality}
役割: ${char.role}
口調: ${char.talk_style}

# 背景知識
${knowledge}

# 秘密（絶対に自分から話さない）
${secrets}

# 禁止事項（聞かれても絶対に答えない・否定する）
${forbidden}

# 現在判明している証拠
${knownEvidences}

# ルール
- プレイヤーは探偵です。
- 設定にないことは「わかりません」と答えるか、はぐらかしてください。
- 決してAIとして振る舞わず、常に「${char.name}」として応答してください。
        `.trim();
    }

    updateAttributesUI() {
        if (!this.scenario || !this.scenario.evidences) return;
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
            // シナリオに応じた証拠解禁ロジック（例）
            if (ev.unlock_condition === 'talk_renzo_camera' && this.currentCharacterId === 'renzo') {
                if (userText.includes('カメラ') || userText.includes('レンズ')) {
                    this.addEvidence(ev.id);
                    alert(`【新証拠】\n${ev.name}`);
                }
            }
        });
    }

    startAccusation() {
        const culpritName = prompt("犯人だと思う人物名を入力してください：");
        if (!culpritName) return;

        const target = this.scenario.characters.find(c => c.name === culpritName);
        if (!target) {
            alert("そのような人物はいません。");
            return;
        }

        if (target.id === this.scenario.case.culprit || culpritName.includes("蓮三")) {
            alert(`【正解！】\n真犯人は ${target.name} でした。\n\n真実：\n${this.scenario.case.truth}`);
        } else {
            alert(`【不正解】\n${target.name} は犯人ではありません。`);
        }
    }
}

const game = new Game();
window.game = game;

document.addEventListener('DOMContentLoaded', () => {
    game.init();

    const accuseBtn = document.createElement('button');
    accuseBtn.innerText = '👉 犯人を指名する';
    accuseBtn.style.cssText = "display:block; width:90%; margin:20px auto; padding:12px; background:#d32f2f; color:white; border:none; border-radius:5px; font-weight:bold; cursor:pointer;";
    accuseBtn.onclick = () => game.startAccusation();
    document.querySelector('#main-menu .content').appendChild(accuseBtn);

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
