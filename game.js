import { sendToAI } from './ai.js';

class Game {
    constructor() {
        this.scenario = null;
        this.currentCharacterId = null;
        this.state = {
            evidences: [],
            history: {}, // { charId: [{role, text}] }
            flags: {},
            unlockedLocations: [1], // 最初は捜索場所1のみ解禁
            visitedLocation: null,   // 探索済みの場所番号（1箇所のみ）
            unlockTimestamps: {},    // 各場所が解禁された時刻
            startTime: Date.now()    // ゲーム全体の開始時刻
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
            
            // 毎秒実行するタイマーを開始（経過時間表示 & 解禁チェック）
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
            this.checkLocationUnlocks();
        }, 1000); // 1秒ごとに更新
    }

    // 経過時間と次の解禁までのカウントダウンを表示
    updateTimerDisplay() {
        const timerElement = document.getElementById('elapsed-time');
        if (!timerElement) return;

        const now = Date.now();
        const elapsedMs = now - this.state.startTime;
        
        const minutes = Math.floor(elapsedMs / 60000);
        const seconds = Math.floor((elapsedMs % 60000) / 1000);
        let timeStr = `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;

        // 次の自動解禁までの残り時間を計算
        const tenMinutes = 10 * 60 * 1000;
        let nextUnlockInfo = "";

        if (this.state.unlockedLocations.includes(2) && !this.state.unlockedLocations.includes(3)) {
            const nextTime = tenMinutes - (now - this.state.unlockTimestamps[2]);
            if (nextTime > 0) nextUnlockInfo = ` (次まで ${Math.floor(nextTime/60000)}:${String(Math.floor((nextTime%60000)/1000)).padStart(2, '0')})`;
        } else if (this.state.unlockedLocations.includes(3) && !this.state.unlockedLocations.includes(4)) {
            const nextTime = tenMinutes - (now - this.state.unlockTimestamps[3]);
            if (nextTime > 0) nextUnlockInfo = ` (次まで ${Math.floor(nextTime/60000)}:${String(Math.floor((nextTime%60000)/1000)).padStart(2, '0')})`;
        }

        timerElement.innerText = timeStr + nextUnlockInfo;
    }

    // 捜索場所の解禁条件チェック
    checkLocationUnlocks() {
        const now = Date.now();
        const tenMinutes = 10 * 60 * 1000; // 本番: 10分

        // 条件1: 全員（5人想定）と1回以上会話したら場所2解禁
        if (!this.state.unlockedLocations.includes(2)) {
            const spokenToCount = Object.keys(this.state.history).length;
            if (spokenToCount >= 5) this.unlockLocation(2, now);
        }

        // 条件2: 場所2解禁から10分経過で場所3
        if (this.state.unlockedLocations.includes(2) && !this.state.unlockedLocations.includes(3)) {
            if (now - this.state.unlockTimestamps[2] >= tenMinutes) this.unlockLocation(3, now);
        }

        // 条件3: 場所3解禁から10分経過で場所4
        if (this.state.unlockedLocations.includes(3) && !this.state.unlockedLocations.includes(4)) {
            if (now - this.state.unlockTimestamps[3] >= tenMinutes) this.unlockLocation(4, now);
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

    // 場所を探索する（1箇所限定）
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
        for (let i = 1; i <= 5; i++) {
            const btn = document.getElementById(`loc-btn-${i}`);
            if (!btn) continue;

            const isUnlocked = this.state.unlockedLocations.includes(i);
            
            if (this.state.visitedLocation) {
                // すでにどこか探索済みの場合
                btn.disabled = true;
                if (this.state.visitedLocation === i) {
                    btn.innerText = `探索済: 場所 ${i}`;
                    btn.classList.add('visited');
                } else {
                    btn.innerText = `ロック中`;
                }
            } else {
                // まだ未探索の場合
                if (isUnlocked) {
                    btn.disabled = false;
                    btn.innerText = i === 5 ? "？？？のロックを解除" : `捜索場所 ${i}`;
                    btn.classList.add('unlocked');
                } else {
                    btn.disabled = true;
                    btn.innerText = `未解禁`;
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
            this.state = JSON.parse(saved);
        } else {
            this.state.startTime = Date.now();
            if (this.scenario && this.scenario.evidences) {
                this.scenario.evidences.forEach(ev => {
                    if (ev.unlock_condition === 'start') this.addEvidence(ev.id);
                });
            }
        }
        this.updateLocationButtonsUI();
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
        this.appendMessage('user', text);

        // --- 特殊アンロック「はい/いいえ」判定 ---
        if (this.state.flags.waiting_for_location5) {
            if (text === 'はい' || text.includes('見たい')) {
                this.unlockLocation(5, Date.now());
                this.appendMessage('model', '「……わかった。じゃあ、これを見せてあげる。これが最後の場所よ。」');
                this.state.flags.waiting_for_location5 = false;
                this.saveState();
                return;
            } else if (text === 'いいえ') {
                this.appendMessage('model', '「ふん、興味ないならそれでいいわ。後悔しないでね。」');
                this.state.flags.waiting_for_location5 = false;
                this.saveState();
                return;
            }
        }

        const char = this.getCharacter(this.currentCharacterId);
        const history = this.state.history[this.currentCharacterId] || [];
        const responseText = await sendToAI(this.constructSystemPrompt(char), text, history);

        this.appendMessage('model', responseText);

        // アンロックの問いかけフラグ
        if (this.state.unlockedLocations.includes(4) && responseText.includes('ほんとに見る？')) {
            this.state.flags.waiting_for_location5 = true;
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
# ルール
- 探偵(プレイヤー)に応答せよ。
- 4箇所目の場所が話題になり、あなたが鍵を握っているなら「見たいんだったら見ていいよ　ほんとに見る？」と問いかけろ。
- 決してAIとして振る舞うな。
現在判明している証拠:
${knownEvidences}
        `.trim();
    }

    updateAttributesUI() {
        this.updateLocationButtonsUI();
        if (!this.scenario || !this.scenario.evidences) return;
        const list = document.getElementById('evidence-list');
        list.innerHTML = '';
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
    
    // UIボタン登録
    document.getElementById('back-btn').onclick = () => game.closeInterrogation();
    document.getElementById('send-btn').onclick = () => game.sendMessage();
    document.getElementById('chat-input').addEventListener('keypress', (e) => {
        if (e.key === 'Enter') game.sendMessage();
    });

    // 犯人指名 & リセットボタンの生成
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
