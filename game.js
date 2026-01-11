import { sendToAI } from './ai.js';

class Game {
    constructor() {
        this.scenario = null;
        this.currentCharacterId = null;
        this.isAiThinking = false; // 二重送信防止用
        this.state = {
            evidences: [],
            history: {}, 
            flags: {},
            unlockedLocations: [6, 7, 8, 9, 10], 
            visitedLocation: null,   
            unlockTimestamps: {
                last_exploration: 0 
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

        const locationNames = {
            6: "屋敷の中1(母の寝室・トイレ・ピアノ室)",
            7: "屋敷の中2(母の寝室・倉庫)",
            8: "書斎1",
            9: "書斎2",
            10: "書斎3"
        };

        for (let i = 6; i <= 10; i++) {
            const btn = document.getElementById(`loc-btn-${i}`);
            if (!btn) continue;
            
            if (isCoolingDown) {
                btn.disabled = true;
                if (this.state.visitedLocation == i) {
                    btn.innerText = `探索済: ${i} (待機中)`;
                    btn.classList.add('visited');
                } else {
                    btn.innerText = `ロック中`;
                }
            } else {
                btn.disabled = false;
                btn.innerText = locationNames[i];
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
                unlockedLocations: [6, 7, 8, 9, 10], 
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
        if (!text || this.isAiThinking) return;

        this.isAiThinking = true;
        input.value = '';
        this.appendMessage('user', text);

        // --- 「考え中」メッセージを表示 ---
        const logContainer = document.getElementById('chat-log');
        const loadingDiv = document.createElement('div');
        loadingDiv.className = 'message model loading-indicator';
        loadingDiv.innerText = '考え中...';
        logContainer.appendChild(loadingDiv);
        logContainer.scrollTop = logContainer.scrollHeight;

        const char = this.getCharacter(this.currentCharacterId);
        
        // トークン節約のため、直近の会話履歴（10件＝5往復）のみ抽出
        const history = (this.state.history || {})[this.currentCharacterId] || [];
        const recentHistory = history.slice(-10);

        try {
            // AIリクエスト
            const responseText = await sendToAI(this.constructSystemPrompt(char), text, recentHistory);

            // 「考え中」を削除
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
        this.state.history[this.currentCharacterId].push({ role, text });
        this.saveState();
        this.renderChatLog();
    }

    constructSystemPrompt(char) {
        const knownEvidences = (this.state.evidences || []).map(eid => {
            const e = (this.scenario.evidences || []).find(ev => ev.id === eid);
            return e ? `${e.name}` : null;
        }).filter(Boolean).join(", ");

        // トークン節約のため、役割と事実のみを簡潔に伝える
        return `Role:${char.name}. Persona:${char.personality}. Style:${char.talk_style}. FoundItems:${knownEvidences}. Reply as this character.`.trim();
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
            if (userText.includes(ev.unlock_condition)) {
                this.addEvidence(ev.id);
                alert(`【新証拠】\n${ev.name}`);
            }
        });
    }

    startAccusation() {
        const container = document.querySelector('#main-menu .content');
        this.originalMenuHTML = container.innerHTML; 

        container.innerHTML = `
            <h2 class="section-title">真犯人を指名してください</h2>
            <div id="culprit-selection-list" class="character-grid"></div>
            <button class="action-btn" onclick="game.cancelAccusation()" style="background:#555; margin-top:20px; width:100%; padding:10px; color:white; border:none; border-radius:5px;">キャンセル</button>
        `;

        const list = document.getElementById('culprit-selection-list');
        this.scenario.characters.forEach(char => {
            const div = document.createElement('div');
            div.className = 'character-card culprit-card';
            div.style.marginTop = "10px";
            div.innerHTML = `
                <div class="char-icon">👤</div>
                <div class="char-name">${char.name}</div>
                <button class="select-btn" style="margin-top:10px; padding:5px 10px; cursor:pointer; background:var(--accent-color); border:none; border-radius:3px;">この人物を指名</button>
            `;
            div.onclick = () => this.executeAccusation(char.id, char.name);
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
        if (!confirm(`本当に ${charName} が犯人だと指摘しますか？\n(この後、真相解明シーンへ移動します)`)) {
            return;
        }

        let resultData = { title: "", text: "", isCorrect: false };

        if (charId === "renzo") {
            resultData.isCorrect = true;
            resultData.title = "【TRUE END - 真相】";
            resultData.text = `ああ。そうさ……俺が犯人さ。\n理由はそう……12年前。父さんと母さんが廊下でケンカをしていた。その時の母さんは泣いていた。\n自分の部屋に戻ると、しばらくして三階のテラスから、父さんの声が聞こえた。\n「泣いたって何も解決しないだろ!」\nその直後、悲鳴と共に窓の外を落下していく父さんと、目が合った。\n俺はこう思った。母さんが、父さんを突き落としたのかもしれないと。\n\n昨日の夜、曲の権利を手放そうとしている母さんを止めたくて、22時に屋敷を訪れた。\n理由を聞くと、母さんは急に「権利は放棄して、誰でも使える曲にするの」と言い出した!\nそして「もう12年……忘れなさい。あなたたちには将来があるじゃない。前だけを向いて歩いてほしいの」と言ったんだ。その瞬間俺は、怒りがわいた。作曲家としての父さんを尊敬していたから、許せなかった。\n\n「父さんは、母さんに将来を絶たれたんだ!!」と、思わず灰皿で頭を殴ってしまった……。\n……そう言えば母さんは、最後に「トランクを……」と、言い残して死んだ。あの言葉は何だったんだろう。`;
        } else {
            resultData.isCorrect = false;
            resultData.title = "【BAD END - 誤認逮捕】";
            resultData.text = `「自分は絶対、母さんを殺したりしない!」 迫って来るみんなへ、必死に抵抗した。\nすると、兄弟姉妹(きょうだい)の中から、「もう、やめよう……」という声がした。\n先ほど声を発した人物が、続けてこう言った。\n「みんな間違ってる……母さんを殺したのは――」`;
        }

        sessionStorage.setItem('game_result', JSON.stringify(resultData));
        window.location.href = 'epilogue.html';
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
    
    // UIボタンの追加
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
