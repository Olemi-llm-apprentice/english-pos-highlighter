// English Learning Assistant - Content Script (シンプル・安定版)
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
        
        // キャッシュサイズ設定（調整可能）
        this.MAX_DICTIONARY_CACHE = 2000;
        this.MAX_LLM_CACHE = 2000;
        
        this.init();
        this.setupContextMonitoring();
        this.setupCacheMonitoring();
    }
    
    init() {
        this.setupMessageListener();
        console.log('English Learning Assistant initialized');
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
        // 定期的にExtension contextをチェック
        this.contextCheckInterval = setInterval(() => {
            if (!chrome.runtime?.id) {
                if (!this.contextInvalidated) {
                    console.warn('Extension context invalidated detected');
                    this.contextInvalidated = true;
                    this.handleContextInvalidation();
                }
            }
        }, 5000); // 5秒ごとにチェック
        
        // ページ離脱時にクリーンアップ
        window.addEventListener('beforeunload', () => {
            if (this.contextCheckInterval) {
                clearInterval(this.contextCheckInterval);
            }
        });
    }
    
    handleContextInvalidation() {
        console.warn('Handling extension context invalidation');
        
        // 進行中の処理を停止
        this.analysisInProgress = false;
        
        // ツールチップを非表示
        this.hideTooltip();
        
        // タイマーをクリア
        if (this.hideTooltipTimer) {
            clearTimeout(this.hideTooltipTimer);
            this.hideTooltipTimer = null;
        }
        
        // インターバルをクリア
        if (this.contextCheckInterval) {
            clearInterval(this.contextCheckInterval);
            this.contextCheckInterval = null;
        }
        
        // キャッシュ監視インターバルをクリア
        if (this.cacheMonitoringInterval) {
            clearInterval(this.cacheMonitoringInterval);
            this.cacheMonitoringInterval = null;
        }
        
        // 進行中のリクエストをクリア
        this.pendingRequests.clear();
        
        // ユーザーに状況を通知するバナーを表示
        this.showContextInvalidationNotice();
        
        // 可能な限りローカル機能を維持
        this.enableOfflineMode();
    }
    
    showContextInvalidationNotice() {
        // 既存の通知がある場合は削除
        const existingNotice = document.getElementById('ela-context-invalidation-notice');
        if (existingNotice) {
            existingNotice.remove();
        }
        
        const notice = document.createElement('div');
        notice.id = 'ela-context-invalidation-notice';
        notice.style.cssText = `
            position: fixed;
            top: 10px;
            right: 10px;
            background: #ff6b6b;
            color: white;
            padding: 12px 16px;
            border-radius: 8px;
            font-size: 14px;
            font-weight: 500;
            z-index: 10001;
            box-shadow: 0 4px 12px rgba(0,0,0,0.2);
            max-width: 350px;
            line-height: 1.4;
        `;
        notice.innerHTML = `
            <div style="display: flex; align-items: center; gap: 8px;">
                <span>⚠️</span>
                <div>
                    <div style="font-weight: 600;">拡張機能が再読み込みされました</div>
                    <div style="font-size: 12px; opacity: 0.9;">基本機能のみ利用可能です</div>
                </div>
                <button style="background: none; border: none; color: white; font-size: 18px; cursor: pointer; padding: 0; margin-left: auto;" onclick="this.parentElement.parentElement.remove()">×</button>
            </div>
        `;
        
        document.body.appendChild(notice);
        
        // 10秒後に自動で非表示
        setTimeout(() => {
            if (notice.parentElement) {
                notice.remove();
            }
        }, 10000);
    }
    
    enableOfflineMode() {
        console.warn('Enabling offline mode - limited functionality');
        
        // オフライン辞書機能を有効化（既存のDOM要素から情報を取得）
        this.offlineMode = true;
        
        // 簡易ツールチップ機能を維持
        this.setupOfflineTooltips();
    }
    
    setupOfflineTooltips() {
        // 既存の単語要素に簡易ツールチップを設定
        const wordElements = document.querySelectorAll('.ela-word');
        wordElements.forEach(element => {
            if (!element.hasAttribute('data-offline-tooltip')) {
                element.setAttribute('data-offline-tooltip', 'true');
                element.addEventListener('mouseenter', (e) => {
                    this.showOfflineTooltip(e.target);
                });
                element.addEventListener('mouseleave', () => {
                    this.hideTooltip();
                });
            }
        });
    }
    
    showOfflineTooltip(wordElement) {
        const word = wordElement.textContent.trim();
        
        // 基本的な単語情報を表示（品詞クラスから推測）
        const posClass = Array.from(wordElement.classList).find(cls => 
            ['noun', 'verb', 'adjective', 'adverb', 'preposition', 'conjunction', 'pronoun', 'interjection'].includes(cls)
        );
        
        const pos = posClass || 'unknown';
        const confidence = wordElement.getAttribute('data-confidence') || '未知';
        
        const tooltipContent = `
            <div class="ela-tooltip-header">
                <span class="ela-tooltip-word">${word}</span>
                <span class="ela-tooltip-pos ${pos}">${this.translatePartOfSpeech(pos)}</span>
            </div>
            <div class="ela-tooltip-offline-notice">
                <div style="color: #e74c3c; font-size: 12px; margin-top: 8px;">
                    ⚠️ オフラインモード - 詳細情報は拡張機能の再読み込み後に利用可能
                </div>
                <div style="color: #666; font-size: 11px; margin-top: 4px;">
                    信頼度: ${confidence}
                </div>
            </div>
        `;
        
        this.showTooltipWithContent(wordElement, tooltipContent);
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
    
    // Extension contextの状態をチェック
    isExtensionContextValid() {
        if (this.contextInvalidated) {
            return false;
        }
        
        // より厳密なコンテキストチェック
        try {
            // chrome.runtime.idをチェック
            if (!chrome.runtime?.id) {
                console.warn('Extension context check failed: chrome.runtime.id is null');
                this.contextInvalidated = true;
                this.handleContextInvalidation();
                return false;
            }
            
            // chrome.runtime.sendMessageが存在するかチェック
            if (typeof chrome.runtime.sendMessage !== 'function') {
                console.warn('Extension context check failed: sendMessage is not available');
                this.contextInvalidated = true;
                this.handleContextInvalidation();
                return false;
            }
            
            // 実際に簡単なメッセージを送信してテスト
            chrome.runtime.sendMessage({type: 'CONTEXT_CHECK'}, (response) => {
                if (chrome.runtime.lastError) {
                    console.warn('Extension context check failed via test message:', chrome.runtime.lastError.message);
                    if (!this.contextInvalidated) {
                        this.contextInvalidated = true;
                        this.handleContextInvalidation();
                    }
                }
            });
            
            return true;
        } catch (error) {
            console.warn('Extension context check failed with exception:', error);
            this.contextInvalidated = true;
            this.handleContextInvalidation();
            return false;
        }
    }
    
    // タイムアウト付きでメッセージを送信
    async sendMessageWithTimeout(message, timeout = 10000) {
        return new Promise((resolve, reject) => {
            // タイムアウトタイマー
            const timeoutId = setTimeout(() => {
                reject(new Error('Message timeout: Extension context may be invalidated'));
            }, timeout);
            
            try {
                chrome.runtime.sendMessage(message, (response) => {
                    clearTimeout(timeoutId);
                    
                    // Chrome runtime エラーチェック
                    if (chrome.runtime.lastError) {
                        reject(new Error(chrome.runtime.lastError.message));
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
            
            // LLM解析を開始
            this.startLLMAnalysis();
            
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
                    const pos = this.guessPartOfSpeech(cleanWord);
                    const span = document.createElement('span');
                    span.className = `ela-word ela-${pos}`;
                    span.setAttribute('data-word', cleanWord.toLowerCase());
                    span.setAttribute('data-pos', pos);
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
    
    guessPartOfSpeech(word) {
        const lowerWord = word.toLowerCase();
        
        // 動詞の推測
        if (lowerWord.endsWith('ing') || lowerWord.endsWith('ed') || lowerWord.endsWith('s')) {
            return 'verb';
        }
        
        // 形容詞の推測
        if (lowerWord.endsWith('ly')) {
            return 'adverb';
        }
        
        // 前置詞
        const prepositions = ['in', 'on', 'at', 'by', 'for', 'with', 'from', 'to', 'of', 'about', 'under', 'over'];
        if (prepositions.includes(lowerWord)) {
            return 'preposition';
        }
        
        // 代名詞
        const pronouns = ['i', 'you', 'he', 'she', 'it', 'we', 'they', 'me', 'him', 'her', 'us', 'them'];
        if (pronouns.includes(lowerWord)) {
            return 'pronoun';
        }
        
        // 接続詞
        const conjunctions = ['and', 'or', 'but', 'so', 'because', 'although', 'while'];
        if (conjunctions.includes(lowerWord)) {
            return 'conjunction';
        }
        
        // 限定詞
        const determiners = ['the', 'a', 'an', 'this', 'that', 'these', 'those', 'my', 'your', 'his', 'her', 'its', 'our', 'their'];
        if (determiners.includes(lowerWord)) {
            return 'determiner';
        }
        
        // デフォルトは名詞
        return 'noun';
    }
    
    isEnglishWord(word) {
        const cleanWord = word.trim().toLowerCase();
        return /^[a-z]+$/.test(cleanWord) && cleanWord.length > 1;
    }
    
    wrapWord(word, pos) {
        return `<span class="ela-word ela-${pos}" data-word="${word.toLowerCase()}" data-pos="${pos}">${word}</span>`;
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
                    this.showDictionary(e.target);
                }
            });
            
            // マウスアウトイベント - 遅延付き
            word.addEventListener('mouseleave', () => {
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
        // 300ms後に辞書を隠す（ユーザーがツールチップに移動する時間を与える）
        this.hideTooltipTimer = setTimeout(() => {
            this.hideDictionary();
        }, 300);
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
                console.warn('Extension context invalidated, skipping API call');
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
            }, 5000); // 短縮: 5秒
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
                    // 遅延を入れてAPI制限を回避
                    await this.delay(i * 100);
                    
                    // Extension context チェック
                    if (!this.isExtensionContextValid()) {
                        throw new Error('Extension context invalidated');
                    }
                    
                    let response;
                    try {
                        response = await this.sendMessageWithTimeout({
                            type: 'TRANSLATE_TEXT',
                            text: paragraph.text
                        }, 5000); // 短縮: 5秒
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
    
    // LLM解析を開始
    async startLLMAnalysis() {
        try {
            if (!this.settings.posTagging) {
                console.log('POS tagging disabled, skipping LLM analysis');
                return;
            }
            
            this.analysisInProgress = true;
            
            // 解析対象の文章を抽出
            const sentences = this.extractSentencesForAnalysis();
            
            if (sentences.length === 0) {
                console.log('No sentences found for LLM analysis');
                this.analysisInProgress = false;
                return;
            }
            
            console.log(`Starting LLM analysis for ${sentences.length} sentences`);
            
            // Extension context チェック
            if (!this.isExtensionContextValid()) {
                throw new Error('Extension context invalidated');
            }
            
            // バックグラウンドでLLM解析を開始
            try {
                await this.sendMessageWithTimeout({
                    type: 'ANALYZE_TEXT_WITH_LLM',
                    pageId: this.pageId,
                    sentences: sentences
                }, 3000); // 短縮: 3秒
            } catch (sendError) {
                console.error('Failed to start LLM analysis:', sendError);
                if (sendError instanceof DOMException) {
                    console.error('DOMException in startLLMAnalysis:', {
                        code: sendError.code,
                        name: sendError.name,
                        message: sendError.message
                    });
                }
                throw sendError;
            }
            
        } catch (error) {
            console.error('Failed to start LLM analysis:', error);
            this.analysisInProgress = false;
        }
    }
    
    // LLM解析完了の処理
    handleLLMAnalysisComplete(pageId, analysis) {
        if (pageId !== this.pageId) {
            console.log('LLM analysis for different page, ignoring');
            return;
        }
        
        console.log('LLM analysis complete, updating word data');
        
        // 解析結果を保存
        if (analysis && analysis.words) {
            analysis.words.forEach(wordData => {
                this.llmAnalysisResults.set(wordData.word.toLowerCase(), wordData);
            });
        }
        
        // 句動詞・イディオムも保存
        if (analysis && analysis.phrases) {
            analysis.phrases.forEach(phraseData => {
                this.llmAnalysisResults.set(phraseData.phrase.toLowerCase(), phraseData);
            });
        }
        
        this.analysisInProgress = false;
        
        // 既存の単語要素の品詞クラスを更新
        this.updateWordElementsWithLLMData();
        
        console.log(`LLM analysis stored for ${this.llmAnalysisResults.size} words/phrases`);
    }
    
    // LLM解析用の文章抽出
    extractSentencesForAnalysis() {
        const sentences = [];
        
        // 既に処理されている要素から文章を抽出
        const processedElements = document.querySelectorAll('.ela-word');
        const sentenceElements = new Set();
        
        processedElements.forEach(wordElement => {
            let currentElement = wordElement.parentElement;
            while (currentElement) {
                if (['P', 'DIV', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'SPAN'].includes(currentElement.tagName)) {
                    sentenceElements.add(currentElement);
                    break;
                }
                currentElement = currentElement.parentElement;
            }
        });
        
        sentenceElements.forEach(element => {
            const text = this.extractCleanText(element);
            if (text.length > 20 && this.isEnglishText(text)) {
                sentences.push(text);
            }
        });
        
        return sentences.slice(0, 10); // 最大10文章まで
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
                await this.delay(500);
                if (this.llmAnalysisResults.has(lowerWord)) {
                    return this.llmAnalysisResults.get(lowerWord);
                }
            }
            
            // Extension context チェック
            if (!this.isExtensionContextValid()) {
                console.warn('Extension context invalidated, skipping LLM analysis');
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
                    }, 8000); // 短縮: 8秒
                    
                    if (response && response.success && response.analysis) {
                        // 個別解析結果をキャッシュに保存
                        this.llmAnalysisResults.set(lowerWord, response.analysis);
                        
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
    
    // 既存の単語要素をLLMデータで更新
    updateWordElementsWithLLMData() {
        const wordElements = document.querySelectorAll('.ela-word');
        
        wordElements.forEach(element => {
            const word = element.dataset.word;
            if (word && this.llmAnalysisResults.has(word)) {
                const analysisData = this.llmAnalysisResults.get(word);
                
                // 品詞クラスを更新
                if (analysisData.pos) {
                    // 既存の品詞クラスを削除
                    element.className = element.className.replace(/ela-\w+/g, 'ela-word');
                    // 新しい品詞クラスを追加
                    element.classList.add(`ela-${analysisData.pos}`);
                    element.dataset.pos = analysisData.pos;
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
const englishLearningAssistant = new EnglishLearningAssistant();

