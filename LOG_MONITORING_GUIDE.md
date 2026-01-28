# 🔍 Chrome拡張機能ログ監視ガイド

このガイドでは、English Learning Extension v3のログを監視・出力する方法を説明します。

## 📊 利用可能なログ監視方法

### **1. Chrome Developer Console（リアルタイム監視）**

#### Background Script のログ
```javascript
// Chrome拡張機能管理画面を開く
chrome://extensions/

// 1. "デベロッパーモード"を有効化
// 2. English Learning Extension v3の"background page"をクリック
// 3. DevToolsが開き、background.jsのログがリアルタイム表示される
```

#### Content Script のログ
```javascript
// 任意のWebページで F12キーを押してDevToolsを開く
// Console タブでcontent-script.jsのログがリアルタイム表示される
```

### **2. プログラム的ログ取得（新機能）**

Webページのコンソールで以下のコマンドを使用できます：

#### 基本的なログ取得
```javascript
// すべてのログを表示
ELA_DEBUG.getLogs()

// エラーログのみを表示
ELA_DEBUG.getErrors()

// 最近10分間のログを表示
ELA_DEBUG.getRecent(10)

// キーワード検索
ELA_DEBUG.search("LLM")
ELA_DEBUG.search("error")
ELA_DEBUG.search("paragraph")
```

#### ログのファイル出力
```javascript
// ログをテキストファイルとしてダウンロード
ELA_DEBUG.exportLogs()

// ダウンロードファイル名例:
// extension-logs-2024-01-20T15-30-45.txt
```

#### ログ管理
```javascript
// すべてのログをクリア
ELA_DEBUG.clearLogs()

// デバッグ状況とコマンド一覧を表示
ELA_DEBUG.status()
```

### **3. フィルタリング機能**

#### 高度なログ取得
```javascript
// レベル別フィルタ
ELA_DEBUG.getLogs({ level: 'ERROR' }, 100)
ELA_DEBUG.getLogs({ level: 'WARN' }, 50)
ELA_DEBUG.getLogs({ level: 'LOG' }, 200)

// 時間範囲フィルタ（最近N分）
ELA_DEBUG.getLogs({ minutes: 5 }, 100)   // 最近5分
ELA_DEBUG.getLogs({ minutes: 30 }, 200)  // 最近30分

// 検索フィルタ
ELA_DEBUG.getLogs({ search: 'paragraph' }, 100)
ELA_DEBUG.getLogs({ search: 'Extension context' }, 50)

// 複合フィルタ
ELA_DEBUG.getLogs({ 
    level: 'ERROR', 
    minutes: 10, 
    search: 'LLM' 
}, 50)
```

## 🛠️ 実用的なログ監視例

### **問題の調査**

```javascript
// エラーの調査
ELA_DEBUG.getErrors()

// 特定の機能の問題調査
ELA_DEBUG.search("paragraph")
ELA_DEBUG.search("Extension context")
ELA_DEBUG.search("Failed LLM analysis")

// 最近の動作確認
ELA_DEBUG.getRecent(5)
```

### **パフォーマンス監視**

```javascript
// キャッシュ使用状況確認
ELA_DEBUG.status()

// API呼び出し状況確認
ELA_DEBUG.search("API call")
ELA_DEBUG.search("cache hit")
```

### **デバッグ情報の収集**

```javascript
// 問題報告用のログをファイル出力
ELA_DEBUG.exportLogs()

// 現在のシステム状態確認
ELA_DEBUG.status()
```

## 📋 ログ形式

### **出力形式**
```
[2024-01-20T15:30:45.123Z] LOG: Background service initialized
[2024-01-20T15:30:46.456Z] ERROR: Failed LLM analysis for paragraph paragraph-5: API timeout
[2024-01-20T15:30:47.789Z] WARN: Extension context invalidated during analysis
```

### **ログ内容**
- **timestamp**: ISO 8601形式のタイムスタンプ
- **level**: LOG, WARN, ERROR
- **message**: ログメッセージ（オブジェクトはJSON文字列化）
- **source**: background または content

## 🚀 トラブルシューティング用コマンド

### **拡張機能の状態確認**
```javascript
ELA_DEBUG.status()
```

### **エラーの確認**
```javascript
ELA_DEBUG.getErrors()
ELA_DEBUG.search("error")
ELA_DEBUG.search("failed")
```

### **Extension Context 問題の確認**
```javascript
ELA_DEBUG.search("Extension context")
ELA_DEBUG.search("Receiving end does not exist")
```

### **LLM解析問題の確認**
```javascript
ELA_DEBUG.search("LLM")
ELA_DEBUG.search("paragraph")
ELA_DEBUG.search("analysis")
```

## 📄 ログファイルのサンプル

ダウンロードされるログファイルの内容例：

```
[2024-01-20T15:30:45.123Z] LOG: Background service logging initialized
[2024-01-20T15:30:45.124Z] LOG: Background service initialized
[2024-01-20T15:30:46.456Z] LOG: Starting sentence-by-sentence LLM analysis for 15 paragraphs
[2024-01-20T15:30:46.789Z] LOG: Processing 15 paragraphs for LLM analysis
[2024-01-20T15:30:47.123Z] LOG: Analyzing paragraph paragraph-0: "The concept of artificial intelligence has..."
[2024-01-20T15:30:48.456Z] ERROR: Failed LLM analysis for paragraph paragraph-0: API timeout
[2024-01-20T15:30:48.789Z] WARN: Extension context lost during analysis of paragraph paragraph-1
```

## 💡 Tips

1. **リアルタイム監視**: 開発中はChrome DevToolsを開いたままにしておく
2. **問題調査**: エラー発生時は `ELA_DEBUG.getErrors()` で即座に確認
3. **ログ保存**: 問題報告時は `ELA_DEBUG.exportLogs()` でログファイルを添付
4. **定期的なクリア**: `ELA_DEBUG.clearLogs()` でログを定期的にクリア
5. **フィルタ活用**: 大量のログから必要な情報を効率的に抽出

このログ監視システムにより、Chrome拡張機能の動作を詳細に監視し、問題の早期発見・解決が可能になります。
