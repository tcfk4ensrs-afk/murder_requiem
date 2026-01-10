import { sendToAI } from './ai.js';

class Game {
    constructor() {
        this.scenario = null;
        this.currentCharacterId = null;
        this.state = {
            evidences: [],
            history: {}, 
            flags: {},
            // 6〜10まですべて最初から解禁状態にする
            unlockedLocations: [6, 7, 8, 9, 10], 
            visitedLocation: null,   
            unlockTimestamps: {
                last_exploration: 0 // 最後に探索した時刻
            },    
            startTime: Date.now()    
        };
        this.timerInterval = null;
    }

    async init() {
        try {
            console.log("Game initialising...");
            await this.loadScenario('./scenarios/case1.json');
            this.loadState();
            this.renderCharacterList(); 
            this.updateAttributesUI();  
            this.startGlobalTimer();    
            console.log("Game initialised successfully.");
        } catch (e) {
            console.error("Critical error during init:", e);
            this.showError("初期化エラー: " + e.message);
        }
    }

    startGlobalTimer() {
        if (this.timerInterval) clearInterval(this.timerInterval);
        this.timerInterval = setInterval(() => {
            this.updateTimerDisplay();
            this.checkLocationUnlocks(); // クールタイム終了チェック
        }, 1000);
    }

    updateTimerDisplay() {
        const timerElement = document.getElementById('elapsed-time');
        if (!timerElement) return;

        const now = Date.now();
        const tenMinutes = 10 * 60 * 1000;
        const lastTime = this.state.unlockTimestamps.last_exploration || 0;
        const timeSinceLast = now - lastTime;
        
        // メインタイマー（ゲーム開始からの経過時間）
        const elapsedMs = now - (this.state.startTime || now);
        const eMin = Math.floor(elapsedMs / 60000);
        const eSec = Math.floor((elapsedMs % 60000) / 1000);
        let timeStr = `経過: ${String(eMin).padStart(2, '0')}:${String(eSec).padStart(2, '0')}`;

        // クールタイム中のカウントダウン表示
        if (this.state.visitedLocation && timeSinceLast < tenMinutes) {
            const remain = tenMinutes - timeSinceLast;
            const rMin = Math.floor(remain / 60000);
            const rSec = Math.floor((remain % 60000) / 1000);
            timeStr += ` | 次の探索まで ${rMin}:${String(rSec).padStart(2, '0')}`;
        } else if (this.state.visitedLocation) {
            timeStr += ` | 探索準備完了`;
        }

        timerElement.innerText = timeStr;
    }

    checkLocationUnlocks() {
        const now = Date.now();
        const tenMinutes = 10 * 60 * 1000;
        const lastTime = this.state.unlockTimestamps.last_exploration || 0;

        // 探索してから10分経ったらロックを解除する
        if (this.state.visitedLocation && (now - lastTime >= tenMinutes)) {
            this.state.visitedLocation = null; 
            this.saveState();
            alert("10分が経過しました。新たな場所を探索できます。");
        }
        
        this.updateLocationButtonsUI();
    }

    exploreLocation(num) {
        const now = Date.now();
        const tenMinutes = 10 * 60 * 1000;
        const lastTime = this.state.unlockTimestamps.last_exploration || 0;

        // クールタイム判定
        if (this.state.visitedLocation && (now - lastTime < tenMinutes)) {
            const remainMin = Math.ceil((tenMinutes - (now - lastTime)) / 60000);
            alert(`まだ捜査の準備ができていません。あと約 ${remainMin} 分待ってください。`);
            return;
        }

        if (confirm(`捜索場所 ${num} を調べますか？\n(一度調べると10分間は他の場所を調べられません)`)) {
            this.state.visitedLocation = num;
            this.state.unlockTimestamps.last_exploration = now;
            this.saveState();
            this.updateLocationButtonsUI();
            window.open(`image/${num}.pdf`, '_blank');
        }
    }

    updateLocationButtonsUI() {
        const now = Date.now();
        const tenMinutes = 10 * 60 * 1000;
        const lastTime = this.state.unlockTimestamps.last_exploration || 0;
        const isCoolingDown = (this.state.visitedLocation && (now - lastTime < tenMinutes));

        for (let i = 6; i <= 10; i++) {
            const btn = document.getElementById(`loc-btn-${i}`);
            if (!btn) continue;
            
            if (isCoolingDown) {
                btn.disabled = true;
                if (this.state.visitedLocation == i) {
                    btn.innerText = `探索済: ${i}`;
                    btn.classList.add('visited');
                    btn.classList.remove('unlocked');
                } else {
                    btn.innerText = `待機中`;
                    btn.classList.remove('unlocked');
                }
            } else {
                // クールタイム終了、または初回
                btn.disabled = false;
                btn.innerText = `捜索場所 ${i}`;
                btn.classList.add('unlocked');
                btn.classList.remove('visited');
            }
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
            if (!res.ok) throw new Error(`ファイルが見つかりません: ${path}`);
            this.scenario = await res.json();
            if (this.scenario.characters) {
                const charPromises = this.scenario.characters.map(async (charOrPath) => {
                    if (typeof charOrPath === 'string') {
                        const fullPath = charOrPath.startsWith('.') ? charOrPath : `./${charOrPath}`;
                        const charRes = await fetch(fullPath);
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
            console.error(e);
            throw e;
        }
    }

    resetGame() {
        if (confirm("データをリセットしますか？")) {
            localStorage.clear();
            location.reload();
        }
    }

    loadState() {
        const saved = localStorage.getItem('mystery_game_state_v1');
        if (saved) {
            const parsed = JSON.parse(saved);
            this.state = {
                ...this.state,
                ...parsed,
                unlockedLocations: [6, 7, 8, 9, 10], // 常時全開放
                history: parsed.history || {},
                evidences: parsed.evidences || [],
                flags: parsed.flags || {},
                unlockTimestamps: parsed.unlockTimestamps || { last_exploration: 0 }
            };
        } else {
            this.state.startTime = Date.now();
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
        return (this.scenario.characters || []).find(c => c.id === id);
    }

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
        this.appendMessage('user', text);

        const char = this.getCharacter(this.currentCharacterId);
        const history = (this.state.history || {})[this.currentCharacterId] || [];
        const responseText = await sendToAI(this.constructSystemPrompt(char), text, history);

        this.appendMessage('model', responseText);
        this.checkEvidenceUnlock(text, responseText);
    }

    appendMessage(role, text) {
        if (!this.state.history[this.currentCharacterId]) this.state.history[this.currentCharacterId] = [];
        this.state.history[this.currentCharacterId].push({ role, text });
        this.saveState();
        this.renderChatLog();
    }

    constructSystemPrompt(char) {
        const knownEvidences = (this.state.evidences || []).map(eid => {
            const e = (this.scenario.evidences || []).find(ev => ev.id === eid);
            return e ? `${e.name}: ${e.description}` : null;
        }).filter(Boolean).join("\n");

        return `あなたはミステリーの登場人物「${char.name}」です。
性格: ${char.personality} / 口調: ${char.talk_style}
現在判明している証拠:
${knownEvidences}
プレイヤー(探偵)の質問に誠実、あるいはキャラクターの性格に従って答えてください。`.trim();
    }

    updateAttributesUI() {
        this.updateLocationButtonsUI();
        const list = document.getElementById('evidence-list');
        if (!list || !this.scenario) return;
        list.innerHTML = '';
        this.state.evidences.forEach(eid => {
            const ev = (this.scenario.evidences || []).find(e => e.id === eid);
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
            // 例: 特定ワードによる証拠解禁
            if (userText.includes(ev.unlock_condition)) {
                this.addEvidence(ev.id);
                alert(`【新証拠】\n${ev.name}`);
            }
        });
    }

    startAccusation() {
        const culpritName = prompt("犯人だと思う人物名を入力してください：");
        if (!culpritName) return;
        const target = (this.scenario.characters || []).find(c => c.name === culpritName);
        if (!target) return alert("そのような人物はいません。");
        if (target.id === this.scenario.case.culprit) {
            alert(`【正解！】\n真犯人は ${target.name} でした。\n\n真相：\n${this.scenario.case.truth}`);
        } else {
            alert(`【不正解】\n${target.name} は犯人ではありません。`);
        }
    }
}

const game = new Game();
window.game = game;

document.addEventListener('DOMContentLoaded', () => {
    game.init();
    document.getElementById('back-btn').onclick = () => game.closeInterrogation();
    document.getElementById('send-btn').onclick = () => game.sendMessage();
    document.getElementById('chat-input').addEventListener('keypress', (e) => {
        if (e.key === 'Enter') game.sendMessage();
    });
    const menuContent = document.querySelector('#main-menu .content');
    const accuseBtn = document.createElement('button');
    accuseBtn.innerText = '👉 犯人を指名する';
    accuseBtn.style.cssText = "display:block; width:90%; margin:20px auto; padding:12px; background:#d32f2f; color:white; border:none; border-radius:5px; font-weight:bold; cursor:pointer;";
    accuseBtn.onclick = () => game.startAccusation();
    menuContent.appendChild(accuseBtn);
    const resetBtn = document.createElement('button');
    resetBtn.innerText = '🔄 最初からやり直す';
    resetBtn.style.cssText = "display:block; width:90%; margin:10px auto; padding:10px; background:#555; color:white; border:none; border-radius:5px; cursor:pointer;";
    resetBtn.onclick = () => game.resetGame();
    menuContent.appendChild(resetBtn);
});
