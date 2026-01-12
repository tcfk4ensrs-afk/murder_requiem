import { sendToAI } from './ai.js';

class Game {
    constructor() {
        this.scenario = null;
        this.currentCharacterId = null;
        this.isAiThinking = false; 
        this.state = {
            evidences: [],
            history: {}, 
            flags: {},
            unlockedLocations: [6, 7, 8, 9, 10], 
            visitedLocations: [], // 修正：探索済みの場所を記録する配列
            currentCoolingDown: false, // 修正：現在クールタイム中かどうか
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

        // 修正：クールタイム中のカウントダウン表示
        if (this.state.currentCoolingDown && timeSinceLast < tenMinutes) {
            const remain = tenMinutes - timeSinceLast;
            const rMin = Math.floor(remain / 10000);
            const rSec = Math.floor((remain % 10000) / 1000);
            timeStr += ` | 次の新エリア探索まで ${rMin}:${String(rSec).padStart(2, '0')}`;
        } else if (this.state.currentCoolingDown) {
            timeStr += ` | 新エリア探索準備完了`;
        }

        timerElement.innerText = timeStr;
    }

    checkLocationUnlocks() {
        const now = Date.now();
        const tenMinutes = 10 * 60 * 1000;
        const lastTime = this.state.unlockTimestamps.last_exploration || 0;

        // 修正：クールタイム終了チェック
        if (this.state.currentCoolingDown && (now - lastTime >= tenMinutes)) {
            this.state.currentCoolingDown = false; 
            this.saveState();
            alert("10分が経過しました。新たな場所を探索できます。");
        }
        
        this.updateLocationButtonsUI();
    }

    exploreLocation(num) {
        // すでに探索済みの場合は即座に開く
        if (this.state.visitedLocations.includes(num)) {
            window.open(`image/${num}.pdf`, '_blank');
            return;
        }

        const now = Date.now();
        const tenMinutes = 10 * 60 * 1000;
        const lastTime = this.state.unlockTimestamps.last_exploration || 0;

        // 新規探索時のクールタイム判定
        if (this.state.currentCoolingDown && (now - lastTime < tenMinutes)) {
            const remainMin = Math.ceil((tenMinutes - (now - lastTime)) / 60000);
            alert(`まだ新しい捜査の準備ができていません。あと約 ${remainMin} 分待ってください。\n（探索済みの場所は見返せます）`);
            return;
        }

        if (confirm(`捜索場所 ${num} を調べますか？\n(新しく調べると10分間は他の未探索場所を調べられません)`)) {
            this.state.visitedLocations.push(num);
            this.state.currentCoolingDown = true;
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
        const isCoolingDown = (this.state.currentCoolingDown && (now - lastTime < tenMinutes));

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
            
            const isVisited = this.state.visitedLocations.includes(i);

            if (isVisited) {
                // 探索済みは常に有効
                btn.disabled = false;
                btn.innerText = `[閲覧可] ${locationNames[i]}`;
                btn.style.opacity = "1";
                btn.style.border = "2px solid #4CAF50"; // 緑枠などで既読感を出す
            } else if (isCoolingDown) {
                // 未探索かつクールタイム中
                btn.disabled = true;
                btn.innerText = `ロック中`;
                btn.style.opacity = "0.5";
                btn.style.border = "none";
            } else {
                // 未探索かつクールタイム終了
                btn.disabled = false;
                btn.innerText = locationNames[i];
                btn.style.opacity = "1";
                btn.style.border = "none";
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
                visitedLocations: parsed.visitedLocations || [], // 修正
                currentCoolingDown: parsed.currentCoolingDown || false, // 修正
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

   // Game.js 内の addEvidence を修正
addEvidence(evidenceId) {
    if (!this.state.evidences.includes(evidenceId)) {
        this.state.evidences.push(evidenceId);
        this.saveState();

        // 証拠品データを取得
        const ev = (this.scenario.evidences || []).find(e => e.id === evidenceId);
        if (ev) {
            this.showEvidenceCutin(ev.name); // カットイン表示
        }
    }
}

// カットイン表示用のメソッドを新規追加
showEvidenceCutin(evidenceName) {
    // 既存のカットインがあれば削除
    const oldCutin = document.querySelector('.evidence-cutin');
    if (oldCutin) oldCutin.remove();

    const cutin = document.createElement('div');
    cutin.className = 'evidence-cutin';
    cutin.innerHTML = `
        <h2>EVIDENCE UNLOCKED</h2>
        <p>${evidenceName}</p>
    `;
    document.body.appendChild(cutin);

    // SEを鳴らす場合はここで（例: new Audio('path/to/se.mp3').play();）

    // アニメーション終了後に要素を削除
    setTimeout(() => {
        if (cutin.parentNode) cutin.remove();
    }, 2500);
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
    if (!this.state.history[this.currentCharacterId]) {
        this.state.history[this.currentCharacterId] = [];
    }
    
    // 履歴に追加
    this.state.history[this.currentCharacterId].push({ role, text });
    this.saveState();

    // ログを表示
    const logContainer = document.getElementById('chat-log');
    const msgDiv = document.createElement('div');
    // roleが system の場合は .message.system クラスが適用される
    msgDiv.className = `message ${role}`;
    msgDiv.innerText = text;
    logContainer.appendChild(msgDiv);
    
    logContainer.scrollTop = logContainer.scrollHeight;
}

    constructSystemPrompt(char) {
    // 1. 全キャラ共通の「現場の客観的事実」を定義
    const commonKnowledge = `
【現場の客観的事実（全キャラ共通認識）】
- 被害者は書斎で倒れており、死因は後頭部への一撃（凶器は血の付いた重厚な灰皿）。
- 現場（書斎）の机には2客のコーヒーがあった。1杯は手付かず、1杯は飲みかけ。
- 長男・晴二は重度のコーヒーアレルギーであり、コーヒーを飲むことは物理的に不可能である。
- 書斎の窓は外から割られているが、玄関の鍵は蓮三が到着した際、施錠されていた。
- 昨晩の屋敷内では、タバコの臭いが漂っていた。
    `.trim();

    // 2. 現在プレイヤーが持っている証拠品の詳細リストを作成
    const knownEvidencesList = (this.state.evidences || []).map(eid => {
        const e = (this.scenario.evidences || []).find(ev => ev.id === eid);
        return e ? `- ${e.name}: ${e.description}` : null;
    }).filter(Boolean).join("\n");

    // 3. キャラクター固有の「証拠品に対する反応設定」を取得
    const evidenceReactions = JSON.stringify(char.evidence_reactions || []);

    // 4. 家族関係（性別・順序）の補強
    const familyContext = char.family_relation ? 
        `あなたの家族関係: ${JSON.stringify(char.family_relation)}` : 
        `あなたの役割: ${char.role}`;

    return `
あなたはミステリーゲームの登場人物「${char.name}」として振る舞ってください。
以下の【絶対的な真実】と【証拠品提示ルール】を厳守すること。

### 1. 【絶対的な真実】（全キャラ共通の前提知識）
${commonKnowledge}

### 2. キャラクター設定
名前: ${char.name} / 年齢: ${char.age}歳 / 職業: ${char.occupation}
${familyContext}
性格: ${Array.isArray(char.personality) ? char.personality.join("、") : char.personality}
口調: ${char.talk_style}

### 3. 秘密と禁止事項
- 秘密（隠し事）: ${JSON.stringify(char.secrets)}
- 絶対に自白しない内容: ${JSON.stringify(char.forbidden_reveals)}

### 4. 【最優先】証拠品提示ルール
プレイヤーが以下の「現在判明している証拠」を突きつけてきた場合、あなたは【証拠品への反応定義】に従って、言い逃れをやめ、情報を開示しなければなりません。

【現在判明している証拠】
${knownEvidencesList}

【証拠品への反応定義】
${evidenceReactions}

### 応答の指針（重要：聞き込みの連鎖）
1. 自分の秘密は必死に隠してください。
2. しかし、自分が疑われたり、厳しい追及を受けた場合は、容疑を逸らすために「他の家族の不審な動き」を積極的に暴露してください。
   - 例：「私はやっていない！そういえば、〇〇が怪しい動きをしていたのを見た」と具体名を出すこと。
3. 適切な証拠を突きつけられたら、動揺を見せ、一部の真実を白状してください。
4. 設定にない勝手な嘘を捏造しないでください。

### 応答形式
outer_voice: キャラとしての発言。証拠を突きつけられたら動揺を見せること。
inner_voice: キャラとしての内心。プレイヤーに「誰が証拠を持っているか」や「次に誰を問い詰めるべきか」のヒントを、独り言として必ず含めてください。
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
        // すでに持っている証拠はスキップ
        if (this.state.evidences.includes(ev.id)) return;

        // 初期証拠（start）はここでは判定しない
        if (ev.unlock_condition === "start") return;

        // unlock_conditionを「キャラID」と「キーワード」に分割 (例 "yotsuba:一海姉さん")
        const conditionParts = ev.unlock_condition.split(':');
        if (conditionParts.length !== 2) return;

        const targetCharId = conditionParts[0];
        const keyword = conditionParts[1];

        // 1. 現在話しているキャラが、証拠を出すべき設定のキャラか
        // 2. AIの発言(aiText)に、フラグとなるキーワードが含まれているか
        if (this.currentCharacterId === targetCharId && aiText.includes(keyword)) {
            
            // 証拠を追加（この中でカットイン showEvidenceCutin が呼ばれる）
            this.addEvidence(ev.id);
            
            // チャットログにシステムメッセージを挿入して、ログに残るようにする
            const charName = this.getCharacter(targetCharId).name;
            setTimeout(() => {
                this.appendMessage('system', `【分析完了】${charName}の発言から重要な証拠「${ev.name}」を入手しました。`);
                this.updateAttributesUI();
            }, 600); // カットインの表示タイミングに合わせて少し遅らせる
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
            resultData.title = "【TRUE END - 真真】";
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







