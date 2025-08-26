# English Learning Assistant v3

Chrome拡張機能による高度な英語学習支援ツールです。AI（LLM）統合により、文脈を考慮した精密な品詞判定と意味解析を提供します。

## 🌟 主要機能

### 🤖 AI統合による高精度解析
- **文脈的品詞判定**: AIが文章全体を解析し、文脈に基づく正確な品詞を判定
- **文脈的意味解析**: 単語の文脈での具体的な意味とニュアンスを提供
- **実用的例文生成**: その単語の使い方を示す実用的な例文を自動生成
- **句動詞・イディオム検出**: look up, by and large など複数語表現を自動識別

### 📚 学習支援機能
- **品詞別色分け**: 英語テキストを品詞ごとに色分け表示（AI判定による高精度）
- **マウスオーバー辞書**: 単語にマウスを合わせると詳細な学習情報を表示
- **段落別翻訳**: 文章ごとの翻訳機能（バックグラウンド処理で高速）
- **学習進捗表示**: AI判定の信頼度表示で学習効果を可視化

### 🚀 パフォーマンス最適化
- **バックグラウンド処理**: ページ読み込み時に自動的にAI解析を開始
- **インテリジェントキャッシュ**: 解析結果を効率的にキャッシュして高速表示
- **段階的更新**: ルールベース→AI解析の2段階で即座に表示後に精密更新

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
- **Dictionary API** (https://api.dictionaryapi.dev) - 基本的な辞書機能
- **OpenAI API** - 翻訳機能とAI解析機能
  - 全機能: `gpt-4.1-nano`モデル使用（統一モデルで一貫性と効率性を両立）

### AI解析機能の詳細
- **文章全体解析**: ページ読み込み時に最大10文章を一括でAI解析
- **個別単語解析**: マウスオーバー時に文脈を考慮した詳細解析
- **キャッシュシステム**: 解析結果を1時間保持して効率化
- **フォールバック機能**: AI解析失敗時は従来の辞書APIを使用

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
