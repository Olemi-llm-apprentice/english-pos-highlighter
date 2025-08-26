// Background Service Worker - シンプル・安定版
class BackgroundService {
    constructor() {
        this.translationCache = new Map(); // 翻訳キャッシュ
        this.processingQueue = new Map();  // 処理中キュー
        this.init();
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
}

// バックグラウンドサービスを初期化
new BackgroundService();

