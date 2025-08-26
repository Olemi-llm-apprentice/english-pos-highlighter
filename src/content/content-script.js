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
        
        this.init();
    }
    
    init() {
        this.setupMessageListener();
        console.log('English Learning Assistant initialized');
    }
    
    setupMessageListener() {
        chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
            this.handleMessage(message, sender, sendResponse);
            return true; // 非同期レスポンス
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
            const response = await chrome.runtime.sendMessage({
                type: 'LOOKUP_WORD',
                word: word
            });
            
            return response && response.success ? response.definition : null;
        } catch (error) {
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
            button.classList.add('loading');
            button.textContent = '翻訳中...';
            
            // 翻訳ボタンのテキストを除外
            const textToTranslate = element.textContent.replace('翻訳中...', '').replace('翻訳', '').trim();
            
            const response = await chrome.runtime.sendMessage({
                type: 'TRANSLATE_TEXT',
                text: textToTranslate
            });
            
            if (response && response.success && response.translation) {
                this.showTranslationResult(element, textToTranslate, response.translation);
            } else {
                alert('翻訳に失敗しました: ' + (response?.error || '不明なエラー'));
            }
            
        } catch (error) {
            console.error('Translation error:', error);
            alert('翻訳でエラーが発生しました');
        } finally {
            button.classList.remove('loading');
            button.textContent = '翻訳';
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
}

// コンテンツスクリプトを初期化
const englishLearningAssistant = new EnglishLearningAssistant();

