import { sendToAI } from './ai.js';

class Game {
    constructor() {
        this.scenario = null;
        this.currentCharacterId = null;
        this.isAiThinking = false; 
        this.state = {
            difficulty: 'detective', // デフォルト：探偵モード
            evidences: [],
            history: {}, 
            flags: {},
            unlockedLocations: [6, 7, 8, 9, 10], 
            visitedLocations: [], 
            currentCoolingDown: false, 
            unlockTimestamps: {
                last_exploration: 0 
            },    
            startTime: Date.now()    
        };
        this.timerInterval = null;
    }

    // --- 初期化ロジック ---
    async init() {
        try {
            console.log("Game initialising...");
            await this.loadScenario('./scenarios/case1.json');
            this.loadState(); // ここで difficulty も読み込まれる
            this.renderCharacterList(); 
            this.updateAttributesUI();  
            this.updateDifficultyUI(); // 追加：起動時にUIを同期
            this.startGlobalTimer();
            console.log("Game initialised successfully.");
        } catch (e) {
            console.error("Critical error during init:", e);
            this.showError("初期化エラー: " + e.message);
        }
    }

    // --- モード管理（難易度） ---
    setDifficulty(mode) {
        this.state.difficulty = mode;
        this.saveState();
        this.updateDifficultyUI();
    }

    updateDifficultyUI() {
        const btnDet = document.getElementById('mode-detective');
        const btnMas = document.getElementById('mode-master');
        if (!btnDet || !btnMas) return;

        if (this.state.difficulty === 'master') {
            btnMas.classList.add('mode-active');
            btnDet.classList.remove('mode-active');
        } else {
            btnDet.classList.add('mode-active');
            btnMas.classList.remove('mode-active');
        }
    }

    // --- メッセージ・AI通信ロジック ---
    async sendMessage() {
        const input = document.getElementById('chat-input');
        const text = input.value.trim();
        if (!text || this.isAiThinking) return;

        this.isAiThinking = true;
        input.value = '';
        this.appendMessage('user', text);

        const logContainer = document.getElementById('chat-log');
        const loadingDiv = document.createElement('div');
        loadingDiv.className = 'message model loading-indicator';
        loadingDiv.innerText = '考え中...';
        logContainer.appendChild(loadingDiv);
        logContainer.scrollTop = logContainer.scrollHeight;

        const char = this.getCharacter(this.currentCharacterId);
        const history = (this.state.history || {})[this.currentCharacterId] || [];
        const recentHistory = history.slice(-10);

        try {
            const responseText = await sendToAI(this.constructSystemPrompt(char), text, recentHistory);
            loadingDiv.remove();
            
            // AIの応答をパースして表示（モード判定を含む）
            this.appendMessage('model', responseText);
            
            // 証拠品のアンロックチェック
            this.checkEvidenceUnlock(text, responseText);
        } catch (e) {
            loadingDiv.innerText = "通信エラーが発生しました。";
            console.error(e);
        } finally {
            this.isAiThinking = false;
        }
    }

    appendMessage(role, text) {
        if (!this.state.history[this.currentCharacterId]) {
            this.state.history[this.currentCharacterId] = [];
        }

        let displayOuter = text;
        let displayInner = "";

        // AIの応答(model)から発言と内心を分離
        if (role === 'model') {
            const outerMatch = text.match(/outer_voice[:：]\s*([\s\S]*?)(?=inner_voice|$)/i);
            const innerMatch = text.match(/inner_voice[:：]\s*([\s\S]*)/i);
            
            displayOuter = outerMatch ? outerMatch[1].trim() : text;
            displayInner = innerMatch ? innerMatch[1].trim() : "";
        }

        // 全データを履歴に保存
        this.state.history[this.currentCharacterId].push({ 
            role, 
            text, 
            displayOuter, 
            displayInner 
        });
        this.saveState();

        // 描画実行
        this.renderSingleMessage(role, displayOuter, displayInner);
    }

    renderSingleMessage(role, outerText, innerText = "") {
        const logContainer = document.getElementById('chat-log');
        const msgDiv = document.createElement('div');
        msgDiv.className = `message ${role}`;

        let html = `<div>${outerText}</div>`;

        // 名探偵モード(master)の場合のみ、内心を表示する
        if (role === 'model' && this.state.difficulty === 'master' && innerText) {
            html += `
                <div class="inner-thought" style="font-size: 0.8rem; color: #888; margin-top: 8px; border-top: 1px dotted #444; padding-top: 5px; font-style: italic;">
                    （内心：${innerText}）
                </div>`;
        }

        msgDiv.innerHTML = html;
        logContainer.appendChild(msgDiv);
        logContainer.scrollTop = logContainer.scrollHeight;
    }

    // --- シナリオ・証拠品・探索ロジック ---
    loadState() {
        const saved = localStorage.getItem('mystery_game_state_v1');
        if (saved) {
            const parsed = JSON.parse(saved);
            this.state = { ...this.state, ...parsed };
        } else {
            this.state.startTime = Date.now();
        }

        // 初期証拠(start)の自動登録
        if (this.scenario && this.scenario.evidences) {
            this.scenario.evidences.forEach(ev => {
                if (ev.unlock_condition === 'start' && !this.state.evidences.includes(ev.id)) {
                    this.state.evidences.push(ev.id);
                }
            });
            this.saveState();
        }
    }

    saveState() {
        localStorage.setItem('mystery_game_state_v1', JSON.stringify(this.state));
    }

    addEvidence(evidenceId) {
        if (!this.state.evidences.includes(evidenceId)) {
            this.state.evidences.push(evidenceId);
            this.saveState();

            const ev = (this.scenario.evidences || []).find(e => e.id === evidenceId);
            if (ev) {
                this.showEvidenceCutin(ev.name);
            }
        }
    }

    showEvidenceCutin(evidenceName) {
        const oldCutin = document.querySelector('.evidence-cutin');
        if (oldCutin) oldCutin.remove();

        const cutin = document.createElement('div');
        cutin.className = 'evidence-cutin';
        cutin.innerHTML = `<h2>EVIDENCE UNLOCKED</h2><p>${evidenceName}</p>`;
        document.body.appendChild(cutin);

        setTimeout(() => { if (cutin.parentNode) cutin.remove(); }, 2500);
    }

    checkEvidenceUnlock(userText, aiText) {
        if (!this.scenario || !this.scenario.evidences) return;

        this.scenario.evidences.forEach(ev => {
            if (this.state.evidences.includes(ev.id)) return;
            if (ev.unlock_condition === "start") return;

            const conditionParts = ev.unlock_condition.split(':');
            if (conditionParts.length !== 2) return;

            const targetCharId = conditionParts[0];
            const keyword = conditionParts[1];

            if (this.currentCharacterId === targetCharId && aiText.includes(keyword)) {
                this.addEvidence(ev.id);
                const charName = this.getCharacter(targetCharId).name;
                setTimeout(() => {
                    this.appendMessage('system', `【分析完了】${charName}の発言から重要な証拠「${ev.name}」を入手しました。`);
                    this.updateAttributesUI();
                }, 600);
            }
        });
    }

    // --- 以下、既存のUI/探索/告発メソッド群 ---

    startGlobalTimer() {
        if (this.timerInterval) clearInterval(this.timerInterval);
        this.timerInterval = setInterval(() => {
            this.updateTimerDisplay();
            this.checkLocationUnlocks(); 
        }, 1000);
    }

    updateTimerDisplay() {
        const timerElement = document.getElementById('elapsed-time');
        if (!timerElement) return;
        const now = Date.now();
        const tenMinutes = 10 * 60 * 1000;
        const lastTime = this.state.unlockTimestamps.last_exploration || 0;
        const timeSinceLast = now - lastTime;
        const elapsedMs = now - (this.state.startTime || now);
        const eMin = Math.floor(elapsedMs / 60000);
        const eSec = Math.floor((elapsedMs % 60000) / 1000);
        let timeStr = `経過: ${String(eMin).padStart(2, '0')}:${String(eSec).padStart(2, '0')}`;
        if (this.state.currentCoolingDown && timeSinceLast < tenMinutes) {
            const remain = tenMinutes - timeSinceLast;
            const rMin = Math.floor(remain / 60000);
            const rSec = Math.floor((remain % 60000) / 1000);
            timeStr += ` | 次の探索まで ${rMin}:${String(rSec).padStart(2, '0')}`;
        }
        timerElement.innerText = timeStr;
    }

    checkLocationUnlocks() {
        const now = Date.now();
        const lastTime = this.state.unlockTimestamps.last_exploration || 0;
        if (this.state.currentCoolingDown && (now - lastTime >= 10 * 60 * 1000)) {
            this.state.currentCoolingDown = false; 
            this.saveState();
            alert("新たな場所を探索できます。");
        }
        this.updateLocationButtonsUI();
    }

    exploreLocation(num) {
        if (this.state.visitedLocations.includes(num)) {
            window.open(`image/${num}.pdf`, '_blank');
            return;
        }
        const now = Date.now();
        if (this.state.currentCoolingDown && (now - this.state.unlockTimestamps.last_exploration < 10 * 60 * 1000)) {
            alert("まだ準備ができていません。");
            return;
        }
        if (confirm(`場所 ${num} を調べますか？`)) {
            this.state.visitedLocations.push(num);
            this.state.currentCoolingDown = true;
            this.state.unlockTimestamps.last_exploration = now;
            this.saveState();
            this.updateLocationButtonsUI();
            window.open(`image/${num}.pdf`, '_blank');
        }
    }

    updateLocationButtonsUI() {
        const locationNames = { 6: "屋敷の中1", 7: "屋敷の中2", 8: "書斎1", 9: "書斎2", 10: "書斎3" };
        for (let i = 6; i <= 10; i++) {
            const btn = document.getElementById(`loc-btn-${i}`);
            if (!btn) continue;
            const isVisited = this.state.visitedLocations.includes(i);
            btn.disabled = (!isVisited && this.state.currentCoolingDown);
            btn.innerText = isVisited ? `[閲覧可] ${locationNames[i]}` : locationNames[i];
            btn.style.opacity = btn.disabled ? "0.5" : "1";
        }
    }

    getCharacter(id) { return (this.scenario.characters || []).find(c => c.id === id); }

    renderCharacterList() {
        if (!this.scenario || !this.scenario.characters) return;
        const list = document.getElementById('character-list');
        list.innerHTML = '';
        this.scenario.characters.forEach(char => {
            const div = document.createElement('div');
            div.className = 'character-card';
            div.innerHTML = `<div class="char-icon">👤</div><div class="char-name">${char.name}</div><div class="char-role">${char.role}</div>`;
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
        const history = (this.state.history || {})[this.currentCharacterId] || [];
        history.forEach(msg => {
            if (msg.role === 'model') {
                this.renderSingleMessage('model', msg.displayOuter, msg.displayInner);
            } else {
                this.renderSingleMessage(msg.role, msg.text);
            }
        });
        logContainer.scrollTop = logContainer.scrollHeight;
    }

    constructSystemPrompt(char) {
        const commonKnowledge = `【現場の事実】被害者は後頭部殴打で死亡。コーヒー2客あり（晴二はアレルギーで飲めない）。窓は外から割られているが鍵は閉まっていた。`.trim();
        const knownEvidencesList = (this.state.evidences || []).map(eid => {
            const e = (this.scenario.evidences || []).find(ev => ev.id === eid);
            return e ? `- ${e.name}: ${e.description}` : null;
        }).filter(Boolean).join("\n");
        const evidenceReactions = JSON.stringify(char.evidence_reactions || []);
        return `あなたは「${char.name}」です。
        【事実】${commonKnowledge}
        【性格/口調】${char.talk_style}
        【秘密】${JSON.stringify(char.secrets)}
        【反応設定】${evidenceReactions}
        【持っている証拠】${knownEvidencesList}
        【指針】疑われたら他人の情報を出しなさい。応答は outer_voice と inner_voice（内心のヒント）に分けて。`.trim();
    }

    updateAttributesUI() {
        const list = document.getElementById('evidence-list');
        if (!list || !this.scenario) return;
        list.innerHTML = '';
        this.state.evidences.forEach(eid => {
            const ev = (this.scenario.evidences || []).find(e => e.id === eid);
            if (ev) {
                const div = document.createElement('div');
                div.className = 'evidence-item';
                div.innerHTML = `<strong>${ev.name}</strong><br><small>${ev.description}</small>`;
                list.appendChild(div);
            }
        });
    }

    async loadScenario(path) {
        const res = await fetch(path);
        this.scenario = await res.json();
        if (this.scenario.characters) {
            const charPromises = this.scenario.characters.map(async (cp) => {
                const cRes = await fetch(cp.startsWith('.') ? cp : `./${cp}`);
                return await cRes.json();
            });
            this.scenario.characters = await Promise.all(charPromises);
        }
        if (this.scenario.case) {
            document.getElementById('case-title').innerText = this.scenario.case.title;
            document.getElementById('case-outline').innerText = this.scenario.case.outline;
        }
    }

    startAccusation() {
        const container = document.querySelector('#main-menu .content');
        this.originalMenuHTML = container.innerHTML;
        container.innerHTML = `<h2 class="section-title">犯人は誰？</h2><div id="culprit-selection-list"></div><button onclick="game.cancelAccusation()">やめる</button>`;
        const list = document.getElementById('culprit-selection-list');
        this.scenario.characters.forEach(char => {
            const div = document.createElement('div');
            div.className = 'character-card';
            div.innerHTML = `<span>${char.name}</span><button onclick="game.executeAccusation('${char.id}', '${char.name}')">指摘</button>`;
            list.appendChild(div);
        });
    }

    cancelAccusation() {
        const container = document.querySelector('#main-menu .content');
        container.innerHTML = this.originalMenuHTML;
        this.renderCharacterList();
        this.updateAttributesUI();
    }

    executeAccusation(charId, charName) {
        if (!confirm(`${charName}を告発しますか？`)) return;
        let resultData = { title: "BAD END", text: "間違っています...", isCorrect: false };
        if (charId === "renzo") {
            resultData = { title: "TRUE END", text: "私が犯人です...", isCorrect: true };
        }
        sessionStorage.setItem('game_result', JSON.stringify(resultData));
        window.location.href = 'epilogue.html';
    }

    showError(msg) { alert(msg); }
}

const game = new Game();
window.game = game;

document.addEventListener('DOMContentLoaded', () => {
    game.init();
    document.getElementById('back-btn').onclick = () => game.closeInterrogation();
    document.getElementById('send-btn').onclick = () => game.sendMessage();
});
