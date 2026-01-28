// Background Service Worker - シンプル・安定版
class BackgroundService {
    constructor() {
        this.translationCache = new Map(); // 翻訳キャッシュ
        this.processingQueue = new Map();  // 処理中キュー
        this.analysisCache = new Map();    // LLM解析結果キャッシュ
        this.analysisQueue = new Map();    // LLM解析処理キュー
        this.logBuffer = [];               // ログバッファ
        this.maxLogEntries = 1000;         // 最大ログ保持数
        
        this.initLogging();
        this.init();
    }
    
    // ログシステムの初期化
    initLogging() {
        // console.logをラップしてログバッファに保存
        const originalConsoleLog = console.log;
        const originalConsoleError = console.error;
        const originalConsoleWarn = console.warn;
        
        console.log = (...args) => {
            this.addToLogBuffer('LOG', args);
            originalConsoleLog.apply(console, args);
        };
        
        console.error = (...args) => {
            this.addToLogBuffer('ERROR', args);
            originalConsoleError.apply(console, args);
        };
        
        console.warn = (...args) => {
            this.addToLogBuffer('WARN', args);
            originalConsoleWarn.apply(console, args);
        };
        
        console.log('Background service logging initialized');
    }
    
    // ログバッファに追加
    addToLogBuffer(level, args) {
        const timestamp = new Date().toISOString();
        const message = args.map(arg => 
            typeof arg === 'object' ? JSON.stringify(arg, null, 2) : String(arg)
        ).join(' ');
        
        this.logBuffer.push({
            timestamp,
            level,
            message,
            source: 'background'
        });
        
        // バッファサイズ制限
        if (this.logBuffer.length > this.maxLogEntries) {
            this.logBuffer.shift(); // 古いログを削除
        }
    }
    
    // ログ取得（フィルタ対応）
    getLogs(filter = {}, limit = 100) {
        let filteredLogs = this.logBuffer;
        
        // レベルフィルタ
        if (filter.level) {
            filteredLogs = filteredLogs.filter(log => log.level === filter.level);
        }
        
        // 時間フィルタ（最近N分）
        if (filter.minutes) {
            const cutoffTime = new Date(Date.now() - filter.minutes * 60 * 1000);
            filteredLogs = filteredLogs.filter(log => new Date(log.timestamp) > cutoffTime);
        }
        
        // メッセージ検索
        if (filter.search) {
            const searchTerm = filter.search.toLowerCase();
            filteredLogs = filteredLogs.filter(log => 
                log.message.toLowerCase().includes(searchTerm)
            );
        }
        
        // 制限数適用
        return filteredLogs.slice(-limit);
    }
    
    // ログをファイルとしてエクスポート
    async exportLogs() {
        try {
            const logs = this.logBuffer;
            const logText = logs.map(log => 
                `[${log.timestamp}] ${log.level}: ${log.message}`
            ).join('\n');
            
            // Blob作成
            const blob = new Blob([logText], { type: 'text/plain' });
            const url = URL.createObjectURL(blob);
            
            // ダウンロード用のデータを返す
            return {
                success: true,
                downloadUrl: url,
                filename: `extension-logs-${new Date().toISOString().slice(0, 19).replace(/:/g, '-')}.txt`,
                logCount: logs.length
            };
            
        } catch (error) {
            console.error('Log export error:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }
    
    // ログクリア
    clearLogs() {
        this.logBuffer = [];
        console.log('Log buffer cleared');
    }
    
    init() {
        this.setupEventListeners();
        console.log('Background service initialized');
    }
    
    setupEventListeners() {
        // 拡張機能インストール時の初期化
        chrome.runtime.onInstalled.addListener((details) => {
            if (details.reason === 'install') {
                this.onFirstInstall();
            }
        });
        
        // メッセージハンドリング
        chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
            this.handleMessage(message, sender, sendResponse);
            return true; // 非同期レスポンスを有効にする
        });
    }
    
    async onFirstInstall() {
        console.log('English Learning Assistant がインストールされました');
        
        // デフォルト設定を保存
        try {
            await chrome.storage.local.set({
                elaSettings: {
                    posTagging: true,
                    dictionary: true,
                    translation: true,
                    apiKey: ''
                },
                elaActive: false
            });
        } catch (error) {
            console.error('Initial settings save error:', error);
        }
    }
    
    async handleMessage(message, sender, sendResponse) {
        try {
            switch (message.type) {
                case 'LOOKUP_WORD':
                    const definition = await this.lookupWord(message.word);
                    sendResponse(definition);
                    break;
                    
                case 'TRANSLATE_TEXT':
                    const translation = await this.translateText(message.text);
                    sendResponse(translation);
                    break;
                    
                case 'START_BACKGROUND_TRANSLATION':
                    this.startBackgroundTranslation(message.pageId, message.sentences);
                    sendResponse({ success: true, message: 'Background translation started' });
                    break;
                    
                case 'GET_CACHED_TRANSLATION':
                    const cached = this.getCachedTranslation(message.text);
                    sendResponse(cached);
                    break;
                    
                case 'ANALYZE_TEXT_WITH_LLM':
                    if (message.paragraphId) {
                        // 新しい段落ベース処理
                        const result = await this.analyzeParagraphWithLLM(message.pageId, message.sentences, message.paragraphId);
                        sendResponse(result);
                    } else {
                        // 旧システム（下位互換性）
                        this.analyzeTextWithLLM(message.pageId, message.sentences);
                        sendResponse({ success: true, message: 'LLM analysis started' });
                    }
                    break;
                    
                case 'GET_WORD_ANALYSIS':
                    const analysis = await this.getWordAnalysis(message.word, message.sentence);
                    sendResponse(analysis);
                    break;
                    
                case 'CONTEXT_CHECK':
                    // Extension context有効性確認用の軽量メッセージ
                    sendResponse({ success: true, timestamp: Date.now() });
                    break;
                    
                case 'GET_LOGS':
                    // ログ取得
                    const logs = this.getLogs(message.filter, message.limit);
                    sendResponse({ success: true, logs: logs });
                    break;
                    
                case 'EXPORT_LOGS':
                    // ログエクスポート
                    const exportResult = await this.exportLogs();
                    sendResponse(exportResult);
                    break;
                    
                case 'CLEAR_LOGS':
                    // ログクリア
                    this.clearLogs();
                    sendResponse({ success: true, message: 'Logs cleared' });
                    break;
                    
                default:
                    sendResponse({ success: false, error: 'Unknown message type' });
            }
        } catch (error) {
            console.error('Message handling error:', error);
            sendResponse({ success: false, error: error.message });
        }
    }
    
    async lookupWord(word) {
        try {
            // 英英辞書から定義を取得
            const englishDefinition = await this.fetchEnglishDefinition(word);
            
            if (!englishDefinition) {
                return { success: false, error: '辞書データが見つかりません' };
            }
            
            // 定義を日本語に翻訳
            const japaneseDefinition = await this.translateDefinitionToJapanese(englishDefinition);
            
            return { 
                success: true, 
                definition: japaneseDefinition 
            };
            
        } catch (error) {
            console.error('Word lookup error:', error);
            return { success: false, error: '辞書検索でエラーが発生しました' };
        }
    }
    
    async fetchEnglishDefinition(word) {
        try {
            const response = await fetch(`https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(word)}`);
            
            if (!response.ok) {
                return null;
            }
            
            const data = await response.json();
            return data[0]; // 最初の結果を返す
            
        } catch (error) {
            console.error('Dictionary API error:', error);
            return null;
        }
    }
    
    async translateDefinitionToJapanese(englishDefinition) {
        try {
            const result = {
                word: englishDefinition.word,
                phonetic: englishDefinition.phonetic || '',
                meanings: []
            };
            
            // 各品詞の意味を翻訳
            for (const meaning of englishDefinition.meanings.slice(0, 2)) { // 最大2つの品詞
                const translatedMeaning = {
                    partOfSpeech: this.translatePartOfSpeech(meaning.partOfSpeech),
                    definitions: []
                };
                
                // 定義を翻訳（最大2個まで）
                const definitionsToTranslate = meaning.definitions.slice(0, 2);
                
                for (const def of definitionsToTranslate) {
                    try {
                        const translatedDef = await this.translateText(def.definition);
                        
                        const translatedDefinition = {
                            definition: translatedDef.success ? translatedDef.translation : def.definition,
                            example: ''
                        };
                        
                        // 例文も翻訳
                        if (def.example) {
                            const translatedExample = await this.translateText(def.example);
                            translatedDefinition.example = translatedExample.success ? translatedExample.translation : def.example;
                        }
                        
                        translatedMeaning.definitions.push(translatedDefinition);
                        
                    } catch (error) {
                        // 翻訳に失敗した場合は英語のまま
                        translatedMeaning.definitions.push({
                            definition: def.definition,
                            example: def.example || ''
                        });
                    }
                }
                
                result.meanings.push(translatedMeaning);
            }
            
            return result;
            
        } catch (error) {
            console.error('Definition translation error:', error);
            // エラーの場合は英語のまま返す
            return englishDefinition;
        }
    }
    
    translatePartOfSpeech(pos) {
        const translations = {
            'noun': '名詞',
            'verb': '動詞',
            'adjective': '形容詞',
            'adverb': '副詞',
            'preposition': '前置詞',
            'pronoun': '代名詞',
            'conjunction': '接続詞',
            'interjection': '感嘆詞',
            'determiner': '限定詞'
        };
        
        return translations[pos.toLowerCase()] || pos;
    }
    
    async translateText(text) {
        try {
            // OpenAI APIを使用した翻訳を試行
            const openaiResult = await this.translateWithOpenAI(text);
            if (openaiResult.success) {
                return openaiResult;
            }
            
            // フォールバック: 簡易翻訳
            const simpleResult = this.simpleTranslate(text);
            return {
                success: true,
                translation: simpleResult,
                method: 'simple'
            };
            
        } catch (error) {
            console.error('Translation error:', error);
            return {
                success: false,
                error: '翻訳に失敗しました'
            };
        }
    }
    
    async translateWithOpenAI(text) {
        try {
            const apiKey = await this.getOpenAIKey();
            if (!apiKey) {
                throw new Error('API key not configured');
            }
            
            const response = await fetch('https://api.openai.com/v1/chat/completions', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${apiKey}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    model: 'gpt-4.1-nano',
                    messages: [
                        {
                            role: 'system',
                            content: 'あなたは英日翻訳の専門家です。自然で正確な日本語に翻訳してください。/n翻訳のみを出力してください。それ以外の発言は禁じます。/n翻訳した文章を理解し、段落などは見やすい位置で、改行やスペースを使用してください。/nそれ以外の強調表現、太字表現などは禁じます。'
},
                        {
                            role: 'user',
                            content: `以下の英文を日本語に翻訳してください：\n\n${text}`
                        }
                    ],
                    max_tokens: 500,
                    temperature: 0.2
                })
            });
            
            if (response.status === 503) {
                // 503エラーの場合は一時的なサーバーエラーとして処理
                throw new Error('OpenAI service temporarily unavailable (503)');
            }
            
            if (response.status === 429) {
                // レート制限エラー
                throw new Error('Rate limit exceeded (429)');
            }
            
            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                throw new Error(`OpenAI API error: ${response.status} - ${errorData.error?.message || 'Unknown error'}`);
            }
            
            const data = await response.json();
            
            if (!data.choices || !data.choices[0] || !data.choices[0].message) {
                throw new Error('Invalid response format from OpenAI');
            }
            
            const translation = data.choices[0].message.content.trim();
            
            return {
                success: true,
                translation: translation,
                method: 'openai'
            };
            
        } catch (error) {
            console.error('OpenAI translation error:', error);
            
            // 503エラーの場合は特別なメッセージ
            if (error.message.includes('503')) {
                throw new Error('OpenAIサービスが一時的に利用できません。しばらく待ってから再試行してください。');
            }
            
            // 429エラーの場合
            if (error.message.includes('429')) {
                throw new Error('API使用量の上限に達しました。しばらく待ってから再試行してください。');
            }
            
            throw error;
        }
    }
    
    async getOpenAIKey() {
        try {
            // まずlocalストレージを確認
            let result = await chrome.storage.local.get(['elaSettings']);
            
            // localにない場合はsyncストレージを確認
            if (!result.elaSettings || !result.elaSettings.apiKey) {
                result = await chrome.storage.sync.get(['elaSettings']);
            }
            
            if (result.elaSettings && result.elaSettings.apiKey) {
                return result.elaSettings.apiKey;
            }
            
            return null;
        } catch (error) {
            console.error('API key retrieval error:', error);
            return null;
        }
    }
    
    simpleTranslate(text) {
        // 簡易翻訳（フォールバック）
        const translations = {
            'hello': 'こんにちは',
            'world': '世界',
            'good': '良い',
            'bad': '悪い',
            'yes': 'はい',
            'no': 'いいえ',
            'thank you': 'ありがとう',
            'please': 'お願いします',
            'sorry': 'すみません',
            'excuse me': 'すみません',
            'the': '',
            'a': '',
            'an': '',
            'and': 'と',
            'or': 'または',
            'but': 'しかし',
            'is': 'です',
            'are': 'です',
            'was': 'でした',
            'were': 'でした'
        };
        
        const lowerText = text.toLowerCase();
        return translations[lowerText] || `[翻訳] ${text}`;
    }
    
    // バックグラウンド全体翻訳を開始
    async startBackgroundTranslation(pageId, sentences) {
        try {
            console.log(`Starting background translation for page: ${pageId}`);
            
            // 既に処理中の場合はスキップ
            if (this.processingQueue.has(pageId)) {
                console.log(`Page ${pageId} is already being processed`);
                return;
            }
            
            // 処理中フラグを設定
            this.processingQueue.set(pageId, true);
            
            // 文章を結合して全体翻訳
            const fullText = sentences.join(' ');
            
            // キャッシュ確認
            const cacheKey = this.generateCacheKey(fullText);
            if (this.translationCache.has(cacheKey)) {
                console.log(`Translation found in cache for page: ${pageId}`);
                this.processingQueue.delete(pageId);
                return;
            }
            
            // 翻訳実行
            console.log(`Translating ${sentences.length} sentences for page: ${pageId}`);
            const translationResult = await this.translateText(fullText);
            
            if (translationResult.success) {
                // キャッシュに保存
                this.translationCache.set(cacheKey, {
                    translation: translationResult.translation,
                    timestamp: Date.now(),
                    pageId: pageId
                });
                
                console.log(`Background translation completed for page: ${pageId}`);
                
                // コンテンツスクリプトに完了通知
                this.notifyTranslationComplete(pageId, translationResult.translation);
            }
            
        } catch (error) {
            console.error(`Background translation error for page ${pageId}:`, error);
        } finally {
            this.processingQueue.delete(pageId);
        }
    }
    
    // キャッシュから翻訳結果を取得
    getCachedTranslation(text) {
        const cacheKey = this.generateCacheKey(text);
        const cached = this.translationCache.get(cacheKey);
        
        if (cached) {
            // 1時間でキャッシュ期限切れ
            const isExpired = Date.now() - cached.timestamp > 3600000;
            if (!isExpired) {
                return {
                    success: true,
                    translation: cached.translation,
                    cached: true
                };
            } else {
                this.translationCache.delete(cacheKey);
            }
        }
        
        return { success: false, cached: false };
    }
    
    // キャッシュキー生成
    generateCacheKey(text) {
        // テキストのハッシュを生成（簡易版）
        let hash = 0;
        for (let i = 0; i < text.length; i++) {
            const char = text.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash = hash & hash; // 32bit整数に変換
        }
        return `translation_${Math.abs(hash)}`;
    }
    
    // 翻訳完了をコンテンツスクリプトに通知
    async notifyTranslationComplete(pageId, translation) {
        try {
            const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
            if (tabs.length > 0) {
                chrome.tabs.sendMessage(tabs[0].id, {
                    type: 'BACKGROUND_TRANSLATION_COMPLETE',
                    pageId: pageId,
                    translation: translation
                });
            }
        } catch (error) {
            console.error('Failed to notify translation complete:', error);
        }
    }
    
    // LLMによるテキスト解析を開始
    async analyzeTextWithLLM(pageId, sentences) {
        try {
            console.log(`Starting LLM analysis for page: ${pageId}`);
            
            // 既に処理中の場合はスキップ
            if (this.analysisQueue.has(pageId)) {
                console.log(`Page ${pageId} is already being analyzed`);
                return;
            }
            
            // 処理中フラグを設定
            this.analysisQueue.set(pageId, true);
            
            // 文章を結合
            const fullText = sentences.join(' ');
            
            // キャッシュ確認
            const cacheKey = this.generateAnalysisCacheKey(fullText);
            if (this.analysisCache.has(cacheKey)) {
                console.log(`Analysis found in cache for page: ${pageId}`);
                this.analysisQueue.delete(pageId);
                return;
            }
            
            // LLM解析実行
            console.log(`Analyzing ${sentences.length} sentences with LLM for page: ${pageId}`);
            const analysisResult = await this.performLLMAnalysis(fullText);
            
            if (analysisResult.success) {
                // キャッシュに保存
                this.analysisCache.set(cacheKey, {
                    analysis: analysisResult.analysis,
                    timestamp: Date.now(),
                    pageId: pageId
                });
                
                console.log(`LLM analysis completed for page: ${pageId}`);
                
                // コンテンツスクリプトに完了通知
                this.notifyAnalysisComplete(pageId, analysisResult.analysis);
            }
            
        } catch (error) {
            console.error(`LLM analysis error for page ${pageId}:`, error);
        } finally {
            this.analysisQueue.delete(pageId);
        }
    }
    
    // 段落ベースのLLM解析（新システム）
    async analyzeParagraphWithLLM(pageId, sentences, paragraphId) {
        try {
            console.log(`Starting paragraph-based LLM analysis for paragraph: ${paragraphId}`);
            
            if (!sentences || sentences.length === 0) {
                return { success: false, error: 'No sentences provided for analysis' };
            }
            
            // 段落のテキストを結合
            const paragraphText = sentences.join(' ');
            
            if (paragraphText.length < 10) {
                return { success: false, error: 'Paragraph text too short for analysis' };
            }
            
            // キャッシュ確認（段落単位）
            const cacheKey = this.generateAnalysisCacheKey(paragraphText);
            if (this.analysisCache.has(cacheKey)) {
                console.log(`Paragraph analysis found in cache: ${paragraphId}`);
                const cached = this.analysisCache.get(cacheKey);
                return { success: true, analysis: cached.analysis, paragraphId: paragraphId };
            }
            
            // LLM解析実行
            console.log(`Analyzing paragraph ${paragraphId} with ${paragraphText.length} characters`);
            const analysisResult = await this.performLLMAnalysis(paragraphText);
            
            if (analysisResult.success) {
                // キャッシュに保存
                this.analysisCache.set(cacheKey, {
                    analysis: analysisResult.analysis,
                    timestamp: Date.now(),
                    paragraphId: paragraphId
                });
                
                console.log(`Paragraph LLM analysis completed: ${paragraphId}`);
                return { 
                    success: true, 
                    analysis: analysisResult.analysis, 
                    paragraphId: paragraphId 
                };
            } else {
                console.error(`LLM analysis failed for paragraph ${paragraphId}:`, analysisResult.error);
                return { 
                    success: false, 
                    error: analysisResult.error || 'LLM analysis failed',
                    paragraphId: paragraphId 
                };
            }
            
        } catch (error) {
            console.error(`Paragraph LLM analysis error for ${paragraphId}:`, error);
            return { 
                success: false, 
                error: error.message || 'Unknown error during paragraph analysis',
                paragraphId: paragraphId 
            };
        }
    }
    
    // LLM解析の実行
    async performLLMAnalysis(text) {
        return await this.performLLMAnalysisWithRetry(text, 3);
    }
    
    // リトライ機能付きLLM解析
    async performLLMAnalysisWithRetry(text, maxRetries = 3) {
        for (let attempt = 1; attempt <= maxRetries; attempt++) {
            try {
                const apiKey = await this.getOpenAIKey();
                if (!apiKey) {
                    throw new Error('API key not configured');
                }
                
                console.log(`LLM analysis attempt ${attempt}/${maxRetries}`);
                
                const response = await fetch('https://api.openai.com/v1/chat/completions', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${apiKey}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    model: 'gpt-4.1-nano',
                    response_format: { "type": "json_object" },
                    messages: [
                        {
                            role: 'system',
                            content: `あなたは英語学習支援の専門家です。与えられた英文を解析し、必ずJSON形式で応答してください。

**重要：与えられた英文に含まれる全ての単語（冠詞、前置詞、代名詞なども含む）を漏れなく解析してください。句読点は除外し、contractions（can't, you're等）は1つの単語として扱ってください。**

以下の形式でJSONを出力してください：

{
  "words": [
    {
      "word": "単語",
      "pos": "品詞（noun/verb/adjective/adverb/preposition/pronoun/conjunction/determiner）",
      "basic_meaning": "単語だけの基本的な意味（他の品詞での使用例も含む）",
      "contextual_meaning": "この文脈での具体的な意味",
      "examples": [
        {
          "english": "例文1（その単語を**単語**のように**で囲んで強調）",
          "japanese": "例文1の日本語訳"
        },
        {
          "english": "例文2（その単語を**単語**のように**で囲んで強調）",
          "japanese": "例文2の日本語訳"
        }
      ],
      "confidence": 0.95,
      "context_notes": "この文脈でどの単語を修飾・説明しているかの文法的解説"
    }
  ],
  "phrases": [
    {
      "phrase": "句動詞・イディオム",
      "type": "phrasal_verb/idiom/collocation",
      "basic_meaning": "基本的な意味",
      "contextual_meaning": "この文脈での意味",
      "examples": [
        {
          "english": "例文（**句動詞**を強調）",
          "japanese": "例文の日本語訳"
        }
      ]
    }
  ]
}

各単語について：
- 文脈に基づく正確な品詞判定
- 基本的な意味（他品詞での使用例も含む）
- この文脈での具体的な意味
- 実用的な例文を2つ（対象単語を**で強調し、日本語訳付き）
- 判定の信頼度（0-1）
- 文法的な関係性の解説

句動詞・イディオムも検出してください。例文では対象語句を**で囲んで強調してください。
品詞は noun/verb/adjective/adverb/preposition/pronoun/conjunction/determiner のいずれかを使用してください。
例文では対象単語を**で囲んで強調してください。
結果は必ず日本語で説明すること。

Few-shot example:
入力: "The cat can't run fast."
完全解析結果:
{
  "words": [
    {
      "word": "The",
      "pos": "determiner",
      "basic_meaning": "定冠詞：特定のものを示す限定詞",
      "contextual_meaning": "特定の猫を指している",
      "examples": [
        {
          "english": "**The** book is on the table.",
          "japanese": "**その**本はテーブルの上にある。"
        },
        {
          "english": "I saw **the** movie yesterday.",
          "japanese": "私は昨日**その**映画を見た。"
        }
      ],
      "confidence": 1.00,
      "context_notes": "名詞'cat'を特定化している限定詞"
    },
    {
      "word": "cat",
      "pos": "noun",
      "basic_meaning": "名詞：猫、動物の一種",
      "contextual_meaning": "動作の主体となる動物",
      "examples": [
        {
          "english": "The **cat** is sleeping.",
          "japanese": "**猫**が眠っている。"
        },
        {
          "english": "I have a **cat** at home.",
          "japanese": "家で**猫**を飼っている。"
        }
      ],
      "confidence": 1.00,
      "context_notes": "文の主語として機能している"
    },
    {
      "word": "can't",
      "pos": "verb",
      "basic_meaning": "助動詞canの否定形：〜できない、〜してはいけない",
      "contextual_meaning": "猫が速く走ることができないという能力の否定",
      "examples": [
        {
          "english": "I **can't** swim.",
          "japanese": "私は泳ぐことが**できない**。"
        },
        {
          "english": "You **can't** park here.",
          "japanese": "ここに駐車**してはいけない**。"
        }
      ],
      "confidence": 0.98,
      "context_notes": "主語'cat'の能力を否定している助動詞"
    },
    {
      "word": "run",
      "pos": "verb",
      "basic_meaning": "動詞：走る、動く、運営する, 名詞：競走、流れ",
      "contextual_meaning": "猫が足を使って移動する動作",
      "examples": [
        {
          "english": "I **run** every morning.",
          "japanese": "私は毎朝**走る**。"
        },
        {
          "english": "The water **runs** down the hill.",
          "japanese": "水が丘を**流れ下る**。"
        }
      ],
      "confidence": 0.95,
      "context_notes": "助動詞'can't'に続く動詞の原形として使用"
    },
    {
      "word": "fast",
      "pos": "adverb",
      "basic_meaning": "副詞：速く、素早く, 形容詞：速い, 動詞：断食する",
      "contextual_meaning": "走る速度が速いという様子",
      "examples": [
        {
          "english": "She drives **fast**.",
          "japanese": "彼女は**速く**運転する。"
        },
        {
          "english": "Time goes **fast**.",
          "japanese": "時間が**速く**過ぎる。"
        }
      ],
      "confidence": 0.92,
      "context_notes": "動詞'run'を修飾している副詞"
    }
  ],
  "phrases": []
}`
                        },
                        {
                            role: 'user',
                            content: `以下の英文を解析してください：\n\n${text}`
                        }
                    ],
                    temperature: 0.1
                })
                });
                
                if (response.status === 503) {
                    throw new Error('Service temporarily unavailable (503)');
                }
                
                if (!response.ok) {
                    throw new Error(`OpenAI API error: ${response.status}`);
                }
                
                const data = await response.json();
                const analysisText = data.choices[0].message.content.trim();
                
                // JSONパース（JSONモード使用だが、不完全なレスポンスの可能性もある）
            let analysis;
            try {
                // 不完全なJSONの修復を試行
                const repairedJson = this.repairIncompleteJSON(analysisText);
                analysis = JSON.parse(repairedJson);
                
                // 基本的な構造チェック
                if (!analysis.words || !Array.isArray(analysis.words)) {
                    throw new Error('Invalid analysis structure: missing words array');
                }
                
                console.log(`Successfully parsed LLM analysis with ${analysis.words.length} words`);
                
                // JSON構造検証
                if (!analysis.words || !Array.isArray(analysis.words)) {
                    console.error('Invalid analysis structure: missing or invalid words array');
                    analysis.words = [];
                }
                
                // 各単語データの検証と修正
                let validWords = 0;
                let fixedWords = 0;
                analysis.words = analysis.words.filter((wordData, index) => {
                    if (!wordData || typeof wordData !== 'object') {
                        console.warn(`Removing invalid word data at index ${index}:`, wordData);
                        return false;
                    }
                    
                    if (!wordData.word || typeof wordData.word !== 'string') {
                        console.warn(`Removing word with invalid 'word' field at index ${index}:`, wordData);
                        return false;
                    }
                    
                    if (!wordData.pos || typeof wordData.pos !== 'string') {
                        console.warn(`Fixing missing POS for word '${wordData.word}'`);
                        wordData.pos = 'unknown';
                        fixedWords++;
                    }
                    
                    if (!wordData.basic_meaning) {
                        wordData.basic_meaning = `${wordData.word}の基本的な意味`;
                        fixedWords++;
                    }
                    
                    if (!wordData.contextual_meaning) {
                        wordData.contextual_meaning = wordData.basic_meaning;
                        fixedWords++;
                    }
                    
                    if (!wordData.examples || !Array.isArray(wordData.examples)) {
                        wordData.examples = [];
                        fixedWords++;
                    }
                    
                    validWords++;
                    return true;
                });
                
                console.log(`JSON validation: ${validWords} valid words, ${fixedWords} fields fixed`);
                
                // DEBUG: プロンプト変更後の構造確認用
                console.log('🔍 LLM Analysis Structure Debug:');
                console.log('- Top-level keys:', Object.keys(analysis));
                console.log('- Total words:', analysis.words.length);
                if (analysis.words.length > 0) {
                    const firstWord = analysis.words[0];
                    console.log('- First word sample:', firstWord);
                    console.log('- Required fields check:');
                    console.log(`  - word: ${firstWord.word || 'MISSING'}`);
                    console.log(`  - pos: ${firstWord.pos || 'MISSING'}`);
                    console.log(`  - basic_meaning: ${firstWord.basic_meaning ? 'PRESENT' : 'MISSING'}`);
                    console.log(`  - contextual_meaning: ${firstWord.contextual_meaning ? 'PRESENT' : 'MISSING'}`);
                    console.log(`  - examples: ${firstWord.examples ? 'PRESENT' : 'MISSING'}`);
                }
                
                return {
                    success: true,
                    analysis: analysis
                };
                
            } catch (parseError) {
                console.error(`Parse error on attempt ${attempt}:`, parseError);
                console.error('Raw response length:', analysisText.length);
                console.error('Raw response (first 500 chars):', analysisText.substring(0, 500));
                console.error('Raw response (last 200 chars):', analysisText.substring(Math.max(0, analysisText.length - 200)));
                
                // プロンプト変更後の構造問題診断用
                console.log('🚨 JSON Parse Error Analysis:');
                console.log('- Error type:', parseError.name);
                console.log('- Error message:', parseError.message);
                if (parseError.message.includes('position')) {
                    const position = parseError.message.match(/position (\d+)/);
                    if (position) {
                        const pos = parseInt(position[1]);
                        console.log(`- Error around position ${pos}:`, analysisText.substring(Math.max(0, pos - 50), pos + 50));
                    }
                }
                
                if (attempt === maxRetries) {
                    // 最後の試行でも失敗した場合はフォールバック
                    console.warn('Using fallback empty analysis structure');
                    return {
                        success: true,
                        analysis: {
                            words: [],
                            phrases: []
                        }
                    };
                }
            }
            
        } catch (error) {
            console.error(`LLM analysis error on attempt ${attempt}:`, error);
            
            // 503エラーの場合はリトライ
            if (error.message.includes('503') && attempt < maxRetries) {
                const delay = Math.pow(2, attempt) * 1000; // 指数バックオフ
                console.log(`Retrying in ${delay}ms...`);
                await new Promise(resolve => setTimeout(resolve, delay));
                continue;
            }
            
            // 最後の試行または503以外のエラー
            if (attempt === maxRetries) {
                return {
                    success: false,
                    error: error.message
                };
            }
        }
        }
        
        return {
            success: false,
            error: 'Max retries exceeded'
        };
    }
    
    // 単語の個別解析を取得
    async getWordAnalysis(word, sentence) {
        try {
            // まず、既存の解析キャッシュから検索
            for (const [cacheKey, cachedData] of this.analysisCache) {
                if (cachedData.analysis && cachedData.analysis.words) {
                    const wordAnalysis = cachedData.analysis.words.find(w => 
                        w.word.toLowerCase() === word.toLowerCase()
                    );
                    if (wordAnalysis) {
                        return {
                            success: true,
                            analysis: wordAnalysis,
                            source: 'cache'
                        };
                    }
                }
            }
            
            // キャッシュにない場合は個別に解析
            const analysisResult = await this.performIndividualWordAnalysis(word, sentence);
            return analysisResult;
            
        } catch (error) {
            console.error('Word analysis error:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }
    
    // 個別単語解析
    async performIndividualWordAnalysis(word, sentence) {
        return await this.performIndividualWordAnalysisWithRetry(word, sentence, 2);
    }
    
    // リトライ機能付き個別単語解析
    async performIndividualWordAnalysisWithRetry(word, sentence, maxRetries = 2) {
        for (let attempt = 1; attempt <= maxRetries; attempt++) {
            try {
                const apiKey = await this.getOpenAIKey();
                if (!apiKey) {
                    throw new Error('API key not configured');
                }
                
                console.log(`Individual word analysis attempt ${attempt}/${maxRetries} for: ${word}`);
                
                const response = await fetch('https://api.openai.com/v1/chat/completions', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${apiKey}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    model: 'gpt-4.1-nano',
                    response_format: { "type": "json_object" },
                    messages: [
                        {
                            role: 'system',
                            content: `あなたは英語学習支援の専門家です。与えられた英文を解析し、必ずJSON形式で応答してください。

**重要：与えられた英文に含まれる全ての単語（冠詞、前置詞、代名詞なども含む）を漏れなく解析してください。句読点は除外し、contractions（can't, you're等）は1つの単語として扱ってください。**

以下の形式でJSONを出力してください：
{
  "word": "単語",
  "pos": "品詞",
  "basic_meaning": "単語だけの基本的な意味（他の品詞での使用例も含む）",
  "contextual_meaning": "この文脈での具体的な意味",
  "examples": [
    {
      "english": "例文1（その単語を**単語**のように**で囲んで強調）",
      "japanese": "例文1の日本語訳"
    },
    {
      "english": "例文2（その単語を**単語**のように**で囲んで強調）",
      "japanese": "例文2の日本語訳"
    }
  ],
  "confidence": 0.95,
  "context_notes": "この文脈でどの単語を修飾・説明しているかの文法的解説"
}

句動詞・イディオムも検出してください。例文では対象語句を**で囲んで強調してください。
品詞は noun/verb/adjective/adverb/preposition/pronoun/conjunction/determiner のいずれかを使用してください。
例文では対象単語を**で囲んで強調してください。
結果は必ず日本語で説明すること。

Few-shot example:
入力: "The cat can't run fast."
完全解析結果:
{
  "words": [
    {
      "word": "The",
      "pos": "determiner",
      "basic_meaning": "定冠詞：特定のものを示す限定詞",
      "contextual_meaning": "特定の猫を指している",
      "examples": [
        {
          "english": "**The** book is on the table.",
          "japanese": "**その**本はテーブルの上にある。"
        },
        {
          "english": "I saw **the** movie yesterday.",
          "japanese": "私は昨日**その**映画を見た。"
        }
      ],
      "confidence": 1.00,
      "context_notes": "名詞'cat'を特定化している限定詞"
    },
    {
      "word": "cat",
      "pos": "noun",
      "basic_meaning": "名詞：猫、動物の一種",
      "contextual_meaning": "動作の主体となる動物",
      "examples": [
        {
          "english": "The **cat** is sleeping.",
          "japanese": "**猫**が眠っている。"
        },
        {
          "english": "I have a **cat** at home.",
          "japanese": "家で**猫**を飼っている。"
        }
      ],
      "confidence": 1.00,
      "context_notes": "文の主語として機能している"
    },
    {
      "word": "can't",
      "pos": "verb",
      "basic_meaning": "助動詞canの否定形：〜できない、〜してはいけない",
      "contextual_meaning": "猫が速く走ることができないという能力の否定",
      "examples": [
        {
          "english": "I **can't** swim.",
          "japanese": "私は泳ぐことが**できない**。"
        },
        {
          "english": "You **can't** park here.",
          "japanese": "ここに駐車**してはいけない**。"
        }
      ],
      "confidence": 0.98,
      "context_notes": "主語'cat'の能力を否定している助動詞"
    },
    {
      "word": "run",
      "pos": "verb",
      "basic_meaning": "動詞：走る、動く、運営する, 名詞：競走、流れ",
      "contextual_meaning": "猫が足を使って移動する動作",
      "examples": [
        {
          "english": "I **run** every morning.",
          "japanese": "私は毎朝**走る**。"
        },
        {
          "english": "The water **runs** down the hill.",
          "japanese": "水が丘を**流れ下る**。"
        }
      ],
      "confidence": 0.95,
      "context_notes": "助動詞'can't'に続く動詞の原形として使用"
    },
    {
      "word": "fast",
      "pos": "adverb",
      "basic_meaning": "副詞：速く、素早く, 形容詞：速い, 動詞：断食する",
      "contextual_meaning": "走る速度が速いという様子",
      "examples": [
        {
          "english": "She drives **fast**.",
          "japanese": "彼女は**速く**運転する。"
        },
        {
          "english": "Time goes **fast**.",
          "japanese": "時間が**速く**過ぎる。"
        }
      ],
      "confidence": 0.92,
      "context_notes": "動詞'run'を修飾している副詞"
    }
  ],
  "phrases": []
}`
                        },
                        {
                            role: 'user',
                            content: `文章："${sentence}"\n\n上記文章における単語「${word}」を解析してください。`
                        }
                    ],
                    temperature: 0.1
                })
                });
                
                if (response.status === 503) {
                    throw new Error('Service temporarily unavailable (503)');
                }
                
                if (!response.ok) {
                    throw new Error(`OpenAI API error: ${response.status}`);
                }
                
                const data = await response.json();
                const analysisText = data.choices[0].message.content.trim();
                
                // 不完全なJSONの修復を試行
                const repairedJson = this.repairIncompleteJSON(analysisText);
                const analysis = JSON.parse(repairedJson);
                
                // 基本的な構造チェック
                if (!analysis.word || !analysis.pos) {
                    throw new Error('Invalid word analysis structure');
                }
                
                console.log(`Successfully parsed individual word analysis for: ${analysis.word}`);
                return {
                    success: true,
                    analysis: analysis,
                    source: 'individual'
                };
                
            } catch (error) {
                console.error(`Individual word analysis error on attempt ${attempt} for ${word}:`, error);
                
                // 503エラーの場合はリトライ
                if (error.message.includes('503') && attempt < maxRetries) {
                    const delay = Math.pow(2, attempt) * 500; // 指数バックオフ（短め）
                    console.log(`Retrying individual analysis in ${delay}ms...`);
                    await new Promise(resolve => setTimeout(resolve, delay));
                    continue;
                }
                
                // JSON解析エラーの場合もリトライ
                if (error.message.includes('JSON') && attempt < maxRetries) {
                    console.log(`Retrying due to JSON parse error...`);
                    await new Promise(resolve => setTimeout(resolve, 1000));
                    continue;
                }
                
                // 最後の試行
                if (attempt === maxRetries) {
                    return {
                        success: false,
                        error: error.message
                    };
                }
            }
        }
        
        return {
            success: false,
            error: 'Max retries exceeded for individual word analysis'
        };
    }
    
    // 解析キャッシュキー生成
    generateAnalysisCacheKey(text) {
        let hash = 0;
        for (let i = 0; i < text.length; i++) {
            const char = text.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash = hash & hash;
        }
        return `analysis_${Math.abs(hash)}`;
    }
    
    // 解析完了をコンテンツスクリプトに通知
    async notifyAnalysisComplete(pageId, analysis) {
        try {
            const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
            if (tabs.length > 0) {
                chrome.tabs.sendMessage(tabs[0].id, {
                    type: 'LLM_ANALYSIS_COMPLETE',
                    pageId: pageId,
                    analysis: analysis
                });
            }
        } catch (error) {
            console.error('Failed to notify analysis complete:', error);
        }
    }
    
    // JSON抽出とクリーンアップ
    extractAndCleanJSON(text) {
        try {
            // まず```json```ブロックから抽出を試行
            let jsonMatch = text.match(/```json\s*([\s\S]*?)\s*```/);
            if (!jsonMatch) {
                // 次に```ブロックから抽出を試行
                jsonMatch = text.match(/```\s*([\s\S]*?)\s*```/);
            }
            
            let jsonText = jsonMatch ? jsonMatch[1] : text;
            
            // 最初と最後の{...}を抽出
            const firstBrace = jsonText.indexOf('{');
            const lastBrace = jsonText.lastIndexOf('}');
            
            if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
                jsonText = jsonText.substring(firstBrace, lastBrace + 1);
            }
            
            // 一般的な問題を修正
            jsonText = jsonText
                // 末尾のカンマを削除
                .replace(/,(\s*[}\]])/g, '$1')
                // 不正な改行を修正
                .replace(/\n/g, ' ')
                // 連続するスペースを単一のスペースに
                .replace(/\s+/g, ' ')
                // 文字列内の不正なエスケープを修正
                .replace(/\\"/g, '\\"')
                // 制御文字を削除
                .replace(/[\u0000-\u001F\u007F-\u009F]/g, '');
            
            return jsonText.trim();
        } catch (error) {
            console.error('JSON extraction error:', error);
            return text;
        }
    }
    
    // 不完全なJSONを修復
    repairIncompleteJSON(text) {
        try {
            // 基本的なクリーンアップ
            let cleaned = text.trim();
            
            // 最初と最後の{}を確認
            const firstBrace = cleaned.indexOf('{');
            if (firstBrace === -1) {
                throw new Error('No opening brace found');
            }
            
            // 最後の}の位置を確認
            let lastBrace = cleaned.lastIndexOf('}');
            
            // }が見つからない、または不完全な場合
            if (lastBrace === -1 || lastBrace < firstBrace) {
                // 不完全なJSON構造を修復
                console.warn('Attempting to repair incomplete JSON');
                
                // 途中で切れた文字列を閉じる
                const openQuotes = (cleaned.match(/"/g) || []).length;
                if (openQuotes % 2 !== 0) {
                    cleaned += '"';
                }
                
                // 配列やオブジェクトを閉じる
                const openBrackets = (cleaned.match(/\[/g) || []).length;
                const closeBrackets = (cleaned.match(/\]/g) || []).length;
                for (let i = 0; i < openBrackets - closeBrackets; i++) {
                    cleaned += ']';
                }
                
                const openBraces = (cleaned.match(/\{/g) || []).length;
                const closeBraces = (cleaned.match(/\}/g) || []).length;
                for (let i = 0; i < openBraces - closeBraces; i++) {
                    cleaned += '}';
                }
                
                lastBrace = cleaned.lastIndexOf('}');
            }
            
            // {}の範囲を抽出
            if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
                cleaned = cleaned.substring(firstBrace, lastBrace + 1);
            }
            
            // その他の修正
            cleaned = cleaned
                // 末尾のカンマを削除
                .replace(/,(\s*[}\]])/g, '$1')
                // 不正な改行を修正
                .replace(/\r?\n/g, ' ')
                // 連続するスペースを単一のスペースに
                .replace(/\s+/g, ' ')
                // 制御文字を削除
                .replace(/[\u0000-\u001F\u007F-\u009F]/g, '');
            
            return cleaned;
        } catch (error) {
            console.error('JSON repair error:', error);
            return text;
        }
    }
}

// バックグラウンドサービスを初期化
new BackgroundService();

