# Murder Mystery AI Interrogation System

AIキャラクターを取り調べ、犯人を特定するマーダーミステリーゲームです。

## 遊び方 (How to Play)

### オンライン (GitHub Pages) で遊ぶ場合
1.  このページにアクセスします。
2.  **APIキーが必要です**: ゲームを開始し、会話しようとするとAPIキーの入力を求められます。
3.  Google Gemini APIキーを取得している場合は、それを入力してください。（キーはブラウザにのみ保存され、サーバには送信されません）

### ローカルで遊ぶ場合
1.  リポジトリをクローンまたはダウンロードします。
2.  `config.example.js` をコピーして `config.js` を作成します。
3.  `config.js` の `API_KEY` を自分のGemini APIキーに書き換えます。
4.  `start_server.bat` をダブルクリックするか、以下のコマンドでサーバーを起動します。
    ```bash
    python -m http.server 8000
    ```
5.  ブラウザで `http://localhost:8000` にアクセスします。

## 技術スタック
- HTML/CSS/Vanilla JavaScript
- Google Gemini API

## ライセンス
MIT License
