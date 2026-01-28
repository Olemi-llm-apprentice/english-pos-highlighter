// English Learning Assistant - Content Script (シンプル・安定版)
console.log('🚀 Content script file loaded');

class EnglishLearningAssistant {
    constructor() {
        this.isActive = false;
        this.settings = {
            posTagging: true,
            dictionary: true,
            translation: true,
            apiKey: ''
        };
        
        this.processedElements = new WeakSet();
        this.tooltipElement = null;
        this.currentTooltipWord = null;
        this.hideTooltipTimer = null;
        this.pageId = this.generatePageId();
        this.paragraphTranslations = new Map();
        this.llmAnalysisResults = new Map();  // LLM解析結果
        this.analysisInProgress = false;      // LLM解析進行フラグ
        this.contextInvalidated = false;     // コンテキスト無効化フラグ
        this.dictionaryCache = new Map();    // 辞書結果キャッシュ
        this.pendingRequests = new Map();   // 進行中のリクエスト追跡
        this.logBuffer = [];                 // Content script ログバッファ
        this.maxLogEntries = 500;            // Content script ログ保持数
        
        // キャッシュサイズ設定（調整可能）
        this.MAX_DICTIONARY_CACHE = 2000;
        this.MAX_LLM_CACHE = 2000;
        
        this.init();
        this.setupContextMonitoring();
        this.setupCacheMonitoring();
        // フォールバック機能は無効化（LLM解析のみ使用）
    }
    
    init() {
        this.setupMessageListener();
        this.setupLoggingSystem();
        console.log('English Learning Assistant initialized');
    }
    
    // ログシステムのセットアップ
    setupLoggingSystem() {
        // グローバルなログ監視コマンドを追加
        window.ELA_DEBUG = {
            // ログ取得
            getLogs: async (filter = {}, limit = 100) => {
                try {
                    const response = await this.sendMessageWithTimeout({
                        type: 'GET_LOGS',
                        filter: filter,
                        limit: limit
                    }, 5000);
                    
                    if (response.success) {
                        console.table(response.logs);
                        return response.logs;
                    } else {
                        console.error('Failed to get logs:', response.error);
                        return null;
                    }
                } catch (error) {
                    console.error('Error getting logs:', error);
                    return null;
                }
            },
            
            // エラーログのみ取得
            getErrors: async (limit = 50) => {
                return await window.ELA_DEBUG.getLogs({ level: 'ERROR' }, limit);
            },
            
            // 最近のログ取得（最近N分）
            getRecent: async (minutes = 10, limit = 100) => {
                return await window.ELA_DEBUG.getLogs({ minutes: minutes }, limit);
            },
            
            // ログ検索
            search: async (searchTerm, limit = 100) => {
                return await window.ELA_DEBUG.getLogs({ search: searchTerm }, limit);
            },
            
            // ログをファイルでダウンロード
            exportLogs: async () => {
                try {
                    const response = await this.sendMessageWithTimeout({
                        type: 'EXPORT_LOGS'
                    }, 10000);
                    
                    if (response.success) {
                        // ダウンロード実行
                        const a = document.createElement('a');
                        a.href = response.downloadUrl;
                        a.download = response.filename;
                        document.body.appendChild(a);
                        a.click();
                        document.body.removeChild(a);
                        
                        console.log(`Exported ${response.logCount} log entries to ${response.filename}`);
                        return response;
                    } else {
                        console.error('Failed to export logs:', response.error);
                        return null;
                    }
                } catch (error) {
                    console.error('Error exporting logs:', error);
                    return null;
                }
            },
            
            // ログクリア
            clearLogs: async () => {
                try {
                    const response = await this.sendMessageWithTimeout({
                        type: 'CLEAR_LOGS'
                    }, 5000);
                    
                    if (response.success) {
                        console.log('Logs cleared successfully');
                        return true;
                    } else {
                        console.error('Failed to clear logs:', response.error);
                        return false;
                    }
                } catch (error) {
                    console.error('Error clearing logs:', error);
                    return false;
                }
            },
            
            // デバッグ情報表示
            status: () => {
                console.log('🔍 English Learning Assistant Debug Status');
                console.log(`📄 Page ID: ${this.pageId}`);
                console.log(`🔄 Analysis in progress: ${this.analysisInProgress}`);
                console.log(`❌ Context invalidated: ${this.contextInvalidated}`);
                console.log(`📚 Dictionary cache: ${this.dictionaryCache.size} entries`);
                console.log(`🤖 LLM cache: ${this.llmAnalysisResults.size} entries`);
                console.log(`⏳ Pending requests: ${this.pendingRequests.size}`);
                console.log('');
                console.log('📋 Available commands:');
                console.log('  ELA_DEBUG.getLogs() - Get all logs');
                console.log('  ELA_DEBUG.getErrors() - Get error logs only');
                console.log('  ELA_DEBUG.getRecent(10) - Get logs from last 10 minutes');
                console.log('  ELA_DEBUG.search("keyword") - Search logs');
                console.log('  ELA_DEBUG.exportLogs() - Download logs as file');
                console.log('  ELA_DEBUG.clearLogs() - Clear all logs');
                console.log('  ELA_DEBUG.status() - Show this status');
            }
        };
        
        console.log('🔍 ELA Debug system initialized. Type ELA_DEBUG.status() for commands.');
        
        // デバッグ確認用のグローバル変数も設定
        window.ELA_EXTENSION_LOADED = true;
        window.ELA_VERSION = '3.0.0';
        
        // 緊急時のデバッグ情報表示
        window.checkELA = () => {
            console.log('✅ English Learning Assistant is loaded');
            console.log(`📦 Version: ${window.ELA_VERSION}`);
            console.log(`🆔 Page ID: ${this.pageId}`);
            console.log(`🔧 ELA_DEBUG available: ${typeof window.ELA_DEBUG !== 'undefined'}`);
            console.log('Use ELA_DEBUG.status() for full debug info');
        };
    }
    
    setupMessageListener() {
        // Extension context invalidated チェック
        if (!chrome.runtime?.id) {
            console.warn('Extension context invalidated, skipping message listener setup');
            return;
        }
        
        chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
            // 非同期処理のためのラッパー
            (async () => {
                try {
                    await this.handleMessage(message, sender, sendResponse);
                } catch (error) {
                    console.error('Async message handling error:', error);
                    try {
                        sendResponse({ success: false, error: error.message || 'Unknown error' });
                    } catch (responseError) {
                        console.error('Failed to send error response:', responseError);
                    }
                }
            })();
            
            return true; // 非同期レスポンス
        });
    }
    
    generatePageId() {
        // ページのユニークIDを生成
        return `page_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }
    
    setupContextMonitoring() {
        // Extension context監視を無効化（問題の根本的解決）
        // 代わりに実際のメッセージ送信時にのみエラーハンドリング
        console.log('Extension context monitoring disabled - using on-demand error handling');
        
        // ページ離脱時のクリーンアップのみ維持
        window.addEventListener('beforeunload', () => {
            if (this.contextCheckInterval) {
                clearInterval(this.contextCheckInterval);
            }
        });
    }
    
    handleContextInvalidation() {
        console.warn('Extension context invalidated - switching to lightweight mode');
        
        // フラグのみ設定（過度な処理を避ける）
        this.contextInvalidated = true;
        this.analysisInProgress = false;
        
        // 進行中のリクエストをクリア
        this.pendingRequests.clear();
        
        // 軽量通知のみ（大げさなバナーは避ける）
        console.warn('Extension functions may be limited until reload');
    }
    

    
    // メモリ使用量とキャッシュ統計を取得
    getCacheStatistics() {
        const estimateObjectSize = (obj) => {
            const jsonString = JSON.stringify(obj);
            return new Blob([jsonString]).size;
        };
        
        let dictionaryCacheSize = 0;
        let llmCacheSize = 0;
        
        // 辞書キャッシュサイズ計算
        for (const [key, value] of this.dictionaryCache) {
            dictionaryCacheSize += estimateObjectSize({ key, value });
        }
        
        // LLMキャッシュサイズ計算
        for (const [key, value] of this.llmAnalysisResults) {
            llmCacheSize += estimateObjectSize({ key, value });
        }
        
        const totalSize = dictionaryCacheSize + llmCacheSize;
        
        return {
            dictionaryCache: {
                count: this.dictionaryCache.size,
                maxCount: this.MAX_DICTIONARY_CACHE,
                estimatedSize: `${Math.round(dictionaryCacheSize / 1024)}KB`,
                averageSize: this.dictionaryCache.size > 0 ? 
                    `${Math.round(dictionaryCacheSize / this.dictionaryCache.size)}B` : '0B'
            },
            llmCache: {
                count: this.llmAnalysisResults.size,
                maxCount: this.MAX_LLM_CACHE,
                estimatedSize: `${Math.round(llmCacheSize / 1024)}KB`,
                averageSize: this.llmAnalysisResults.size > 0 ? 
                    `${Math.round(llmCacheSize / this.llmAnalysisResults.size)}B` : '0B'
            },
            total: {
                estimatedSize: `${Math.round(totalSize / 1024)}KB`,
                pendingRequests: this.pendingRequests.size
            }
        };
    }
    
    // デバッグ用：キャッシュ統計をコンソールに出力
    logCacheStatistics() {
        const stats = this.getCacheStatistics();
        console.group('📊 English Learning Assistant - Cache Statistics');
        console.log('📚 Dictionary Cache:', stats.dictionaryCache);
        console.log('🤖 LLM Analysis Cache:', stats.llmCache);
        console.log('📈 Total Memory Usage:', stats.total);
        console.log('⚙️ Configuration:', {
            maxDictionaryCache: this.MAX_DICTIONARY_CACHE,
            maxLLMCache: this.MAX_LLM_CACHE
        });
        console.groupEnd();
    }
    
    // キャッシュ監視の設定
    setupCacheMonitoring() {
        // 5分ごとにキャッシュ統計をログ出力
        this.cacheMonitoringInterval = setInterval(() => {
            if (this.dictionaryCache.size > 0 || this.llmAnalysisResults.size > 0) {
                this.logCacheStatistics();
            }
        }, 5 * 60 * 1000); // 5分
        
        // ページ離脱時にクリーンアップ
        window.addEventListener('beforeunload', () => {
            if (this.cacheMonitoringInterval) {
                clearInterval(this.cacheMonitoringInterval);
            }
        });
    }
    
    showTooltipWithContent(element, content) {
        // 既存のツールチップを削除
        this.hideTooltip();
        
        // 新しいツールチップを作成
        const tooltip = document.createElement('div');
        tooltip.className = 'ela-tooltip';
        tooltip.innerHTML = content;
        
        document.body.appendChild(tooltip);
        this.tooltipElement = tooltip;
        
        // 位置を調整
        this.positionTooltip(tooltip, element);
        
        // フェードイン効果
        requestAnimationFrame(() => {
            tooltip.style.opacity = '1';
            tooltip.style.transform = 'translateY(0)';
        });
    }
    
    // Extension contextの状態をチェック（簡素化版）
    isExtensionContextValid() {
        // 基本的なチェックのみ（過度な処理を避ける）
        try {
            return !!(chrome.runtime?.id && typeof chrome.runtime.sendMessage === 'function');
        } catch (error) {
            return false;
        }
    }
    
    // タイムアウト付きでメッセージを送信（改善版）
    async sendMessageWithTimeout(message, timeout = 10000) {
        // 事前チェック
        if (!this.isExtensionContextValid()) {
            throw new Error('Extension context is not available');
        }
        
        return new Promise((resolve, reject) => {
            // タイムアウトタイマー
            const timeoutId = setTimeout(() => {
                reject(new Error('Message timeout - Extension may be reloading'));
            }, timeout);
            
            try {
                chrome.runtime.sendMessage(message, (response) => {
                    clearTimeout(timeoutId);
                    
                    // Chrome runtime エラーチェック
                    if (chrome.runtime.lastError) {
                        const errorMsg = chrome.runtime.lastError.message;
                        
                        // Extension contextエラーの特別処理
                        if (errorMsg.includes('Extension context invalidated') || 
                            errorMsg.includes('message port closed') ||
                            errorMsg.includes('receiving end does not exist')) {
                            console.warn('Extension context issue detected:', errorMsg);
                            // コンテキスト無効化フラグを設定（ただし大げさな処理はしない）
                            this.contextInvalidated = true;
                        }
                        
                        reject(new Error(errorMsg));
                        return;
                    }
                    
                    resolve(response);
                });
            } catch (error) {
                clearTimeout(timeoutId);
                reject(error);
            }
        });
    }
    
    async handleMessage(message, sender, sendResponse) {
        try {
            switch (message.type) {
                case 'START_LEARNING_MODE':
                    const startResult = await this.startLearningMode(message.settings);
                    sendResponse(startResult);
                    break;
                    
                case 'STOP_LEARNING_MODE':
                    const stopResult = await this.stopLearningMode();
                    sendResponse(stopResult);
                    break;
                    
                case 'UPDATE_SETTINGS':
                    this.updateSettings(message.settings);
                    sendResponse({ success: true });
                    break;
                    
                case 'CHECK_STATUS':
                    sendResponse({ success: true, isActive: this.isActive });
                    break;
                    
                case 'BACKGROUND_TRANSLATION_COMPLETE':
                    this.handleBackgroundTranslationComplete(message.pageId, message.translation);
                    sendResponse({ success: true });
                    break;
                    
                case 'LLM_ANALYSIS_COMPLETE':
                    this.handleLLMAnalysisComplete(message.pageId, message.analysis);
                    sendResponse({ success: true });
                    break;
                    
                default:
                    sendResponse({ success: false, error: 'Unknown message type' });
            }
        } catch (error) {
            console.error('Message handling error:', error);
            
            // エラー詳細の完全な情報を出力
            const errorDetails = {
                name: error.name || 'Unknown',
                message: error.message || 'No message',
                stack: error.stack || 'No stack trace',
                code: error.code || 'No code',
                type: typeof error,
                constructor: error.constructor?.name || 'Unknown',
                toString: error.toString(),
                // 全プロパティを取得
                allProps: Object.getOwnPropertyNames(error).reduce((acc, prop) => {
                    try {
                        acc[prop] = error[prop];
                    } catch (e) {
                        acc[prop] = `Error accessing property: ${e.message}`;
                    }
                    return acc;
                }, {})
            };
            console.error('Detailed error information:', JSON.stringify(errorDetails, null, 2));
            
            // DOMExceptionの場合は特別な処理
            if (error instanceof DOMException) {
                console.error('DOMException specific details:', {
                    code: error.code,
                    name: error.name,
                    message: error.message
                });
            }
            
            try {
                sendResponse({ success: false, error: error.message || 'Unknown error' });
            } catch (responseError) {
                console.error('Failed to send error response:', responseError);
            }
        }
    }
    
    async startLearningMode(settings) {
        try {
            this.settings = { ...this.settings, ...settings };
            
            // 英語テキストの検出
            if (!this.detectEnglishText()) {
                return { success: false, error: '英語テキストが見つかりません' };
            }
            
            // ページ処理を開始
            await this.processPage();
            
            // バックグラウンド翻訳を開始
            this.startBackgroundTranslation();
            
            // LLM解析を開始（最適化：500msに短縮）
            setTimeout(() => {
                this.startLLMAnalysis();
            }, 500);
            
            this.isActive = true;
            console.log('学習モードを開始しました');
            
            return { success: true };
            
        } catch (error) {
            console.error('Start learning mode error:', error);
            return { success: false, error: error.message };
        }
    }
    
    async stopLearningMode() {
        try {
            // 処理済み要素をクリア
            this.clearProcessedElements();
            
            // ツールチップを隠す
            this.hideTooltip();
            
            this.isActive = false;
            console.log('学習モードを停止しました');
            
            return { success: true };
            
        } catch (error) {
            console.error('Stop learning mode error:', error);
            return { success: false, error: error.message };
        }
    }
    
    updateSettings(settings) {
        this.settings = { ...this.settings, ...settings };
        
        // アクティブな場合は再処理
        if (this.isActive) {
            this.processPage();
        }
    }
    
    detectEnglishText() {
        const textContent = document.body.textContent || '';
        const words = textContent.split(/\s+/).filter(word => word.length > 0);
        
        if (words.length < 10) return false;
        
        // 一般的な英単語をチェック
        const commonWords = ['the', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with', 'by', 'from', 'is', 'are', 'was', 'were', 'be', 'been', 'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could', 'should', 'this', 'that', 'these', 'those', 'a', 'an'];
        
        let englishWordCount = 0;
        const sampleWords = words.slice(0, 50).map(w => w.toLowerCase().replace(/[^a-z]/g, ''));
        
        for (const word of sampleWords) {
            if (commonWords.includes(word)) {
                englishWordCount++;
            }
        }
        
        return englishWordCount >= 3;
    }
    
    async processPage() {
        if (!this.settings.posTagging) return;
        
        try {
            // メインコンテンツ要素を取得
            const contentSelectors = [
                'article', 'main', '.content', '.post', '.article',
                'p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6'
            ];
            
            const elements = [];
            for (const selector of contentSelectors) {
                const found = document.querySelectorAll(selector);
                elements.push(...Array.from(found));
            }
            
            // 重複を除去し、処理済みでない要素のみ処理
            const uniqueElements = [...new Set(elements)];
            
            for (const element of uniqueElements) {
                if (!this.processedElements.has(element) && this.shouldProcessElement(element)) {
                    await this.processTextElement(element);
                    this.processedElements.add(element);
                }
            }
            
        } catch (error) {
            console.error('Page processing error:', error);
        }
    }
    
    shouldProcessElement(element) {
        // スクリプト、スタイル、非表示要素は除外
        if (['SCRIPT', 'STYLE', 'NOSCRIPT'].includes(element.tagName)) {
            return false;
        }
        
        // 非表示要素は除外
        const style = window.getComputedStyle(element);
        if (style.display === 'none' || style.visibility === 'hidden') {
            return false;
        }
        
        // テキストが少ない要素は除外
        const text = element.textContent || '';
        if (text.trim().length < 10) {
            return false;
        }
        
        // 既に処理済みの要素は除外
        if (element.querySelector('.ela-word')) {
            return false;
        }
        
        return true;
    }
    
    async processTextElement(element) {
        try {
            const text = element.textContent || '';
            if (text.trim().length === 0) return;
            
            // シンプルな単語分割処理
            this.processWithSimpleMethod(element);
            
        } catch (error) {
            console.error('Text processing error:', error);
        }
    }
    
    processWithSimpleMethod(element) {
        try {
            // 段落構造を保持するため、テキストノードのみを処理
            this.processTextNodes(element);
            this.addWordEventListeners(element);
            this.addTranslationButtons(element);
            
        } catch (error) {
            console.error('Simple processing error:', error);
        }
    }
    
    processTextNodes(element) {
        // テキストノードのみを処理して段落構造を保持
        const walker = document.createTreeWalker(
            element,
            NodeFilter.SHOW_TEXT,
            {
                acceptNode: (node) => {
                    // 空白のみのノードや短いテキストは除外
                    const text = node.textContent.trim();
                    if (text.length < 2) return NodeFilter.FILTER_REJECT;
                    
                    // 既に処理済みの要素内は除外
                    let parent = node.parentElement;
                    while (parent) {
                        if (parent.classList && parent.classList.contains('ela-word')) {
                            return NodeFilter.FILTER_REJECT;
                        }
                        parent = parent.parentElement;
                    }
                    
                    return NodeFilter.FILTER_ACCEPT;
                }
            },
            false
        );
        
        const textNodes = [];
        let node;
        while (node = walker.nextNode()) {
            textNodes.push(node);
        }
        
        // 各テキストノードを処理
        textNodes.forEach(textNode => {
            this.processTextNode(textNode);
        });
    }
    
    processTextNode(textNode) {
        try {
            const text = textNode.textContent;
            const words = text.split(/(\s+|[.,!?;:()\-"'])/);
            
            if (words.length <= 1) return;
            
            const fragment = document.createDocumentFragment();
            
            for (const word of words) {
                const cleanWord = word.trim();
                if (this.isEnglishWord(cleanWord)) {
                    // LLM解析待ち状態のみ（ルールベース推測は使用しない）
                    const span = document.createElement('span');
                    span.className = 'ela-word ela-pending';
                    span.setAttribute('data-word', cleanWord.toLowerCase());
                    span.setAttribute('data-pos', 'pending');
                    span.textContent = word;
                    fragment.appendChild(span);
                } else {
                    fragment.appendChild(document.createTextNode(word));
                }
            }
            
            // 元のテキストノードを置き換え
            textNode.parentNode.replaceChild(fragment, textNode);
            
        } catch (error) {
            console.error('Text node processing error:', error);
        }
    }
    
    // ルールベース品詞推測は無効化（LLM解析のみ使用）
    
    isEnglishWord(word) {
        const cleanWord = word.trim().toLowerCase();
        return /^[a-z]+$/.test(cleanWord) && cleanWord.length > 1;
    }
    
    wrapWord(word) {
        // LLM解析待ち状態のみ（ルールベース推測は使用しない）
        return `<span class="ela-word ela-pending" data-word="${word.toLowerCase()}" data-pos="pending">${word}</span>`;
    }
    
    addWordEventListeners(element) {
        const words = element.querySelectorAll('.ela-word');
        
        words.forEach(word => {
            // マウスオーバーイベント
            word.addEventListener('mouseenter', (e) => {
                if (this.settings.dictionary) {
                    // 既存の隠すタイマーをクリア
                    if (this.hideTooltipTimer) {
                        clearTimeout(this.hideTooltipTimer);
                        this.hideTooltipTimer = null;
                    }
                    
                    // 既存の遅延タイマーもクリア
                    if (this.showDelayTimer) {
                        clearTimeout(this.showDelayTimer);
                        this.showDelayTimer = null;
                    }
                    
                    // 少し遅延させてツールチップを表示（誤動作防止）
                    this.showDelayTimer = setTimeout(() => {
                        this.showDictionary(e.target);
                    }, 100);
                }
            });
            
            // マウスアウトイベント - 遅延付き
            word.addEventListener('mouseleave', (e) => {
                // 遅延表示をキャンセル
                if (this.showDelayTimer) {
                    clearTimeout(this.showDelayTimer);
                    this.showDelayTimer = null;
                }
                
                // ツールチップへ移動する可能性を考慮して遅延
                this.delayedHideDictionary();
            });
        });
    }
    
    showDictionary(wordElement) {
        const word = wordElement.dataset.word;
        if (!word) return;
        
        // 既存のツールチップを隠す
        this.hideDictionary();
        
        // 新しいツールチップを表示
        this.showTooltip(wordElement, word);
    }
    
    hideDictionary() {
        this.hideTooltip();
    }
    
    delayedHideDictionary() {
        // 500ms後に辞書を隠す（ユーザーがツールチップに移動する時間を与える）
        this.hideTooltipTimer = setTimeout(() => {
            this.hideDictionary();
        }, 500);
    }
    
    async showTooltip(wordElement, word) {
        try {
            // 既存のツールチップを即座に削除
            if (this.tooltipElement) {
                this.hideTooltip();
            }
            
            this.currentTooltipWord = word;
            
            // ツールチップ要素を作成
            this.tooltipElement = document.createElement('div');
            this.tooltipElement.className = 'ela-tooltip';
            this.tooltipElement.innerHTML = '<div class="ela-tooltip-loading">読み込み中...</div>';
            
            // 位置を設定
            this.positionTooltip(this.tooltipElement, wordElement);
            
            // DOMに追加
            document.body.appendChild(this.tooltipElement);
            
            // ツールチップにイベントリスナーを追加
            this.addTooltipEventListeners();
            
            // アニメーション
            setTimeout(() => {
                if (this.tooltipElement && this.currentTooltipWord === word) {
                    this.tooltipElement.classList.add('show');
                }
            }, 10);
            
            // まずLLM解析結果を確認
            const llmAnalysis = await this.getLLMWordAnalysis(word, wordElement);
            
            if (llmAnalysis && this.currentTooltipWord === word && this.tooltipElement) {
                this.updateTooltipWithLLMAnalysis(llmAnalysis);
                return;
            }
            
            // LLM解析が利用できない場合は従来の辞書機能を使用
            const definition = await this.lookupWord(word);
            
            // レスポンス時に表示中の単語が変わっていないかチェック
            if (this.currentTooltipWord === word && this.tooltipElement) {
                if (definition) {
                    this.updateTooltipContent(definition);
                } else {
                    this.tooltipElement.innerHTML = '<div class="ela-tooltip-error">辞書データが見つかりません</div>';
                }
            }
            
        } catch (error) {
            console.error('Tooltip error:', error);
            // エラー時も現在の単語と一致する場合のみ表示
            if (this.tooltipElement && this.currentTooltipWord === word) {
                this.tooltipElement.innerHTML = '<div class="ela-tooltip-error">エラーが発生しました</div>';
            }
        }
    }
    
    positionTooltip(tooltip, wordElement) {
        const rect = wordElement.getBoundingClientRect();
        
        let top = rect.bottom + window.scrollY + 8;
        let left = rect.left + window.scrollX;
        
        // 画面右端を超える場合は左に調整
        if (left + 300 > window.innerWidth) {
            left = window.innerWidth - 310;
        }
        
        // 画面下端を超える場合は上に表示
        if (top + 200 > window.innerHeight + window.scrollY) {
            top = rect.top + window.scrollY - 208;
        }
        
        tooltip.style.position = 'absolute';
        tooltip.style.top = `${top}px`;
        tooltip.style.left = `${left}px`;
        tooltip.style.zIndex = '10000';
    }
    
    async lookupWord(word) {
        try {
            const lowerWord = word.toLowerCase();
            
            // キャッシュから確認
            if (this.dictionaryCache.has(lowerWord)) {
                console.log(`Dictionary cache hit for word: ${word}`);
                return this.dictionaryCache.get(lowerWord);
            }
            
            // 進行中のリクエストがある場合は待機
            if (this.pendingRequests.has(`dict_${lowerWord}`)) {
                console.log(`Dictionary request already in progress for word: ${word}, waiting...`);
                return await this.pendingRequests.get(`dict_${lowerWord}`);
            }
            
            // Extension context チェック
            if (!this.isExtensionContextValid()) {
                // 静かに失敗（ログを減らす）
                return null;
            }
            
            // リクエストPromiseを作成して追跡開始
            const requestPromise = (async () => {
                try {
                    console.log(`Dictionary API call for word: ${word}`);
                    const response = await this.sendMessageWithTimeout({
                        type: 'LOOKUP_WORD',
                        word: word
                    }, 3000); // 短縮: 3秒
                    
                    const definition = response && response.success ? response.definition : null;
                    
                    // 結果をキャッシュに保存（nullでも保存して重複リクエストを防ぐ）
                    this.dictionaryCache.set(lowerWord, definition);
                    
                    // キャッシュサイズ制限
                    if (this.dictionaryCache.size > this.MAX_DICTIONARY_CACHE) {
                        const firstKey = this.dictionaryCache.keys().next().value;
                        this.dictionaryCache.delete(firstKey);
                    }
                    
                    return definition;
                } finally {
                    // 進行中リクエストから削除
                    this.pendingRequests.delete(`dict_${lowerWord}`);
                }
            })();
            
            // 進行中リクエストとして追加
            this.pendingRequests.set(`dict_${lowerWord}`, requestPromise);
            
            return await requestPromise;
        } catch (error) {
            console.error('Word lookup error:', error);
            
            // 詳細なエラー情報を出力
            if (error instanceof DOMException) {
                console.error('DOMException in lookupWord:', {
                    code: error.code,
                    name: error.name,
                    message: error.message
                });
            }
            
            if (error.message && error.message.includes('Extension context invalidated')) {
                console.warn('Extension context invalidated during word lookup');
                return null;
            }
            
            // その他のchrome.runtime関連エラー
            if (error.message && error.message.includes('message port closed')) {
                console.warn('Message port closed during word lookup');
                return null;
            }
            
            return null;
        }
    }
    
    updateTooltipContent(definition) {
        if (!this.tooltipElement) return;
        
        let html = `<div class="ela-tooltip-word">${definition.word}</div>`;
        
        if (definition.phonetic) {
            html += `<div class="ela-tooltip-phonetic">${definition.phonetic}</div>`;
        }
        
        if (definition.meanings && definition.meanings.length > 0) {
            definition.meanings.forEach(meaning => {
                html += `<div class="ela-tooltip-meaning">`;
                
                // 品詞の英語名を取得してクラスに追加
                const posClass = this.getPartOfSpeechClass(meaning.partOfSpeech);
                html += `<div class="ela-tooltip-pos ${posClass}">${meaning.partOfSpeech}</div>`;
                
                if (meaning.definitions && meaning.definitions.length > 0) {
                    meaning.definitions.slice(0, 2).forEach(def => {
                        html += `<div class="ela-tooltip-definition">${def.definition}</div>`;
                        if (def.example) {
                            html += `<div class="ela-tooltip-example">
                                <div class="ela-example-english">"${def.example}"</div>
                            </div>`;
                        }
                    });
                }
                
                html += `</div>`;
            });
        }
        
        this.tooltipElement.innerHTML = html;
    }
    
    addTooltipEventListeners() {
        if (!this.tooltipElement) return;
        
        // ツールチップにマウスが入ったら隠すタイマーをクリア
        this.tooltipElement.addEventListener('mouseenter', () => {
            if (this.hideTooltipTimer) {
                clearTimeout(this.hideTooltipTimer);
                this.hideTooltipTimer = null;
            }
        });
        
        // ツールチップからマウスが出たら隠す
        this.tooltipElement.addEventListener('mouseleave', () => {
            this.delayedHideDictionary();
        });
    }
    
    hideTooltip() {
        // タイマーをクリア
        if (this.hideTooltipTimer) {
            clearTimeout(this.hideTooltipTimer);
            this.hideTooltipTimer = null;
        }
        
        if (this.tooltipElement) {
            // すぐに削除する場合と徐々にフェードアウトする場合を分ける
            if (this.tooltipElement.classList.contains('show')) {
                // 表示中の場合はフェードアウト
                this.tooltipElement.classList.remove('show');
                setTimeout(() => {
                    if (this.tooltipElement && this.tooltipElement.parentNode) {
                        this.tooltipElement.parentNode.removeChild(this.tooltipElement);
                    }
                    this.tooltipElement = null;
                    this.currentTooltipWord = null;
                }, 300);
            } else {
                // まだ表示前の場合は即座に削除
                if (this.tooltipElement.parentNode) {
                    this.tooltipElement.parentNode.removeChild(this.tooltipElement);
                }
                this.tooltipElement = null;
                this.currentTooltipWord = null;
            }
        }
    }
    
    addTranslationButtons(element) {
        if (!this.settings.translation) return;
        
        try {
            // 文の終わりを検出してボタンを追加
            const sentences = this.detectSentences(element);
            
            sentences.forEach(sentence => {
                if (sentence.textContent.trim().length > 20) {
                    this.addTranslationButton(sentence);
                }
            });
            
        } catch (error) {
            console.error('Translation button error:', error);
        }
    }
    
    detectSentences(element) {
        const sentences = [];
        const walker = document.createTreeWalker(
            element,
            NodeFilter.SHOW_TEXT,
            null,
            false
        );
        
        let node;
        while (node = walker.nextNode()) {
            const text = node.textContent;
            if (text.match(/[.!?]\s*$/)) {
                // 文の終わりを検出
                let parent = node.parentElement;
                while (parent && parent !== element) {
                    if (['P', 'DIV', 'SPAN', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6'].includes(parent.tagName)) {
                        sentences.push(parent);
                        break;
                    }
                    parent = parent.parentElement;
                }
            }
        }
        
        return [...new Set(sentences)]; // 重複を除去
    }
    
    addTranslationButton(element) {
        // 既にボタンがある場合はスキップ
        if (element.querySelector('.ela-translate-btn')) return;
        
        const button = document.createElement('button');
        button.className = 'ela-translate-btn';
        button.textContent = '翻訳';
        button.onclick = (e) => {
            e.preventDefault();
            this.translateElement(element, button);
        };
        
        element.appendChild(button);
    }
    
    async translateElement(element, button) {
        if (button.classList.contains('loading')) return;
        
        try {
            // バックグラウンド翻訳のキャッシュから取得を試行
            const cachedTranslation = this.getCachedTranslationForElement(element);
            if (cachedTranslation) {
                this.showInstantTranslation(element, button, cachedTranslation);
                return;
            }
            
            // キャッシュがない場合は翻訳中状態を表示
            button.classList.add('loading');
            button.textContent = '翻訳中...';
            
            // バックグラウンド翻訳が進行中の場合は待機
            if (this.isBackgroundTranslationInProgress()) {
                await this.waitForBackgroundTranslation(element, 5000); // 5秒待機
                
                // 再度キャッシュを確認
                const retryTranslation = this.getCachedTranslationForElement(element);
                if (retryTranslation) {
                    this.showInstantTranslation(element, button, retryTranslation);
                    return;
                }
            }
            
            // フォールバック: 個別翻訳実行
            await this.performIndividualTranslation(element, button);
            
        } catch (error) {
            console.error('Translation error:', error);
            
            if (error.message.includes('Extension context invalidated')) {
                button.textContent = '拡張機能を再読み込みしてください';
                button.style.background = 'linear-gradient(135deg, #95a5a6 0%, #7f8c8d 100%)';
                button.disabled = true;
            } else {
                button.textContent = '翻訳エラー';
                button.style.background = 'linear-gradient(135deg, #e74c3c 0%, #c0392b 100%)';
            }
        } finally {
            button.classList.remove('loading');
        }
    }
    
    // バックグラウンド翻訳進行中かチェック
    isBackgroundTranslationInProgress() {
        return this.paragraphTranslations && this.paragraphTranslations.size < 3; // 3つ未満の場合は進行中とみなす
    }
    
    // バックグラウンド翻訳完了を待機
    async waitForBackgroundTranslation(element, timeout = 5000) {
        const startTime = Date.now();
        
        while (Date.now() - startTime < timeout) {
            if (this.getCachedTranslationForElement(element)) {
                return true;
            }
            await this.delay(500);
        }
        return false;
    }
    
    // 要素に対応するキャッシュ翻訳を取得
    getCachedTranslationForElement(element) {
        if (!this.paragraphTranslations) return null;
        
        const elementText = this.extractCleanText(element);
        
        // 完全一致を探す
        for (const [id, translation] of this.paragraphTranslations) {
            if (translation.original === elementText) {
                return translation.translation;
            }
        }
        
        // 部分一致を探す（最初の50文字で比較）
        const elementStart = elementText.substring(0, 50);
        for (const [id, translation] of this.paragraphTranslations) {
            if (translation.original.substring(0, 50) === elementStart) {
                return translation.translation;
            }
        }
        
        return null;
    }
    
    // 個別翻訳を実行（フォールバック）
    async performIndividualTranslation(element, button) {
        const textToTranslate = this.extractCleanText(element);
        
        if (!this.isExtensionContextValid()) {
            throw new Error('Extension context invalidated');
        }
        
        let response;
        try {
            response = await this.sendMessageWithTimeout({
                type: 'TRANSLATE_TEXT',
                text: textToTranslate
            }, 20000); // 延長: 20秒
        } catch (sendError) {
            console.error('Failed to send translation request:', sendError);
            if (sendError instanceof DOMException) {
                console.error('DOMException in performIndividualTranslation:', {
                    code: sendError.code,
                    name: sendError.name,
                    message: sendError.message
                });
            }
            throw sendError;
        }
        
        if (response && response.success && response.translation) {
            this.showTranslationResult(element, textToTranslate, response.translation);
            button.textContent = '翻訳完了';
            button.style.background = 'linear-gradient(135deg, #27ae60 0%, #2ecc71 100%)';
        } else {
            throw new Error(response?.error || '翻訳に失敗しました');
        }
    }
    
    // 瞬時翻訳表示
    showInstantTranslation(element, button, translation) {
        try {
            button.textContent = '✓ 表示済み';
            button.style.background = 'linear-gradient(135deg, #3498db 0%, #2980b9 100%)';
            
            // 要素のテキストを抽出
            const originalText = this.extractCleanText(element);
            
            // キャッシュされた翻訳を直接表示
            this.showTranslationResult(element, originalText, translation);
            console.log('Instant translation displayed from background cache');
            
        } catch (error) {
            console.error('Instant translation error:', error);
            // エラー時は個別翻訳にフォールバック
            this.performIndividualTranslation(element, button);
        }
    }
    

    
    showTranslationResult(element, originalText, translation) {
        // 既存の翻訳結果を削除
        const existingTranslation = element.querySelector('.ela-translation');
        if (existingTranslation) {
            existingTranslation.remove();
        }
        
        // 翻訳結果を表示
        const translationDiv = document.createElement('div');
        translationDiv.className = 'ela-translation';
        translationDiv.innerHTML = `
            <div class="ela-translation-header">日本語翻訳</div>
            <div class="ela-translation-text">${translation}</div>
        `;
        
        element.appendChild(translationDiv);
    }
    
    clearProcessedElements() {
        // 処理済み要素から拡張機能の要素を削除
        document.querySelectorAll('.ela-word').forEach(word => {
            const parent = word.parentNode;
            if (parent) {
                parent.replaceChild(document.createTextNode(word.textContent), word);
                parent.normalize(); // テキストノードを結合
            }
        });
        
        // 翻訳ボタンと結果を削除
        document.querySelectorAll('.ela-translate-btn, .ela-translation').forEach(el => {
            el.remove();
        });
        
        // ツールチップを削除
        this.hideTooltip();
        
        // 処理済み要素のセットをクリア
        this.processedElements = new WeakSet();
    }
    
    // バックグラウンド翻訳を開始
    async startBackgroundTranslation() {
        try {
            // 翻訳対象の段落を抽出
            const paragraphs = this.extractParagraphsForTranslation();
            
            if (paragraphs.length === 0) {
                console.log('No paragraphs found for background translation');
                return;
            }
            
            console.log(`Starting background translation for ${paragraphs.length} paragraphs`);
            
            // 個別段落翻訳を開始
            this.translateParagraphsIndividually(paragraphs);
            
        } catch (error) {
            console.error('Failed to start background translation:', error);
        }
    }
    
    // 段落ごとの個別翻訳処理
    async translateParagraphsIndividually(paragraphs) {
        // 翻訳キャッシュを初期化
        this.paragraphTranslations.clear();
        
        // 並行処理でAPI制限を考慮し、3つずつ処理
        for (let i = 0; i < paragraphs.length; i += 3) {
            const batch = paragraphs.slice(i, i + 3);
            
            const promises = batch.map(async (paragraph) => {
                try {
                    // 遅延を入れてAPI制限を回避（最適化：50msに短縮）
                    await this.delay(i * 50);
                    
                    // Extension context チェック
                    if (!this.isExtensionContextValid()) {
                        throw new Error('Extension context invalidated');
                    }
                    
                    let response;
                    try {
                        response = await this.sendMessageWithTimeout({
                            type: 'TRANSLATE_TEXT',
                            text: paragraph.text
                        }, 20000); // 延長: 20秒
                    } catch (sendError) {
                        console.error(`Failed to send translation request for paragraph ${paragraph.id}:`, sendError);
                        if (sendError instanceof DOMException) {
                            console.error('DOMException in translateParagraphsIndividually:', {
                                code: sendError.code,
                                name: sendError.name,
                                message: sendError.message,
                                paragraphId: paragraph.id
                            });
                        }
                        throw sendError;
                    }
                    
                    if (response && response.success) {
                        this.paragraphTranslations.set(paragraph.id, {
                            original: paragraph.text,
                            translation: response.translation,
                            element: paragraph.element
                        });
                        
                        // 翻訳完了した段落の翻訳ボタンを更新
                        this.updateParagraphButtonState(paragraph.element);
                    }
                } catch (error) {
                    if (error.message.includes('Extension context invalidated')) {
                        console.warn(`Extension context invalidated for paragraph ${paragraph.id}`);
                        // バックグラウンド翻訳を停止
                        return;
                    }
                    console.error(`Translation failed for paragraph ${paragraph.id}:`, error);
                }
            });
            
            await Promise.all(promises);
        }
        
        console.log(`Background translation completed for ${this.paragraphTranslations.size} paragraphs`);
    }
    
    // 遅延ユーティリティ
    delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
    
    // 個別段落の翻訳ボタン状態を更新
    updateParagraphButtonState(element) {
        const button = element.querySelector('.ela-translate-btn');
        if (button) {
            button.style.background = 'linear-gradient(135deg, #27ae60 0%, #2ecc71 100%)';
            button.title = '翻訳準備完了 - クリックで瞬時表示';
        }
    }
    
    // 翻訳用の段落を抽出
    extractParagraphsForTranslation() {
        const paragraphs = [];
        let paragraphId = 0;
        
        // 翻訳ボタンがある要素を対象にする
        const elementsWithTranslateBtn = document.querySelectorAll('.ela-translate-btn');
        
        elementsWithTranslateBtn.forEach(button => {
            const element = button.parentElement;
            const text = this.extractCleanText(element);
            
            if (text.length > 20 && this.isEnglishText(text)) {
                paragraphs.push({
                    id: `para_${paragraphId++}`,
                    text: text,
                    element: element
                });
            }
        });
        
        console.log(`Found ${paragraphs.length} paragraphs with translation buttons`);
        return paragraphs;
    }
    
    // 要素からクリーンなテキストを抽出
    extractCleanText(element) {
        // 翻訳ボタンのテキストを除外
        const clone = element.cloneNode(true);
        const buttons = clone.querySelectorAll('.ela-translate-btn, .ela-translation');
        buttons.forEach(btn => btn.remove());
        
        return clone.textContent.trim();
    }
    
    // 英語テキストかどうかの簡易判定
    isEnglishText(text) {
        const englishWords = text.match(/\b[a-zA-Z]+\b/g);
        return englishWords && englishWords.length > 3;
    }
    
    // バックグラウンド翻訳完了の処理（非推奨、個別翻訳使用）
    handleBackgroundTranslationComplete(pageId, translation) {
        console.log('Background translation complete message received, but using individual paragraph translation');
    }
    
    // LLM解析を開始（文章単位処理）
    async startLLMAnalysis() {
        try {
            if (!this.settings.posTagging) {
                console.log('POS tagging disabled, skipping LLM analysis');
                return;
            }
            
            this.analysisInProgress = true;
            
            // 解析対象の段落を抽出（翻訳と同じ方式）
            const paragraphs = this.extractParagraphsForAnalysis();
            
            if (paragraphs.length === 0) {
                console.log('No paragraphs found for LLM analysis');
                this.analysisInProgress = false;
                return;
            }
            
            console.log(`Starting sentence-by-sentence LLM analysis for ${paragraphs.length} paragraphs`);
            
            // Extension context チェック
            if (!this.isExtensionContextValid()) {
                this.analysisInProgress = false;
                return;
            }
            
            // 段落ごとに順次処理（翻訳と同じパターン）
            await this.analyzeParagraphsIndividually(paragraphs);
            
        } catch (error) {
            console.error('Failed to start LLM analysis:', error);
            this.analysisInProgress = false;
        }
    }
    
    // 段落ごとの個別LLM解析処理
    async analyzeParagraphsIndividually(paragraphs) {
        console.log(`Processing ${paragraphs.length} paragraphs for LLM analysis`);
        
        let failedBatches = 0; // 連続失敗カウンター
        let successCount = 0; // 成功カウンター
        
        // Service Worker Keep-Alive機能
        const keepAliveInterval = setInterval(async () => {
            try {
                await this.sendMessageWithTimeout({
                    type: 'CONTEXT_CHECK'
                }, 500);
            } catch (error) {
                // Keep-aliveエラーは静かに処理
            }
        }, 500); // 最適化：500msに短縮してより積極的に監視
        
        // ストリーミング並列処理：15個並列に増加、1個終わったら次を追加
        const maxConcurrency = 15;
        let currentIndex = 0;
        const runningPromises = new Map();
        
        console.log(`Starting streaming parallel processing with ${maxConcurrency} concurrent requests`);
        
        // 初期10個の処理を開始
        for (let i = 0; i < Math.min(maxConcurrency, paragraphs.length); i++) {
            this.startParagraphAnalysis(paragraphs[currentIndex], currentIndex, runningPromises);
            currentIndex++;
        }
        
        // 1個完了したら次を開始するループ
        while (runningPromises.size > 0 && currentIndex <= paragraphs.length) {
            try {
                // 最初に完了したPromiseを待機
                const completedKey = await Promise.race(
                    Array.from(runningPromises.keys()).map(async (key) => {
                        await runningPromises.get(key);
                        return key;
                    })
                );
                
                // 完了したPromiseの結果を処理
                const result = await runningPromises.get(completedKey);
                runningPromises.delete(completedKey);
                
                if (result.success) {
                    successCount++;
                    console.log(`✅ LLM analysis completed for paragraph ${result.paragraph.id} (${successCount}/${paragraphs.length})`);
                    this.updateParagraphWords(result.paragraph, result.analysis);
                    failedBatches = 0; // 成功時はリセット
                } else {
                    console.error(`❌ Failed LLM analysis for paragraph ${result.paragraph.id}: ${result.error}`);
                    
                    // Service Workerエラーの場合のみ失敗カウントを増加
                    if (result.error === 'Service Worker error' && result.retryable) {
                        failedBatches++;
                        console.warn(`Service Worker error count: ${failedBatches}/20`);
                    } else {
                        console.log(`Non-retryable error, not incrementing failure count`);
                    }
                }
                
                // 次の段落があれば新しい処理を開始
                if (currentIndex < paragraphs.length) {
                    this.startParagraphAnalysis(paragraphs[currentIndex], currentIndex, runningPromises);
                    currentIndex++;
                }
                
                // 連続失敗チェックと復旧処理（並列度15に合わせて調整）
                if (failedBatches >= 20) {
                    console.error('🛑 Too many consecutive failures, stopping LLM analysis');
                    console.log(`✅ Successfully processed ${successCount} paragraphs before stopping`);
                    this.analysisInProgress = false;
                    break;
                } else if (failedBatches >= 5 && failedBatches % 5 === 0) {
                    // 5回失敗するごとに短い復旧遅延（最適化：1秒に短縮）
                    console.warn(`🔄 Service Worker recovery delay after ${failedBatches} failures`);
                    await this.delay(1000); // 1秒の復旧遅延
                }
                
            } catch (error) {
                console.error('Error in streaming processing:', error);
                // エラー時も次に進む
                if (currentIndex < paragraphs.length) {
                    this.startParagraphAnalysis(paragraphs[currentIndex], currentIndex, runningPromises);
                    currentIndex++;
                }
            }
        }
        
        // 残りの処理を完了まで待機
        if (runningPromises.size > 0) {
            console.log(`Waiting for ${runningPromises.size} remaining processes to complete...`);
            const remainingResults = await Promise.allSettled(Array.from(runningPromises.values()));
            
            remainingResults.forEach((result) => {
                if (result.status === 'fulfilled' && result.value.success) {
                    successCount++;
                    console.log(`✅ LLM analysis completed for paragraph ${result.value.paragraph.id} (${successCount}/${paragraphs.length})`);
                    this.updateParagraphWords(result.value.paragraph, result.value.analysis);
                }
            });
        }
        
        // Keep-Aliveを停止
        clearInterval(keepAliveInterval);
        
        console.log(`📊 LLM analysis completed: ${successCount}/${paragraphs.length} paragraphs processed successfully`);
        
        // 段落処理が失敗した場合のフォールバック処理
        if (successCount === 0 && paragraphs.length > 0) {
            console.log('🔄 Paragraph analysis failed, enabling enhanced on-demand analysis');
            this.enableEnhancedOnDemandAnalysis();
        }
        
        this.analysisInProgress = false;
    }
    
    // 個別段落分析を開始（ストリーミング処理用）
    startParagraphAnalysis(paragraph, index, runningPromises) {
        const key = `paragraph-${index}`;
        
        const promise = (async () => {
            try {
                // 小さな遅延でスタート時間をずらす（最適化：50msに短縮）
                await this.delay(index % 15 * 30); // 0-0.42秒の範囲でずらす（15並列対応）
                
                // Extension context チェック
                if (!this.isExtensionContextValid()) {
                    console.warn(`Extension context invalid, skipping paragraph ${paragraph.id}`);
                    return { success: false, paragraph, error: 'Extension context invalid' };
                }
                
                console.log(`🚀 Starting analysis for paragraph ${paragraph.id}: "${paragraph.text.substring(0, 50)}..."`);
                
                const response = await this.sendMessageWithTimeout({
                    type: 'ANALYZE_TEXT_WITH_LLM',
                    pageId: this.pageId,
                    sentences: [paragraph.text],
                    paragraphId: paragraph.id
                }, 60000); // タイムアウトを60秒に大幅延長
                
                if (response && response.success && response.analysis) {
                    return { 
                        success: true, 
                        paragraph, 
                        analysis: response.analysis 
                    };
                } else {
                    const errorMsg = response?.error || 'Unknown error';
                    return { 
                        success: false, 
                        paragraph, 
                        error: errorMsg 
                    };
                }
                
                            } catch (error) {
                    // Extension context系のエラーを細分化
                    const errorMessage = error.message || '';
                    if (errorMessage.includes('Receiving end does not exist') || 
                        errorMessage.includes('Message timeout') ||
                        errorMessage.includes('message channel closed') ||
                        errorMessage.includes('Extension context invalidated')) {
                        console.warn(`Service Worker error for paragraph ${paragraph.id}: ${errorMessage}`);
                        return { 
                            success: false, 
                            paragraph, 
                            error: 'Service Worker error',
                            retryable: true // 再試行可能なエラー
                        };
                    } else {
                        console.error(`Unexpected error for paragraph ${paragraph.id}:`, error);
                        return { 
                            success: false, 
                            paragraph, 
                            error: error.message,
                            retryable: false // 再試行不可能なエラー
                        };
                    }
                }
        })();
        
        runningPromises.set(key, promise);
        return promise;
    }
    
    // 拡張オンデマンド分析モードを有効化
    enableEnhancedOnDemandAnalysis() {
        console.log('🚀 Enhanced on-demand analysis mode enabled');
        this.enhancedOnDemandMode = true;
        
        // 全ての pending 単語を対象に視覚的ヒントを追加
        const pendingWords = document.querySelectorAll('.ela-word[data-pos="pending"]');
        console.log(`Found ${pendingWords.length} pending words for on-demand analysis`);
        
        pendingWords.forEach(element => {
            // オンデマンド分析対象であることを示すスタイル追加
            element.style.animation = 'pulse 2s infinite';
            element.title = 'マウスオーバーでAI分析を実行';
        });
        
        // CSS アニメーションを動的に追加
        if (!document.querySelector('#ela-ondemand-styles')) {
            const style = document.createElement('style');
            style.id = 'ela-ondemand-styles';
            style.textContent = `
                @keyframes pulse {
                    0% { opacity: 0.7; }
                    50% { opacity: 1; }
                    100% { opacity: 0.7; }
                }
            `;
            document.head.appendChild(style);
        }
    }
    
    // LLM解析用の段落抽出（翻訳と同じ方式）
    extractParagraphsForAnalysis() {
        const paragraphs = [];
        const paragraphElements = document.querySelectorAll('p, div, h1, h2, h3, h4, h5, h6');
        const processedTexts = new Set(); // 重複テキストを除去
        
        paragraphElements.forEach((element, index) => {
            // この段落内にela-wordが含まれているかチェック
            const wordsInParagraph = element.querySelectorAll('.ela-word[data-pos="pending"]');
            
            if (wordsInParagraph.length > 0) {
                const text = this.extractCleanText(element);
                
                // 重複チェック
                if (processedTexts.has(text)) {
                    console.log(`Skipping paragraph ${index}: duplicate text`);
                    return;
                }
                
                if (text.length > 20 && this.isEnglishText(text) && wordsInParagraph.length >= 2) {
                    processedTexts.add(text); // 重複防止に追加
                    paragraphs.push({
                        id: `paragraph-${index}`,
                        text: text,
                        element: element,
                        wordCount: wordsInParagraph.length
                    });
                } else {
                    console.log(`Skipping paragraph ${index}: too short (${text.length} chars) or insufficient words (${wordsInParagraph.length})`);
                }
            }
        });
        
        console.log(`Found ${paragraphs.length} paragraphs containing pending words`);
        
        // 最大パフォーマンス設定（最大5000段落）
        const maxParagraphs = 5000;
        if (paragraphs.length > maxParagraphs) {
            console.log(`Limiting processing to first ${maxParagraphs} paragraphs for maximum performance`);
            return paragraphs.slice(0, maxParagraphs);
        }
        
        return paragraphs;
    }
    
    // 段落内の単語のみを効率的に更新
    updateParagraphWords(paragraph, analysisData) {
        console.log(`Updating words in paragraph ${paragraph.id}`);
        
        if (!analysisData || !analysisData.words) {
            console.log('No word analysis data received');
            return;
        }
        
        // 解析データをマップに変換（データ検証付き）
        const analysisMap = new Map();
        let validWords = 0;
        let invalidWords = 0;
        
        analysisData.words.forEach((wordData, index) => {
            // データ検証
            if (!wordData || typeof wordData !== 'object') {
                console.warn(`Invalid word data at index ${index}:`, wordData);
                invalidWords++;
                return;
            }
            
            if (!wordData.word || typeof wordData.word !== 'string') {
                console.warn(`Missing or invalid 'word' field at index ${index}:`, wordData);
                invalidWords++;
                return;
            }
            
            if (!wordData.pos || typeof wordData.pos !== 'string') {
                console.warn(`Missing or invalid 'pos' field for word '${wordData.word}':`, wordData);
                invalidWords++;
                return;
            }
            
            try {
                analysisMap.set(wordData.word.toLowerCase(), wordData);
                validWords++;
            } catch (error) {
                console.warn(`Error processing word at index ${index}:`, error, wordData);
                invalidWords++;
            }
        });
        
        console.log(`Word data validation: ${validWords} valid, ${invalidWords} invalid`);
        
        // この段落内のpending単語のみを対象にする（全ページ検索なし）
        const wordsInParagraph = paragraph.element.querySelectorAll('.ela-word[data-pos="pending"]');
        
        wordsInParagraph.forEach(element => {
            const word = element.dataset.word;
            if (word && analysisMap.has(word.toLowerCase())) {
                const wordAnalysisData = analysisMap.get(word.toLowerCase());
                
                // 段落内の単語を更新
                if (wordAnalysisData.pos) {
                    element.className = 'ela-word ela-' + wordAnalysisData.pos;
                    element.dataset.pos = wordAnalysisData.pos;
                    element.dataset.source = 'llm';
                    
                    // キャッシュにも保存
                    this.llmAnalysisResults.set(word.toLowerCase(), wordAnalysisData);
                    
                    console.log(`Updated word "${word}": pending → ${wordAnalysisData.pos} (in paragraph ${paragraph.id})`);
                }
                
                if (wordAnalysisData.confidence) {
                    element.dataset.confidence = wordAnalysisData.confidence;
                }
            }
        });
        
        console.log(`Updated ${wordsInParagraph.length} words in paragraph ${paragraph.id}`);
    }
    
    // LLM解析完了の処理（旧システム、現在は段落ベース処理使用）
    handleLLMAnalysisComplete(pageId, analysis) {
        console.log('Legacy LLM analysis complete handler - now using paragraph-based processing');
        
        // 句動詞・イディオムのキャッシュのみ処理（下位互換性）
        if (analysis && analysis.phrases) {
            analysis.phrases.forEach(phraseData => {
                this.llmAnalysisResults.set(phraseData.phrase.toLowerCase(), phraseData);
            });
        }
    }
    


    
    // LLM単語解析の取得
    async getLLMWordAnalysis(word, wordElement) {
        try {
            const lowerWord = word.toLowerCase();
            
            // キャッシュから確認
            if (this.llmAnalysisResults.has(lowerWord)) {
                console.log(`LLM cache hit for word: ${word}`);
                return this.llmAnalysisResults.get(lowerWord);
            }
            
            // 進行中のリクエストがある場合は待機
            if (this.pendingRequests.has(`llm_${lowerWord}`)) {
                console.log(`LLM request already in progress for word: ${word}, waiting...`);
                return await this.pendingRequests.get(`llm_${lowerWord}`);
            }
            
            // バックグラウンド解析が進行中の場合は少し待つ
            if (this.analysisInProgress) {
                console.log(`Background analysis in progress, waiting for word: ${word}`);
                await this.delay(200); // 最適化：200msに短縮
                if (this.llmAnalysisResults.has(lowerWord)) {
                    console.log(`Found LLM result after waiting for word: ${word}`);
                    return this.llmAnalysisResults.get(lowerWord);
                }
            }
            

            
            // Extension context チェック
            if (!this.isExtensionContextValid()) {
                // 静かに失敗（ログを減らす）
                return null;
            }
            
            // リクエストPromiseを作成して追跡開始
            const requestPromise = (async () => {
                try {
                    // 個別解析を要求
                    const sentence = this.extractSentenceContainingWord(wordElement);
                    console.log(`LLM API call for word: ${word}`);
                    
                    const response = await this.sendMessageWithTimeout({
                        type: 'GET_WORD_ANALYSIS',
                        word: word,
                        sentence: sentence
                    }, 25000); // 延長: 25秒
                    
                    if (response && response.success && response.analysis) {
                        // 個別解析結果をキャッシュに保存
                        this.llmAnalysisResults.set(lowerWord, response.analysis);
                        
                        // この単語の要素のみを更新（マウスオーバー対象）
                        if (wordElement && response.analysis.pos) {
                            wordElement.className = 'ela-word ela-' + response.analysis.pos;
                            wordElement.dataset.pos = response.analysis.pos;
                            wordElement.dataset.source = 'llm-individual';
                            
                            console.log(`Individual LLM updated word "${word}": pending → ${response.analysis.pos}`);
                        }
                        
                        // キャッシュサイズ制限
                        if (this.llmAnalysisResults.size > this.MAX_LLM_CACHE) {
                            const firstKey = this.llmAnalysisResults.keys().next().value;
                            this.llmAnalysisResults.delete(firstKey);
                        }
                        
                        return response.analysis;
                    }
                    
                    return null;
                } finally {
                    // 進行中リクエストから削除
                    this.pendingRequests.delete(`llm_${lowerWord}`);
                }
            })();
            
            // 進行中リクエストとして追加
            this.pendingRequests.set(`llm_${lowerWord}`, requestPromise);
            
            return await requestPromise;
            
        } catch (error) {
            if (error.message.includes('Extension context invalidated')) {
                console.warn('Extension context invalidated during LLM analysis');
                return null;
            }
            console.error('LLM word analysis error:', error);
            return null;
        }
    }
    
    // 単語を含む文章を抽出
    extractSentenceContainingWord(wordElement) {
        let currentElement = wordElement.parentElement;
        while (currentElement) {
            if (['P', 'DIV', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6'].includes(currentElement.tagName)) {
                return this.extractCleanText(currentElement);
            }
            currentElement = currentElement.parentElement;
        }
        return wordElement.textContent || '';
    }
    
    // LLM解析結果でツールチップを更新
    updateTooltipWithLLMAnalysis(analysisData) {
        if (!this.tooltipElement) return;
        
        let html = `<div class="ela-tooltip-word">${analysisData.word}</div>`;
        
        // 品詞と信頼度
        if (analysisData.pos) {
            const posJapanese = this.translatePartOfSpeech(analysisData.pos);
            const confidence = analysisData.confidence ? ` (${Math.round(analysisData.confidence * 100)}%)` : '';
            html += `<div class="ela-tooltip-pos ${analysisData.pos}">${posJapanese}${confidence}</div>`;
        }
        
        // 基本的な意味（単語だけの意味）
        if (analysisData.basic_meaning) {
            html += `<div class="ela-tooltip-basic-meaning">
                <strong>基本的な意味:</strong> ${analysisData.basic_meaning}
            </div>`;
        }
        
        // 文脈での意味
        if (analysisData.contextual_meaning || analysisData.meaning) {
            const contextualMeaning = analysisData.contextual_meaning || analysisData.meaning;
            html += `<div class="ela-tooltip-llm-meaning">
                <strong>文脈での意味:</strong> ${contextualMeaning}
            </div>`;
        }
        
        // 例文
        if (analysisData.examples && analysisData.examples.length > 0) {
            html += `<div class="ela-tooltip-examples">
                <strong>例文:</strong>
            </div>`;
            analysisData.examples.forEach(example => {
                if (typeof example === 'string') {
                    // 旧形式の例文
                    html += `<div class="ela-tooltip-example">"${this.formatExampleText(example, analysisData.word)}"</div>`;
                } else if (example.english && example.japanese) {
                    // 新形式の例文（英語+日本語）
                    html += `<div class="ela-tooltip-example">
                        <div class="ela-example-english">"${this.formatExampleText(example.english, analysisData.word)}"</div>
                        <div class="ela-example-japanese">「${example.japanese}」</div>
                    </div>`;
                }
            });
        }
        
        // 注釈（文法的関係性）
        if (analysisData.context_notes) {
            html += `<div class="ela-tooltip-context">
                <strong>注釈:</strong> ${analysisData.context_notes}
            </div>`;
        }
        
        // 句動詞・イディオムの場合
        if (analysisData.type) {
            const typeTranslation = {
                'phrasal_verb': '句動詞',
                'idiom': 'イディオム',
                'collocation': '連語'
            };
            html += `<div class="ela-tooltip-phrase-type">
                <strong>種類:</strong> ${typeTranslation[analysisData.type] || analysisData.type}
            </div>`;
        }
        
        html += `<div class="ela-tooltip-source">🤖 AI解析</div>`;
        
        this.tooltipElement.innerHTML = html;
    }
    
    // 例文内の対象単語を強調表示
    formatExampleText(text, targetWord) {
        if (!text || !targetWord) return text;
        
        // **で囲まれた部分を<strong>タグに変換
        let formattedText = text.replace(/\*\*(.*?)\*\*/g, '<strong class="ela-highlight-word">$1</strong>');
        
        // **がない場合は対象単語を自動検出して強調
        if (!text.includes('**')) {
            const regex = new RegExp(`\\b(${targetWord.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})\\b`, 'gi');
            formattedText = formattedText.replace(regex, '<strong class="ela-highlight-word">$1</strong>');
        }
        
        return formattedText;
    }
    
    // 品詞の日本語変換
    translatePartOfSpeech(pos) {
        const translations = {
            'noun': '名詞',
            'verb': '動詞',
            'adjective': '形容詞',
            'adverb': '副詞',
            'preposition': '前置詞',
            'pronoun': '代名詞',
            'conjunction': '接続詞',
            'determiner': '限定詞'
        };
        return translations[pos.toLowerCase()] || pos;
    }
    
    // 品詞のクラス名を取得（英語→英語の正規化）
    getPartOfSpeechClass(pos) {
        const posMap = {
            'noun': 'noun',
            'verb': 'verb',
            'adjective': 'adjective',
            'adverb': 'adverb',
            'preposition': 'preposition',
            'pronoun': 'pronoun',
            'conjunction': 'conjunction',
            'determiner': 'determiner',
            // 日本語の品詞も対応
            '名詞': 'noun',
            '動詞': 'verb',
            '形容詞': 'adjective',
            '副詞': 'adverb',
            '前置詞': 'preposition',
            '代名詞': 'pronoun',
            '接続詞': 'conjunction',
            '限定詞': 'determiner'
        };
        return posMap[pos.toLowerCase()] || 'noun';
    }
    
    // 既存の単語要素をLLMデータで更新（シンプル版）
    updateWordElementsWithLLMData() {
        const wordElements = document.querySelectorAll('.ela-word[data-pos="pending"]');
        console.log(`Updating ${wordElements.length} pending word elements with LLM data`);
        
        wordElements.forEach(element => {
            const word = element.dataset.word;
            if (word && this.llmAnalysisResults.has(word.toLowerCase())) {
                const analysisData = this.llmAnalysisResults.get(word.toLowerCase());
                
                // LLM解析結果で品詞を更新（pending → 実際の品詞）
                if (analysisData.pos) {
                    // クラスを更新
                    element.className = 'ela-word ela-' + analysisData.pos;
                    element.dataset.pos = analysisData.pos;
                    element.dataset.source = 'llm';
                    
                    console.log(`LLM updated word "${word}": pending → ${analysisData.pos} (confidence: ${analysisData.confidence})`);
                }
                
                // 信頼度を属性として保存
                if (analysisData.confidence) {
                    element.dataset.confidence = analysisData.confidence;
                }
            }
        });
    }
    

    

}

// コンテンツスクリプトを初期化
console.log('🔧 Initializing English Learning Assistant...');

try {
    const englishLearningAssistant = new EnglishLearningAssistant();
    console.log('✅ English Learning Assistant instance created');
    
    // グローバルアクセス用
    window.englishLearningAssistant = englishLearningAssistant;
    
    // 基本的な動作確認
    if (typeof englishLearningAssistant.init === 'function') {
        console.log('🔄 Starting initialization process...');
        // init()は既にコンストラクタで呼ばれているので、ここでは状態確認のみ
    }
    
    // デバッグ用の即座確認
    setTimeout(() => {
        console.log('📊 Post-initialization check:');
        console.log(`- ELA_DEBUG available: ${typeof window.ELA_DEBUG !== 'undefined'}`);
        console.log(`- checkELA available: ${typeof window.checkELA !== 'undefined'}`);
        console.log(`- Extension loaded: ${window.ELA_EXTENSION_LOADED || false}`);
    }, 1000);
    
} catch (error) {
    console.error('❌ Failed to initialize English Learning Assistant:', error);
    console.error('Error details:', {
        name: error.name,
        message: error.message,
        stack: error.stack
    });
}

