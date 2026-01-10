import { sendToAI } from './ai.js';

class Game {
    constructor() {
        this.scenario = null;
        this.currentCharacterId = null;
        this.state = {
            evidences: [],
            history: {}, 
            flags: {},
            unlockedLocations: [6], // 最初は場所6のみ解禁
            visitedLocation: null,   // 探索済みの場所番号（6〜10のいずれか）
            unlockTimestamps: {},    // 解禁された時刻
            startTime: Date.now()    // ゲーム開始時刻
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
            this.startGlobalTimer();    // タイマー開始
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
            this.checkLocationUnlocks();
        }, 1000);
    }

    updateTimerDisplay() {
        const timerElement = document.getElementById('elapsed-time');
        if (!timerElement) return;

        const now = Date.now();
        const elapsedMs = now - (this.state.startTime || now);
        
        const minutes = Math.floor(elapsedMs / 60000);
        const seconds = Math.floor((elapsedMs % 60000) / 1000);
        let timeStr = `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;

        const tenMinutes = 10 * 60 * 1000;
        let nextUnlockInfo = "";

        // 次の場所解禁までのカウントダウン
        if (this.state.unlockedLocations.includes(7) && !this.state.unlockedLocations.includes(8)) {
            const nextTime = tenMinutes - (now - (this.state.unlockTimestamps[7] || now));
            if (nextTime > 0) nextUnlockInfo = ` (次まで ${Math.floor(nextTime/60000)}:${String(Math.floor((nextTime%60000)/1000)).padStart(2, '0')})`;
        } else if (this.state.unlockedLocations.includes(8) && !this.state.unlockedLocations.includes(9)) {
            const nextTime = tenMinutes - (now - (this.state.unlockTimestamps[8] || now));
            if (nextTime > 0) nextUnlockInfo = ` (次まで ${Math.floor(nextTime/60000)}:${String(Math.floor((nextTime%60000)/1000)).padStart(2, '0')})`;
        }

        timerElement.innerText = timeStr + nextUnlockInfo;
    }

    checkLocationUnlocks() {
        const now = Date.now();
        const tenMinutes = 10 * 60 * 1000;

        const history = this.state.history || {};
        // 条件1: 全員(5人)と会話したら場所7解禁
        if (!this.state.unlockedLocations.includes(7)) {
            const spokenToCount = Object.keys(history).length;
            if (spokenToCount >= 5) this.unlockLocation(7, now);
        }

        // 条件2: 場所7解禁から10分で場所8
        if (this.state.unlockedLocations.includes(7) && !this.state.unlockedLocations.includes(8)) {
            if (now - (this.state.unlockTimestamps[7] || now) >= tenMinutes) this.unlockLocation(8, now);
        }

        // 条件3: 場所8解禁から10分で場所9
        if (this.state.unlockedLocations.includes(8) && !this.state.unlockedLocations.includes(9)) {
            if (now - (this.state.unlockTimestamps[8] || now) >= tenMinutes) this.unlockLocation(9, now);
        }
        
        this.updateLocationButtonsUI();
    }

    unlockLocation(num, timestamp) {
        if (!this.state.unlockedLocations.includes(num)) {
            this.state.unlockedLocations.push(num);
            this.state.unlockTimestamps[num] = timestamp;
            this.saveState();
            alert(`【解禁】捜索場所 ${num} が選択可能になりました。`);
        }
    }

    exploreLocation(num) {
        if (this.state.visitedLocation) {
            alert("捜索は一度きりです。他の場所はロックされています。");
            return;
        }
        if (confirm(`捜索場所 ${num} を調べますか？\n(一度選ぶと他の場所は二度と調べられません)`)) {
            this.state.visitedLocation = num;
            this.saveState();
            this.updateLocationButtonsUI();
            window.open(`image/${num}.pdf`, '_blank');
        }
    }

    updateLocationButtonsUI() {
        const unlocked = this.state.unlockedLocations || [6];
        for (let i = 6; i <= 10; i++) {
            const btn = document.getElementById(`loc-btn-${i}`);
            if (!btn) continue;

            const isUnlocked = unlocked.includes(i);
            
            if (this.state.visitedLocation) {
                btn.disabled = true;
                if (this.state.visitedLocation === i) {
                    btn.innerText = `探索済: 場所 ${i}`;
                    btn.classList.add('visited');
                } else {
                    btn.innerText = `ロック中`;
                    btn.classList.remove('unlocked');
                }
            } else {
                if (isUnlocked) {
                    btn.disabled = false;
                    btn.innerText = i === 10 ? "？？？のロックを解除" : `捜索場所 ${i}`;
                    btn.classList.add('unlocked');
                } else {
                    btn.disabled = true;
                    btn.innerText = `未解禁`;
                    btn.classList.remove('unlocked');
                }
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
        if (confirm("本当にリセットしますか？\n履歴や証拠がすべて失われます。")) {
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
                unlockedLocations: parsed.unlockedLocations || [6],
                history: parsed.history || {},
                evidences: parsed.evidences || [],
                flags: parsed.flags || {},
                unlockTimestamps: parsed.unlockTimestamps || {}
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

        // 特殊アンロック10番
        if (this.state.flags.waiting_for_location10) {
            if (text === 'はい' || text.includes('見たい')) {
                this.unlockLocation(10, Date.now());
                this.appendMessage('model', '「……わかった。じゃあ、これを見せてあげる。これが最後の場所よ。」');
                this.state.flags.waiting_for_location10 = false;
                this.saveState();
                return;
            } else if (text === 'いいえ') {
                this.appendMessage('model', '「ふん、興味ないならそれでいいわ。」');
                this.state.flags.waiting_for_location10 = false;
                this.saveState();
                return;
            }
        }

        const char = this.getCharacter(this.currentCharacterId);
        const history = (this.state.history || {})[this.currentCharacterId] || [];
        const responseText = await sendToAI(this.constructSystemPrompt(char), text, history);

        this.appendMessage('model', responseText);

        // 9番まで解禁していてAIが問いかけたら10番のフラグを立てる
        if (this.state.unlockedLocations.includes(9) && responseText.includes('ほんとに見る？')) {
            this.state.flags.waiting_for_location10 = true;
            this.saveState();
        }
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

        return `
あなたはミステリーの登場人物「${char.name}」です。
性格: ${char.personality} / 口調: ${char.talk_style}
現在判明している証拠:
${knownEvidences}
# ルール
- 探偵の質問に応答せよ。
- 探索場所9番の話題になり、あなたが鍵を握っているなら「見たいんだったら見ていいよ　ほんとに見る？」と問いかけろ。
        `.trim();
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
