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
        
        this.init();
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
            this.handleMessage(message, sender, sendResponse);
            return true; // 非同期レスポンス
        });
    }
    
    generatePageId() {
        // ページのユニークIDを生成
        return `page_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
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
                    
                default:
                    sendResponse({ success: false, error: 'Unknown message type' });
            }
        } catch (error) {
            console.error('Message handling error:', error);
            sendResponse({ success: false, error: error.message });
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
            
            // 辞書データを取得
            const definition = await this.lookupWord(word);
            
            // レスポンス時に表示中の単語が変わっていないかチェック
            if (this.currentTooltipWord === word && this.tooltipElement) {
                if (definition) {
                    this.updateTooltipContent(definition);
                } else {
                    this.tooltipElement.innerHTML = '<div class="ela-tooltip-error">辞書データが見つかりません</div>';
                }
            }
            // 別の単語に移動している場合は何もしない（新しいツールチップが既に表示されている）
            
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
            // Extension context invalidated チェック
            if (!chrome.runtime?.id) {
                console.warn('Extension context invalidated, skipping API call');
                return null;
            }
            
            const response = await chrome.runtime.sendMessage({
                type: 'LOOKUP_WORD',
                word: word
            });
            
            return response && response.success ? response.definition : null;
        } catch (error) {
            if (error.message.includes('Extension context invalidated')) {
                console.warn('Extension context invalidated during word lookup');
                return null;
            }
            console.error('Word lookup error:', error);
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
                html += `<div class="ela-tooltip-pos">${meaning.partOfSpeech}</div>`;
                
                if (meaning.definitions && meaning.definitions.length > 0) {
                    meaning.definitions.slice(0, 2).forEach(def => {
                        html += `<div class="ela-tooltip-definition">${def.definition}</div>`;
                        if (def.example) {
                            html += `<div class="ela-tooltip-example">"${def.example}"</div>`;
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
        
        if (!chrome.runtime?.id) {
            throw new Error('Extension context invalidated');
        }
        
        const response = await chrome.runtime.sendMessage({
            type: 'TRANSLATE_TEXT',
            text: textToTranslate
        });
        
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
                    if (!chrome.runtime?.id) {
                        throw new Error('Extension context invalidated');
                    }
                    
                    const response = await chrome.runtime.sendMessage({
                        type: 'TRANSLATE_TEXT',
                        text: paragraph.text
                    });
                    
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
}

// コンテンツスクリプトを初期化
const englishLearningAssistant = new EnglishLearningAssistant();

