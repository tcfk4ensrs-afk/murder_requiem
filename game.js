import { sendToAI } from './ai.js';

class Game {
    constructor() {
        this.scenario = null;
        this.currentCharacterId = null;
        this.isAiThinking = false; 
        this.state = {
            difficulty: 'detective', 
            evidences: [],
            history: {}, 
            flags: {},
            unlockedLocations: [6, 7, 8, 9, 10], 
            visitedLocations: [], 
            currentCoolingDown: false, 
            unlockTimestamps: { last_exploration: 0 },    
            startTime: Date.now()    
        };
        this.timerInterval = null;
    }

    // --- 初期化 ---
    async init() {
        try {
            console.log("Game initialising...");
            await this.loadScenario('./scenarios/case1.json');
            this.loadState(); 
            this.renderCharacterList(); 
            this.updateAttributesUI();  
            this.updateDifficultyUI(); 
            this.startGlobalTimer();
            console.log("Game initialised successfully.");
        } catch (e) {
            console.error("Critical error during init:", e);
            this.showError("初期化エラー: " + e.message);
        }
    }

    // --- モード管理 ---
    setDifficulty(mode) {
        this.state.difficulty = mode;
        this.saveState();
        this.updateDifficultyUI();
    }

    updateDifficultyUI() {
        const btnDet = document.getElementById('mode-detective');
        const btnMas = document.getElementById('mode-master');
        if (!btnDet || !btnMas) return;
        const isMaster = this.state.difficulty === 'master';
        btnMas.classList.toggle('mode-active', isMaster);
        btnDet.classList.toggle('mode-active', !isMaster);
    }

    // --- メッセージ・AI通信 ---
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
            this.appendMessage('model', responseText);
            this.checkEvidenceUnlock(text, responseText);
        } catch (e) {
            loadingDiv.innerText = "通信エラーが発生しました。";
            console.error(e);
        } finally {
            this.isAiThinking = false;
        }
    }

    appendMessage(role, text) {
        if (!this.state.history[this.currentCharacterId]) this.state.history[this.currentCharacterId] = [];
        let displayOuter = text;
        let displayInner = "";

        if (role === 'model') {
            const outerMatch = text.match(/outer_voice[:：]\s*([\s\S]*?)(?=inner_voice|$)/i);
            const innerMatch = text.match(/inner_voice[:：]\s*([\s\S]*)/i);
            displayOuter = outerMatch ? outerMatch[1].trim() : text;
            displayInner = innerMatch ? innerMatch[1].trim() : "";
        }

        this.state.history[this.currentCharacterId].push({ role, text, displayOuter, displayInner });
        this.saveState();
        this.renderSingleMessage(role, displayOuter, displayInner);
    }

    renderSingleMessage(role, outerText, innerText = "") {
        const logContainer = document.getElementById('chat-log');
        const msgDiv = document.createElement('div');
        msgDiv.className = `message ${role}`;
        let html = `<div>${outerText}</div>`;
        if (role === 'model' && this.state.difficulty === 'master' && innerText) {
            html += `<div class="inner-thought" style="font-size:0.8rem; color:#888; margin-top:8px; border-top:1px dotted #444; padding-top:5px; font-style:italic;">（内心：${innerText}）</div>`;
        }
        msgDiv.innerHTML = html;
        logContainer.appendChild(msgDiv);
        logContainer.scrollTop = logContainer.scrollHeight;
    }

    // --- 証拠・探索ロジック ---
    loadState() {
        const saved = localStorage.getItem('mystery_game_state_v1');
        if (saved) {
            const parsed = JSON.parse(saved);
            this.state = { ...this.state, ...parsed };
        }
        if (this.scenario && this.scenario.evidences) {
            this.scenario.evidences.forEach(ev => {
                if (ev.unlock_condition === 'start' && !this.state.evidences.includes(ev.id)) {
                    this.state.evidences.push(ev.id);
                }
            });
        }
    }

    saveState() { localStorage.setItem('mystery_game_state_v1', JSON.stringify(this.state)); }

    addEvidence(evidenceId) {
        if (!this.state.evidences.includes(evidenceId)) {
            this.state.evidences.push(evidenceId);
            this.saveState();
            const ev = (this.scenario.evidences || []).find(e => e.id === evidenceId);
            if (ev) this.showEvidenceCutin(ev.name);
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
            if (this.state.evidences.includes(ev.id) || ev.unlock_condition === "start") return;
            const parts = ev.unlock_condition.split(':');
            if (parts.length === 2 && this.currentCharacterId === parts[0] && aiText.includes(parts[1])) {
                this.addEvidence(ev.id);
                setTimeout(() => {
                    this.appendMessage('system', `【分析完了】${this.getCharacter(parts[0]).name}の発言から証拠「${ev.name}」を入手。`);
                    this.updateAttributesUI();
                }, 600);
            }
        });
    }

    // --- UI/タイマー ---
    startGlobalTimer() {
        if (this.timerInterval) clearInterval(this.timerInterval);
        this.timerInterval = setInterval(() => { this.updateTimerDisplay(); this.checkLocationUnlocks(); }, 1000);
    }

    updateTimerDisplay() {
        const timerElement = document.getElementById('elapsed-time');
        if (!timerElement) return;
        const now = Date.now();
        const diff = now - (this.state.unlockTimestamps.last_exploration || 0);
        const elapsed = now - (this.state.startTime || now);
        let timeStr = `経過: ${Math.floor(elapsed/60000)}:${String(Math.floor((elapsed%60000)/1000)).padStart(2,'0')}`;
        if (this.state.currentCoolingDown && diff < 600000) {
            const rem = 600000 - diff;
            timeStr += ` | 次の探索まで ${Math.floor(rem/60000)}:${String(Math.floor((rem%60000)/1000)).padStart(2,'0')}`;
        }
        timerElement.innerText = timeStr;
    }

    checkLocationUnlocks() {
        const now = Date.now();
        if (this.state.currentCoolingDown && (now - this.state.unlockTimestamps.last_exploration >= 600000)) {
            this.state.currentCoolingDown = false; this.saveState();
        }
        this.updateLocationButtonsUI();
    }

    exploreLocation(num) {
        if (this.state.visitedLocations.includes(num)) { window.open(`image/${num}.pdf`, '_blank'); return; }
        if (this.state.currentCoolingDown) { alert("クールタイム中です。"); return; }
        if (confirm(`場所 ${num} を調べますか？`)) {
            this.state.visitedLocations.push(num);
            this.state.currentCoolingDown = true;
            this.state.unlockTimestamps.last_exploration = Date.now();
            this.saveState();
            window.open(`image/${num}.pdf`, '_blank');
        }
    }

    updateLocationButtonsUI() {
        for (let i = 6; i <= 10; i++) {
            const btn = document.getElementById(`loc-btn-${i}`);
            if (!btn) continue;
            const isV = this.state.visitedLocations.includes(i);
            btn.disabled = (!isV && this.state.currentCoolingDown);
            btn.style.opacity = btn.disabled ? "0.5" : "1";
        }
    }

    // --- キャラクター/プロンプト ---
    getCharacter(id) { return (this.scenario.characters || []).find(c => c.id === id); }

    renderCharacterList() {
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
            if (msg.role === 'model') this.renderSingleMessage('model', msg.displayOuter, msg.displayInner);
            else this.renderSingleMessage(msg.role, msg.text);
        });
        logContainer.scrollTop = logContainer.scrollHeight;
    }

    constructSystemPrompt(char) {
        const commonKnowledge = `【共通認識】被害者は後頭部殴打で死亡。机にコーヒー2客（長男・晴二はアレルギーで絶対飲めない）。窓は外から割られているが玄関は施錠。タバコの臭い。`.trim();
        const knownEvidences = (this.state.evidences || []).map(eid => {
            const e = (this.scenario.evidences || []).find(ev => ev.id === eid);
            return e ? `- ${e.name}: ${e.description}` : null;
        }).filter(Boolean).join("\n");
        
        return `あなたは「${char.name}」(${char.age}歳)です。
        【家族】${JSON.stringify(char.family_relation)}
        【性格】${char.personality} / 口調: ${char.talk_style}
        【事実】${commonKnowledge}
        【証拠への反応】${JSON.stringify(char.evidence_reactions)}
        【既知の証拠】${knownEvidences}
        【指針】秘密を隠すが、追及されたら他人の怪しい点を暴露して逃げろ。
        【形式】outer_voice:発言 / inner_voice:内心（次に疑うべき相手のヒント）`.trim();
    }

    updateAttributesUI() {
        const list = document.getElementById('evidence-list');
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
        const charPromises = this.scenario.characters.map(async (cp) => {
            const cRes = await fetch(cp.startsWith('.') ? cp : `./${cp}`);
            return await cRes.json();
        });
        this.scenario.characters = await Promise.all(charPromises);
        document.getElementById('case-title').innerText = this.scenario.case.title;
        document.getElementById('case-outline').innerText = this.scenario.case.outline;
    }

    // --- 告発/リセット ---
    startAccusation() {
        const menu = document.querySelector('#main-menu .content');
        this.originalMenuHTML = menu.innerHTML;
        menu.innerHTML = `<h2 class="section-title">犯人は誰？</h2><div id="culprit-selection-list"></div><button class="action-btn" onclick="game.cancelAccusation()" style="background:#555; width:100%; color:white; padding:10px;">やめる</button>`;
        this.scenario.characters.forEach(char => {
            const div = document.createElement('div');
            div.className = 'character-card';
            div.innerHTML = `<span>${char.name}</span><button onclick="game.executeAccusation('${char.id}', '${char.name}')">告発</button>`;
            document.getElementById('culprit-selection-list').appendChild(div);
        });
    }

    cancelAccusation() {
        document.querySelector('#main-menu .content').innerHTML = this.originalMenuHTML;
        this.renderCharacterList(); this.updateAttributesUI(); this.addControlButtons();
    }

    executeAccusation(charId, charName) {
        if (!confirm(`${charName}を告発？`)) return;
        let res = { title: "BAD END", text: "間違いです。", isCorrect: false };
        if (charId === "renzo") res = { title: "TRUE END", text: "私がやりました。", isCorrect: true };
        sessionStorage.setItem('game_result', JSON.stringify(res));
        window.location.href = 'epilogue.html';
    }

    resetGame() { if (confirm("リセット？")) { localStorage.clear(); location.reload(); } }

    addControlButtons() {
        const menu = document.querySelector('#main-menu .content');
        if (document.getElementById('game-controls')) return;
        const div = document.createElement('div');
        div.id = 'game-controls';
        div.innerHTML = `
            <button onclick="game.startAccusation()" style="display:block; width:90%; margin:20px auto; padding:12px; background:#d32f2f; color:white; border-radius:5px; font-weight:bold;">👉 犯人を指名する</button>
            <button onclick="game.resetGame()" style="display:block; width:90%; margin:10px auto; padding:10px; background:#555; color:white; border-radius:5px;">🔄 最初からやり直す</button>
        `;
        menu.appendChild(div);
    }

    showError(msg) { alert(msg); }
}

const game = new Game();
window.game = game;
document.addEventListener('DOMContentLoaded', () => { 
    game.init().then(() => game.addControlButtons());
    document.getElementById('back-btn').onclick = () => game.closeInterrogation();
    document.getElementById('send-btn').onclick = () => game.sendMessage();
});
