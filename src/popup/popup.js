// Popup Controller - シンプル版
class PopupController {
    constructor() {
        this.isActive = false;
        this.settings = {
            posTagging: true,
            dictionary: true,
            translation: true,
            apiKey: ''
        };
        
        this.init();
    }
    
    async init() {
        await this.loadSettings();
        this.setupEventListeners();
        this.updateUI();
        await this.checkStatus();
    }
    
    async loadSettings() {
        try {
            // まずsyncストレージを試行
            let result = await chrome.storage.sync.get(['elaSettings', 'elaActive']);
            
            // syncが失敗した場合はlocalストレージを使用
            if (!result.elaSettings) {
                result = await chrome.storage.local.get(['elaSettings', 'elaActive']);
            }
            
            if (result.elaSettings) {
                this.settings = { ...this.settings, ...result.elaSettings };
            }
            this.isActive = result.elaActive || false;
            
        } catch (error) {
            console.error('Settings load error:', error);
        }
    }
    
    async saveSettings() {
        try {
            // 設定を最小限に圧縮
            const compactSettings = {
                posTagging: this.settings.posTagging,
                dictionary: this.settings.dictionary,
                translation: this.settings.translation,
                apiKey: this.settings.apiKey
            };
            
            // まずsyncストレージを試行
            try {
                await chrome.storage.sync.set({
                    elaSettings: compactSettings,
                    elaActive: this.isActive
                });
            } catch (syncError) {
                // syncが失敗した場合はlocalストレージを使用
                await chrome.storage.local.set({
                    elaSettings: compactSettings,
                    elaActive: this.isActive
                });
            }
            
        } catch (error) {
            console.error('Settings save error:', error);
        }
    }
    
    setupEventListeners() {
        // メインボタン
        document.getElementById('mainButton').addEventListener('click', () => {
            this.toggleLearningMode();
        });
        
        // 設定トグル
        document.getElementById('posTaggingToggle').addEventListener('click', () => {
            this.toggleSetting('posTagging');
        });
        
        document.getElementById('dictionaryToggle').addEventListener('click', () => {
            this.toggleSetting('dictionary');
        });
        
        document.getElementById('translationToggle').addEventListener('click', () => {
            this.toggleSetting('translation');
        });
        
        // APIキー関連
        document.getElementById('saveApiKey').addEventListener('click', () => {
            this.saveApiKey();
        });
        
        document.getElementById('testApiKey').addEventListener('click', () => {
            this.testApiKey();
        });
        
        // APIキー入力フィールド
        document.getElementById('apiKeyInput').addEventListener('input', (e) => {
            this.settings.apiKey = e.target.value.trim();
        });
    }
    
    async toggleLearningMode() {
        try {
            if (this.isActive) {
                await this.stopLearningMode();
            } else {
                await this.startLearningMode();
            }
        } catch (error) {
            console.error('Toggle learning mode error:', error);
            this.showMessage('操作に失敗しました', 'error');
        }
    }
    
    async startLearningMode() {
        try {
            // アクティブなタブを取得
            const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
            
            if (!tab) {
                this.showMessage('アクティブなタブが見つかりません', 'error');
                return;
            }
            
            // コンテンツスクリプトにメッセージを送信
            const response = await chrome.tabs.sendMessage(tab.id, {
                type: 'START_LEARNING_MODE',
                settings: this.settings
            });
            
            if (response && response.success) {
                this.isActive = true;
                await this.saveSettings();
                this.updateUI();
                this.showMessage('学習モードを開始しました', 'success');
            } else {
                this.showMessage(response?.error || '学習モードの開始に失敗しました', 'error');
            }
            
        } catch (error) {
            console.error('Start learning mode error:', error);
            this.showMessage('学習モードの開始に失敗しました', 'error');
        }
    }
    
    async stopLearningMode() {
        try {
            // アクティブなタブを取得
            const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
            
            if (!tab) {
                this.showMessage('アクティブなタブが見つかりません', 'error');
                return;
            }
            
            // コンテンツスクリプトにメッセージを送信
            const response = await chrome.tabs.sendMessage(tab.id, {
                type: 'STOP_LEARNING_MODE'
            });
            
            if (response && response.success) {
                this.isActive = false;
                await this.saveSettings();
                this.updateUI();
                this.showMessage('学習モードを停止しました', 'success');
            } else {
                this.showMessage(response?.error || '学習モードの停止に失敗しました', 'error');
            }
            
        } catch (error) {
            console.error('Stop learning mode error:', error);
            this.showMessage('学習モードの停止に失敗しました', 'error');
        }
    }
    
    async toggleSetting(settingName) {
        this.settings[settingName] = !this.settings[settingName];
        await this.saveSettings();
        this.updateUI();
        
        // アクティブな場合は設定を更新
        if (this.isActive) {
            try {
                const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
                if (tab) {
                    chrome.tabs.sendMessage(tab.id, {
                        type: 'UPDATE_SETTINGS',
                        settings: this.settings
                    });
                }
            } catch (error) {
                console.error('Update settings error:', error);
            }
        }
    }
    
    async saveApiKey() {
        const apiKey = document.getElementById('apiKeyInput').value.trim();
        
        if (!apiKey) {
            this.showMessage('APIキーを入力してください', 'error');
            return;
        }
        
        this.settings.apiKey = apiKey;
        await this.saveSettings();
        this.showMessage('APIキーを保存しました', 'success');
    }
    
    async testApiKey() {
        const apiKey = document.getElementById('apiKeyInput').value.trim();
        
        if (!apiKey) {
            this.showMessage('APIキーを入力してください', 'error');
            return;
        }
        
        try {
            this.showMessage('接続テスト中...', 'info');
            
            const response = await fetch('https://api.openai.com/v1/models', {
                method: 'GET',
                headers: {
                    'Authorization': `Bearer ${apiKey}`
                }
            });
            
            if (response.ok) {
                this.settings.apiKey = apiKey;
                await this.saveSettings();
                this.showMessage('接続テスト成功！APIキーを保存しました', 'success');
            } else {
                this.showMessage('接続テスト失敗: 無効なAPIキーです', 'error');
            }
            
        } catch (error) {
            console.error('API key test error:', error);
            this.showMessage('接続テスト失敗: ネットワークエラー', 'error');
        }
    }
    
    async checkStatus() {
        try {
            const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
            
            if (!tab) {
                document.getElementById('status').textContent = 'タブが見つかりません';
                return;
            }
            
            // コンテンツスクリプトの状態を確認
            const response = await chrome.tabs.sendMessage(tab.id, {
                type: 'CHECK_STATUS'
            });
            
            if (response && response.success) {
                this.isActive = response.isActive;
                this.updateUI();
            }
            
        } catch (error) {
            // コンテンツスクリプトが読み込まれていない場合は無視
            console.log('Content script not ready:', error);
        }
    }
    
    updateUI() {
        // メインボタン
        const mainButton = document.getElementById('mainButton');
        if (this.isActive) {
            mainButton.textContent = '⏹️ 学習モードを停止';
            mainButton.classList.add('active');
        } else {
            mainButton.textContent = '🚀 学習モードを開始';
            mainButton.classList.remove('active');
        }
        
        // 設定トグル
        this.updateToggle('posTaggingToggle', this.settings.posTagging);
        this.updateToggle('dictionaryToggle', this.settings.dictionary);
        this.updateToggle('translationToggle', this.settings.translation);
        
        // APIキー入力フィールド
        if (this.settings.apiKey) {
            document.getElementById('apiKeyInput').value = this.settings.apiKey;
        }
        
        // ステータス
        const status = document.getElementById('status');
        if (this.isActive) {
            status.textContent = '学習モード実行中';
        } else {
            status.textContent = '準備完了';
        }
    }
    
    updateToggle(toggleId, isActive) {
        const toggle = document.getElementById(toggleId);
        if (isActive) {
            toggle.classList.add('active');
        } else {
            toggle.classList.remove('active');
        }
    }
    
    showMessage(text, type = 'info') {
        const messageEl = document.getElementById('apiMessage');
        messageEl.textContent = text;
        messageEl.className = `message ${type}`;
        messageEl.style.display = 'block';
        
        // 3秒後に非表示
        setTimeout(() => {
            messageEl.style.display = 'none';
        }, 3000);
    }
}

// ポップアップを初期化
document.addEventListener('DOMContentLoaded', () => {
    new PopupController();
});

