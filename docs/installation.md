# インストールガイド

## 要件

- Google Chrome または Chromium ベースのブラウザ
- Chrome 拡張機能の開発者モードの有効化

## Chrome Web Store からのインストール（推奨）

*現在準備中です。しばらくお待ちください。*

## 開発者モードでのインストール

### 1. リポジトリの取得

#### Git を使用する場合
```bash
git clone https://github.com/yourusername/english-learning-extension-v3.git
cd english-learning-extension-v3
```

#### ZIP ファイルをダウンロードする場合
1. [リポジトリページ](https://github.com/yourusername/english-learning-extension-v3) にアクセス
2. 「Code」ボタンをクリック
3. 「Download ZIP」を選択
4. ダウンロードしたファイルを解凍

### 2. Chrome への拡張機能の読み込み

1. Google Chrome を開く
2. アドレスバーに `chrome://extensions/` と入力してEnterを押す
3. 右上の「デベロッパーモード」トグルをオンにする

   ![デベロッパーモード](screenshots/developer-mode.png)

4. 「パッケージ化されていない拡張機能を読み込む」ボタンをクリック

   ![拡張機能読み込み](screenshots/load-extension.png)

5. ダウンロード・解凍したプロジェクトフォルダを選択
6. 拡張機能が正常に読み込まれると、拡張機能一覧に表示されます

### 3. 動作確認

1. 任意の英語のWebページを開く（例：Wikipedia、BBC News など）
2. ページ上の英語テキストが色分けされることを確認
3. 単語にマウスオーバーすると辞書情報が表示されることを確認
4. テキストを選択して右クリックメニューから翻訳機能が利用できることを確認

## トラブルシューティング

### 拡張機能が読み込まれない場合

- プロジェクトフォルダに `manifest.json` ファイルが存在することを確認
- `manifest.json` の構文が正しいか確認
- Chrome の開発者ツールで詳細なエラーメッセージを確認

### 機能が動作しない場合

1. 拡張機能がアクティブになっているか確認
2. 必要な権限が付与されているか確認
3. ブラウザコンソールでエラーメッセージを確認

### APIキーの設定（翻訳機能を利用する場合）

翻訳機能を利用するには、OpenAI APIキーの設定が必要です：

1. 拡張機能のポップアップを開く
2. 設定メニューからAPIキーを入力
3. 設定を保存

## 更新方法

### Git を使用している場合
```bash
git pull origin main
```

### 手動でダウンロードした場合
1. 最新のZIPファイルをダウンロード
2. 既存のフォルダを新しいバージョンで置き換え
3. Chrome の拡張機能ページで「更新」ボタンをクリック

## アンインストール

1. `chrome://extensions/` にアクセス
2. English Learning Assistant の「削除」ボタンをクリック
3. 確認ダイアログで「削除」を選択
