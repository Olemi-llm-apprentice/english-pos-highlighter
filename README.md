# English Learning Assistant

Chrome拡張機能による英語学習支援ツールです。Webページ上の英語テキストに対して品詞の色分け、マウスオーバー辞書、翻訳機能を提供します。

## 🌟 機能

- **品詞別色分け**: 英語テキストを品詞ごとに色分け表示
- **マウスオーバー辞書**: 単語にマウスを合わせると意味を表示
- **翻訳機能**: 選択したテキストを日本語に翻訳
- **右クリックメニュー**: コンテキストメニューから翻訳や辞書機能にアクセス

## 📋 インストール方法

### Chrome Web Storeからインストール（推奨）
*準備中*

### 開発者モードでのインストール
1. このリポジトリをクローンまたはダウンロード
```bash
git clone https://github.com/Olemi-llm-apprentice/english-pos-highlighter.git
```

2. Chromeで `chrome://extensions/` を開く
3. 右上の「デベロッパーモード」を有効にする
4. 「パッケージ化されていない拡張機能を読み込む」をクリック
5. ダウンロードしたフォルダを選択

## 🚀 使用方法

1. 拡張機能をインストール後、任意の英語Webページを開く
2. ページ上の英語テキストが自動的に色分けされます
3. 単語にマウスを合わせると辞書情報が表示されます
4. テキストを選択して右クリックで翻訳メニューを利用できます

詳細な使用方法は [docs/usage.md](docs/usage.md) をご覧ください。

## 🛠️ 開発

### 必要な権限
- `storage`: 設定の保存
- `activeTab`: アクティブタブへのアクセス
- `contextMenus`: 右クリックメニューの追加

### 外部API
- Dictionary API (https://api.dictionaryapi.dev)
- OpenAI API (翻訳機能)

## 📁 プロジェクト構造

```
src/
├── background/     # バックグラウンドスクリプト
├── content/        # コンテンツスクリプト
└── popup/          # ポップアップUI
assets/
└── icons/          # アイコンファイル
```

## 🤝 貢献

プルリクエストや課題報告を歓迎します。

1. このリポジトリをフォーク
2. フィーチャーブランチを作成 (`git checkout -b feature/AmazingFeature`)
3. 変更をコミット (`git commit -m 'Add some AmazingFeature'`)
4. ブランチにプッシュ (`git push origin feature/AmazingFeature`)
5. プルリクエストを作成

## 📄 ライセンス

このプロジェクトは MIT ライセンスの下で公開されています。詳細は [LICENSE](LICENSE) ファイルをご覧ください。

## 📞 お問い合わせ

- 作者: [あなたの名前]
- Email: [your-email@example.com]
- GitHub: [https://github.com/Olemi-llm-apprentice](https://github.com/Olemi-llm-apprentice)

## 🙏 謝辞

- [Dictionary API](https://dictionaryapi.dev/) - 無料の辞書API
- [OpenAI API](https://openai.com/) - 翻訳機能
