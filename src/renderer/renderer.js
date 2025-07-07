const { ipcRenderer } = require('electron');
const { marked } = require('marked');

class MarkdownEditor {
    constructor() {
        console.log('MarkdownEditor constructor called');
        this.currentFile = null;
        this.unsavedChanges = false;
        this.apiKey = null;
        this.defaultDirectory = null;
        this.imageDirectory = null;
        this.sidebarOpen = false;
        this.articles = [];
        this.selectedArticle = null;
        this.autoSaveTimer = null;
        this.isEditing = false;
        this.isSaving = false;
        this.currentTitle = '記事';
        this.autoTitleCounter = 1;
        this.isScrollSyncing = false;
        
        // バックグラウンド保存用
        this.saveQueue = [];
        this.isBackgroundSaving = false;
        this.pendingSaveData = null;
        this.lastSaveContent = '';
        this.lastSaveTitle = '';
        
        try {
            this.initializeElements();
            this.setupEventListeners();
            this.loadSettings();
            
            // 初期タイトルと保存状態を設定
            if (this.currentTitleSpan) {
                this.currentTitleSpan.textContent = this.currentTitle;
            }
            this.updateSaveIndicator('saved');
            
            console.log('MarkdownEditor initialized successfully');
        } catch (error) {
            console.error('Error during MarkdownEditor initialization:', error);
        }
    }

    initializeElements() {
        console.log('Initializing elements...');
        
        // Check all required elements
        const requiredElements = {
            'editor': 'editor',
            'preview': 'preview',
            'currentTitleSpan': 'current-title',
            'saveIndicator': 'save-indicator',
            'newBtn': 'new-btn',
            'toggleSidebarBtn': 'toggle-sidebar-btn',
            'sidebar': 'sidebar',
            'searchInput': 'search-input',
            'searchBtn': 'search-btn',
            'articleList': 'article-list',
            'defaultDirectoryInput': 'default-directory',
            'selectDirectoryBtn': 'select-directory-btn'
        };
        
        for (const [prop, id] of Object.entries(requiredElements)) {
            const element = document.getElementById(id);
            if (!element) {
                console.error(`Critical: Element '${id}' not found!`);
                throw new Error(`Required element '${id}' not found`);
            }
            this[prop] = element;
            console.log(`✓ ${prop} (${id}) found`);
        }
        
        // Optional elements  
        this.aiImageBtn = document.getElementById('ai-image-btn');
        
        // Tab system elements
        this.tabToggleBtn = document.getElementById('tab-toggle-btn');
        this.editorContent = document.getElementById('editor-content');
        this.previewContent = document.getElementById('preview-content');
        this.currentActiveTab = 'editor';
        
        // Image folder toolbar button
        this.openImageFolderToolbarBtn = document.getElementById('open-image-folder-toolbar');
        
        // Window control button
        this.closeBtn = document.getElementById('close-btn');
        
        // Copy markdown button
        this.copyMarkdownBtn = document.getElementById('copy-markdown-btn');
        
        // AI Assistant Panel elements
        this.aiAssistantPanel = document.querySelector('.ai-assistant-panel');
        this.conversationHistory = document.getElementById('conversation-history');
        this.aiInstruction = document.getElementById('ai-instruction');
        this.sendAiInstructionBtn = document.getElementById('send-ai-instruction');
        this.selectedTextInfo = document.getElementById('selected-text-info');
        this.selectionPreview = document.getElementById('selection-preview');
        this.toggleAiPanelBtn = document.getElementById('toggle-ai-panel');
        
        // Edit history elements (moved to editor tab area)
        this.undoBtn = document.getElementById('undo-btn');
        this.redoBtn = document.getElementById('redo-btn');
        this.settingsBtn = document.getElementById('settings-btn');
        this.aiContentModal = document.getElementById('ai-content-modal');
        this.aiEditModal = document.getElementById('ai-edit-modal');
        this.aiImageModal = document.getElementById('ai-image-modal');
        this.settingsModal = document.getElementById('settings-modal');
        this.loadingModal = document.getElementById('loading-modal');
        this.loadingMessage = document.getElementById('loading-message');
        this.contentPrompt = document.getElementById('content-prompt');
        this.editInstruction = document.getElementById('edit-instruction');
        this.imagePrompt = document.getElementById('image-prompt');
        this.apiKeyInput = document.getElementById('openai-api-key');
        this.generatedContent = document.getElementById('generated-content');
        this.editResult = document.getElementById('edit-result');
        this.generatedImage = document.getElementById('generated-image');
        this.insertContentBtn = document.getElementById('insert-content-btn');
        this.executeEditBtn = document.getElementById('execute-edit-btn');
        this.applyEditBtn = document.getElementById('apply-edit-btn');
        this.cancelEditBtn = document.getElementById('cancel-edit-btn');
        this.saveImageBtn = document.getElementById('save-image-btn');
        this.openImageFolderBtn = document.getElementById('open-image-folder-btn');
        this.imageActions = document.querySelector('.image-actions');
        this.editActions = document.querySelector('.edit-actions');
        this.currentContentPreview = document.getElementById('current-content-preview');
        this.showChangesCheckbox = document.getElementById('show-changes');
        this.imageDirectoryInput = document.getElementById('image-directory');
        this.selectImageDirectoryBtn = document.getElementById('select-image-directory-btn');
        
        // 生成された画像の情報を保持
        this.currentGeneratedImage = null;
        
        // AI編集用の情報を保持
        this.originalContent = '';
        this.editedContent = '';
        
        // 統合AIアシスタント用
        this.conversationMessages = [];
        this.currentSelection = null;
        this.aiPanelCollapsed = false;
        this.isAiProcessing = false;
        
        // 編集履歴管理用
        this.editHistory = [];
        this.currentHistoryIndex = -1;
        this.maxHistorySize = 50;
        
        console.log('All elements initialized successfully');
    }

    setupEventListeners() {
        // Editor events
        this.editor.addEventListener('input', () => {
            console.log('[Editor] Input event triggered');
            this.updatePreview();
            this.updateAutoTitle();
            this.markAsUnsaved();
            this.scheduleBackgroundSave();
        });
        
        // Manual typing detection for history saving
        let typingTimer;
        this.editor.addEventListener('input', () => {
            clearTimeout(typingTimer);
            typingTimer = setTimeout(() => {
                this.saveToHistory('manual', this.editor.value);
            }, 1000); // Save to history after 1 second of no typing
        });
        
        this.editor.addEventListener('focus', () => {
            this.isEditing = true;
        });
        
        this.editor.addEventListener('blur', () => {
            this.isEditing = false;
            console.log('[Editor] Blur event, unsavedChanges:', this.unsavedChanges);
            if (this.unsavedChanges) {
                this.triggerImmediateSave();
            }
        });
        
        // 同期スクロール機能 - エディタのスクロールに合わせてプレビューのみをスクロール
        this.isScrollSyncing = false; // 同期中フラグ
        
        this.editor.addEventListener('scroll', (e) => {
            // 同期処理中でない場合のみ実行
            if (!this.isScrollSyncing) {
                this.syncScroll();
            }
        });
        
        // テキスト選択の監視
        this.editor.addEventListener('mouseup', () => this.handleTextSelection());
        this.editor.addEventListener('keyup', () => this.handleTextSelection());
        
        // AI Assistant Panel events
        if (this.sendAiInstructionBtn) {
            this.sendAiInstructionBtn.addEventListener('click', () => this.sendAIInstruction());
        }
        
        if (this.aiInstruction) {
            this.aiInstruction.addEventListener('keydown', (e) => {
                if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                    this.sendAIInstruction();
                }
            });
        }
        
        if (this.toggleAiPanelBtn) {
            this.toggleAiPanelBtn.addEventListener('click', () => this.toggleAIPanel());
        }
        
        
        // Tab toggle event
        if (this.tabToggleBtn) {
            this.tabToggleBtn.addEventListener('click', () => this.toggleTab());
        }
        
        // Image folder toolbar button event
        if (this.openImageFolderToolbarBtn) {
            this.openImageFolderToolbarBtn.addEventListener('click', () => this.openImageFolder());
        }
        
        // Window control event
        if (this.closeBtn) {
            this.closeBtn.addEventListener('click', () => {
                ipcRenderer.invoke('close-window');
            });
        }
        
        // Copy markdown event
        if (this.copyMarkdownBtn) {
            this.copyMarkdownBtn.addEventListener('click', () => this.copyMarkdownToClipboard());
        }
        
        // Edit history events
        if (this.undoBtn) {
            this.undoBtn.addEventListener('click', () => this.undo());
        }
        if (this.redoBtn) {
            this.redoBtn.addEventListener('click', () => this.redo());
        }
        
        // Keyboard shortcuts for tab switching and undo/redo
        document.addEventListener('keydown', (e) => {
            if (e.ctrlKey || e.metaKey) {
                if (e.key === '1') {
                    e.preventDefault();
                    this.switchTab('editor');
                } else if (e.key === '2') {
                    e.preventDefault();
                    this.switchTab('preview');
                } else if (e.key === 'z' && !e.shiftKey) {
                    e.preventDefault();
                    this.undo();
                } else if ((e.key === 'z' && e.shiftKey) || e.key === 'y') {
                    e.preventDefault();
                    this.redo();
                } else if (e.key === 'C' && e.shiftKey) {
                    e.preventDefault();
                    this.copyMarkdownToClipboard();
                }
            }
        });

        // Button events
        this.newBtn.addEventListener('click', () => this.newFile());
        this.aiImageBtn.addEventListener('click', () => this.showAIImageModal());
        this.settingsBtn.addEventListener('click', () => this.showSettingsModal());
        this.toggleSidebarBtn.addEventListener('click', () => {
            console.log('Toggle sidebar button clicked');
            this.toggleSidebar();
        });
        
        // タイトル入力エリアは削除済み - イベントリスナー不要
        
        // Sidebar events
        this.searchBtn.addEventListener('click', () => {
            console.log('Search button clicked');
            this.searchArticles();
        });
        this.searchInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                console.log('Search enter pressed');
                this.searchArticles();
            }
        });
        
        // Settings events
        this.selectDirectoryBtn.addEventListener('click', () => this.selectDirectory());
        this.selectImageDirectoryBtn.addEventListener('click', () => this.selectImageDirectory());
        

        // Modal events
        this.setupModalEvents();

        // Menu events
        ipcRenderer.on('menu-new-file', () => this.newFile());

        // AI events
        document.getElementById('generate-content-btn').addEventListener('click', () => this.generateContent());
        document.getElementById('generate-image-btn').addEventListener('click', () => this.generateImage());
        document.getElementById('insert-content-btn').addEventListener('click', () => this.insertGeneratedContent());
        
        // 新しい画像関連イベント
        if (this.saveImageBtn) {
            this.saveImageBtn.addEventListener('click', () => this.saveGeneratedImageManually());
        }
        if (this.openImageFolderBtn) {
            this.openImageFolderBtn.addEventListener('click', () => this.openImageFolder());
        }
        
        document.getElementById('save-settings-btn').addEventListener('click', () => this.saveSettings());
        
        // Auto-refresh articles when sidebar opens
        this.editor.addEventListener('blur', () => {
            if (this.sidebarOpen) {
                this.refreshArticles();
            }
        });
        
        // ウィンドウを閉じる前のイベント
        ipcRenderer.on('before-close', async () => {
            if ((this.currentFile && this.unsavedChanges) || this.isBackgroundSaving || this.saveQueue.length > 0) {
                this.showLoading('保存中...');
                await this.flushAllSaves();
                
                // 保存が完了したらアプリを閉じる
                await ipcRenderer.invoke('close-app');
            } else {
                await ipcRenderer.invoke('close-app');
            }
        });
    }

    setupModalEvents() {
        // Close buttons
        document.getElementById('ai-content-close').addEventListener('click', () => {
            this.aiContentModal.style.display = 'none';
        });
        document.getElementById('ai-edit-close').addEventListener('click', () => {
            this.aiEditModal.style.display = 'none';
        });
        document.getElementById('ai-image-close').addEventListener('click', () => {
            this.aiImageModal.style.display = 'none';
        });
        document.getElementById('settings-close').addEventListener('click', () => {
            this.settingsModal.style.display = 'none';
        });

        // AI Edit buttons
        if (this.executeEditBtn) {
            this.executeEditBtn.addEventListener('click', () => this.executeAIEdit());
        }
        if (this.applyEditBtn) {
            this.applyEditBtn.addEventListener('click', () => this.applyEditedContent());
        }
        if (this.cancelEditBtn) {
            this.cancelEditBtn.addEventListener('click', () => this.cancelEdit());
        }

        // Click outside to close
        window.addEventListener('click', (e) => {
            if (e.target === this.aiContentModal) {
                this.aiContentModal.style.display = 'none';
            }
            if (e.target === this.aiEditModal) {
                this.aiEditModal.style.display = 'none';
            }
            if (e.target === this.aiImageModal) {
                this.aiImageModal.style.display = 'none';
            }
            if (e.target === this.settingsModal) {
                this.settingsModal.style.display = 'none';
            }
        });
    }

    updatePreview() {
        const markdown = this.editor.value;
        if (this.preview) {
            this.preview.innerHTML = marked(markdown);
        }
        
        // プレビュータブがアクティブな場合、自動的にプレビューを表示
        if (this.currentActiveTab === 'preview') {
            this.switchTab('preview');
        }
    }
    
    updateAutoTitle() {
        const content = this.editor.value.trim();
        let newTitle = '記事';
        
        if (content) {
            const firstLine = content.split('\n')[0].trim();
            if (firstLine.startsWith('# ')) {
                // 最初の行が # で始まる場合、それをタイトルとして使用
                newTitle = firstLine.substring(2).trim() || '記事';
            } else {
                // そうでない場合は自動タイトルを使用
                newTitle = this.generateAutoTitle();
            }
        }
        
        if (newTitle !== this.currentTitle) {
            this.currentTitle = newTitle;
            if (this.currentTitleSpan) {
                this.currentTitleSpan.textContent = newTitle;
            }
            console.log('Title updated to:', newTitle);
        }
    }
    
    generateAutoTitle() {
        // 既存の記事から適切な番号を生成
        if (!this.articles || this.articles.length === 0) {
            return '記事1';
        }
        
        const existingTitles = this.articles.map(a => a.title);
        let counter = 1;
        let title = '記事' + counter;
        
        while (existingTitles.includes(title)) {
            counter++;
            title = '記事' + counter;
            if (counter > 1000) break; // 無限ループ防止
        }
        
        return title;
    }
    
    syncScroll() {
        try {
            if (!this.editor || !this.preview) {
                console.warn('[syncScroll] Editor or preview element not found');
                return;
            }
            
            // 同期処理開始
            this.isScrollSyncing = true;
            
            // エディタのスクロール率を計算
            const editorScrollTop = this.editor.scrollTop;
            const editorScrollHeight = this.editor.scrollHeight - this.editor.clientHeight;
            
            // スクロール可能な高さがない場合は処理を終了
            if (editorScrollHeight <= 0) {
                this.isScrollSyncing = false;
                return;
            }
            
            const scrollRatio = editorScrollTop / editorScrollHeight;
            
            // プレビューのスクロール位置を計算
            const previewScrollHeight = this.preview.scrollHeight - this.preview.clientHeight;
            
            // プレビューがスクロール可能な場合のみ実行
            if (previewScrollHeight > 0) {
                const previewScrollTop = previewScrollHeight * scrollRatio;
                
                // プレビューをスクロール（エディタのスクロールに同期）
                requestAnimationFrame(() => {
                    if (this.preview) {
                        this.preview.scrollTop = previewScrollTop;
                    }
                    // 同期処理完了
                    this.isScrollSyncing = false;
                });
            } else {
                this.isScrollSyncing = false;
            }
        } catch (error) {
            console.error('[syncScroll] Error during scroll sync:', error);
            this.isScrollSyncing = false;
        }
    }
    
    updateSaveIndicator(status) {
        if (!this.saveIndicator) return;
        
        // クラスをリセット
        this.saveIndicator.className = 'save-indicator';
        
        switch (status) {
            case 'saved':
                this.saveIndicator.classList.add('saved');
                this.saveIndicator.textContent = '保存済み';
                break;
            case 'saving':
                this.saveIndicator.classList.add('saving');
                this.saveIndicator.textContent = '保存中...';
                break;
            case 'unsaved':
                this.saveIndicator.classList.add('unsaved');
                this.saveIndicator.textContent = '未保存';
                break;
        }
    }

    markAsUnsaved() {
        if (!this.unsavedChanges) {
            console.log('[markAsUnsaved] Marking as unsaved');
            this.unsavedChanges = true;
            this.updateSaveIndicator('unsaved');
        }
    }

    markAsSaved() {
        this.unsavedChanges = false;
        this.updateSaveIndicator('saved');
    }

    // 古いupdateTitleとextractFileNameFromPath関数は削除されました
    
    
    async renameFile(newTitle) {
        try {
            const newFilename = newTitle.endsWith('.md') ? newTitle : newTitle + '.md';
            const oldPath = this.currentFile;
            const directory = oldPath.substring(0, oldPath.lastIndexOf('/'));
            const newPath = directory + '/' + newFilename;
            
            // 新しいファイル名が既に存在するかチェック
            const exists = await ipcRenderer.invoke('check-file-exists', newFilename);
            if (exists) {
                alert('同名のファイルが既に存在します。');
                return;
            }
            
            // 新しいファイルとして保存
            const result = await ipcRenderer.invoke('save-new-file', this.editor.value, newFilename);
            if (result) {
                // 古いファイルを削除
                await ipcRenderer.invoke('delete-file', oldPath);
                
                this.currentFile = result;
                this.markAsSaved();
                
                // 記事リストを更新
                if (this.sidebarOpen) {
                    this.refreshArticles();
                }
            }
        } catch (error) {
            console.error('Error renaming file:', error);
            alert(`ファイル名の変更に失敗しました: ${error.message}`);
        }
    }

    async newFile() {
        console.log('newFile called');
        this.showLoading('新しい記事を作成中...');
        
        try {
            // 未保存の変更がある場合は保存する
            if (this.currentFile && this.unsavedChanges) {
                console.log('Flushing saves before creating new file');
                this.updateLoadingMessage('保存中...');
                await this.flushAllSaves();
            }
            
            this.updateLoadingMessage('新しいファイル名を生成中...');
            console.log('Resetting editor state for new file');
            this.editor.value = '';
            this.currentFile = null;
            
            // タイトルをリセット
            this.currentTitle = this.generateAutoTitle();
            this.currentTitleSpan.textContent = this.currentTitle;
            
            this.unsavedChanges = false;
            this.selectedArticle = null;
            this.updatePreview();
            
            // 記事リストの選択状態をリセット
            if (this.sidebarOpen) {
                console.log('Refreshing articles list for new file');
                this.updateLoadingMessage('記事リストを更新中...');
                this.renderArticles(this.articles);
            }
            
            // 履歴をリセットして初期状態を保存
            this.editHistory = [];
            this.currentHistoryIndex = -1;
            this.saveToHistory('new-file', '');
            this.updateHistoryButtons();
            
            this.editor.focus();
            console.log('New file created successfully with title:', this.currentTitle);
        } catch (error) {
            console.error('Error creating new file:', error);
            alert('新しい記事の作成に失敗しました: ' + error.message);
        } finally {
            this.hideLoading();
        }
    }
    
    // generateUniqueFileName関数は削除（自動タイトル機能で置き換え）



    showLoading(message = '保存中...') {
        if (this.loadingMessage) {
            this.loadingMessage.textContent = message;
        }
        if (this.loadingModal) {
            this.loadingModal.style.display = 'block';
        }
    }
    
    updateLoadingMessage(message) {
        if (this.loadingMessage) {
            this.loadingMessage.textContent = message;
        }
    }
    
    hideLoading() {
        if (this.loadingModal) {
            this.loadingModal.style.display = 'none';
        }
    }
    
    showSuccessMessage(message) {
        console.log('Success:', message);
        this.showTemporaryMessage(message, 'success');
    }
    
    showErrorMessage(message) {
        console.error('Error:', message);
        this.showTemporaryMessage(message, 'error');
        // エラーメッセージはアラートでも表示
        alert(message);
    }
    
    showTemporaryMessage(message, type = 'info') {
        // 一時的なメッセージを表示する関数
        const messageDiv = document.createElement('div');
        messageDiv.textContent = message;
        messageDiv.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            padding: 12px 20px;
            border-radius: 6px;
            color: white;
            font-weight: 500;
            z-index: 10000;
            max-width: 300px;
            word-wrap: break-word;
            animation: slideIn 0.3s ease-out;
            background-color: ${type === 'success' ? '#4CAF50' : type === 'error' ? '#f44336' : '#2196F3'};
            box-shadow: 0 4px 12px rgba(0,0,0,0.15);
        `;
        
        // アニメーション用CSSを動的に追加
        if (!document.getElementById('temp-message-styles')) {
            const styles = document.createElement('style');
            styles.id = 'temp-message-styles';
            styles.textContent = `
                @keyframes slideIn {
                    from { transform: translateX(100%); opacity: 0; }
                    to { transform: translateX(0); opacity: 1; }
                }
                @keyframes slideOut {
                    from { transform: translateX(0); opacity: 1; }
                    to { transform: translateX(100%); opacity: 0; }
                }
            `;
            document.head.appendChild(styles);
        }
        
        document.body.appendChild(messageDiv);
        
        // 3秒後にメッセージを除去
        setTimeout(() => {
            messageDiv.style.animation = 'slideOut 0.3s ease-out';
            setTimeout(() => {
                if (messageDiv.parentNode) {
                    messageDiv.parentNode.removeChild(messageDiv);
                }
            }, 300);
        }, 3000);
    }

    showAIContentModal() {
        if (!this.apiKey) {
            alert('OpenAI APIキーが設定されていません。設定から APIキーを入力してください。');
            this.showSettingsModal();
            return;
        }
        this.aiContentModal.style.display = 'block';
    }

    showAIEditModal() {
        if (!this.apiKey) {
            alert('OpenAI APIキーが設定されていません。設定から APIキーを入力してください。');
            this.showSettingsModal();
            return;
        }
        
        // 現在のエディタ内容を取得
        const currentContent = this.editor.value.trim();
        
        if (!currentContent) {
            alert('編集する内容がありません。まずテキストを入力してください。');
            return;
        }
        
        // コンテンツプレビューを更新（最初の200文字）
        const preview = currentContent.length > 200 ? 
            currentContent.substring(0, 200) + '...' : 
            currentContent;
        
        if (this.currentContentPreview) {
            this.currentContentPreview.textContent = preview;
        }
        
        // 前回の結果をクリア
        if (this.editResult) {
            this.editResult.innerHTML = '';
        }
        if (this.editActions) {
            this.editActions.style.display = 'none';
        }
        if (this.editInstruction) {
            this.editInstruction.value = '';
        }
        
        // 元の内容を保存
        this.originalContent = currentContent;
        
        this.aiEditModal.style.display = 'block';
    }

    async executeAIEdit() {
        const instruction = this.editInstruction.value.trim();
        
        if (!instruction) {
            alert('編集指示を入力してください。');
            return;
        }
        
        if (!this.originalContent) {
            alert('編集対象のコンテンツがありません。');
            return;
        }
        
        this.showLoading('AIが編集中...');
        
        try {
            console.log('AI編集開始:', {
                instruction: instruction,
                contentLength: this.originalContent.length
            });
            
            // OpenAI APIに送信するプロンプトを構築
            const systemPrompt = `あなたは文章編集のプロフェッショナルです。与えられた文章を指示に従って正確に編集してください。
            
重要な指示:
1. 元の内容の意味や重要な情報を失わないよう注意してください
2. マークダウン形式を保持してください
3. 編集結果のみを返してください（説明や追加コメントは不要）
4. 文章の構造や見出しの階層を適切に保持してください`;
            
            const userPrompt = `以下の文章を指示に従って編集してください:

【編集指示】
${instruction}

【編集対象の文章】
${this.originalContent}`;
            
            console.log('OpenAI APIリクエスト送信中...');
            
            const response = await fetch('https://api.openai.com/v1/chat/completions', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${this.apiKey}`
                },
                body: JSON.stringify({
                    model: 'gpt-4.1',
                    messages: [
                        { role: 'system', content: systemPrompt },
                        { role: 'user', content: userPrompt }
                    ],
                    max_tokens: 4000,
                    temperature: 0.3
                })
            });
            
            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(`API Error: ${errorData.error?.message || response.statusText}`);
            }
            
            const data = await response.json();
            console.log('OpenAI APIレスポンス受信:', data);
            
            if (!data.choices || !data.choices[0] || !data.choices[0].message) {
                throw new Error('APIレスポンスが無効です');
            }
            
            this.editedContent = data.choices[0].message.content.trim();
            
            console.log('編集完了:', {
                originalLength: this.originalContent.length,
                editedLength: this.editedContent.length
            });
            
            // 結果を表示
            this.displayEditResult();
            
        } catch (error) {
            console.error('AI編集エラー:', error);
            alert(`編集に失敗しました: ${error.message}`);
        } finally {
            this.hideLoading();
        }
    }
    
    displayEditResult() {
        if (!this.editResult) return;
        
        const showChanges = this.showChangesCheckbox ? this.showChangesCheckbox.checked : false;
        
        if (showChanges) {
            // 変更箇所をハイライト表示
            const diffHtml = this.createDiffView(this.originalContent, this.editedContent);
            this.editResult.innerHTML = `
                <h4>編集結果（変更箇所をハイライト）:</h4>
                <div class="edit-diff">${diffHtml}</div>
            `;
        } else {
            // 編集結果のみ表示
            this.editResult.innerHTML = `
                <h4>編集結果:</h4>
                <div class="edit-diff">${this.escapeHtml(this.editedContent)}</div>
            `;
        }
        
        // アクションボタンを表示
        if (this.editActions) {
            this.editActions.style.display = 'flex';
        }
    }
    
    createDiffView(original, edited) {
        // 簡単な差分表示（実際のdiffライブラリを使うとより良い）
        const originalLines = original.split('\n');
        const editedLines = edited.split('\n');
        
        // 簡単な行ベースの比較
        const maxLines = Math.max(originalLines.length, editedLines.length);
        let diffHtml = '';
        
        for (let i = 0; i < maxLines; i++) {
            const origLine = originalLines[i] || '';
            const editLine = editedLines[i] || '';
            
            if (origLine === editLine) {
                // 変更なし
                diffHtml += this.escapeHtml(editLine) + '\n';
            } else if (!origLine && editLine) {
                // 追加
                diffHtml += `<span class="diff-added">${this.escapeHtml(editLine)}</span>\n`;
            } else if (origLine && !editLine) {
                // 削除
                diffHtml += `<span class="diff-removed">${this.escapeHtml(origLine)}</span>\n`;
            } else {
                // 変更
                diffHtml += `<span class="diff-removed">${this.escapeHtml(origLine)}</span>\n`;
                diffHtml += `<span class="diff-added">${this.escapeHtml(editLine)}</span>\n`;
            }
        }
        
        return diffHtml;
    }
    
    applyEditedContent() {
        if (!this.editedContent) {
            alert('編集結果がありません。');
            return;
        }
        
        // エディタに編集結果を適用
        this.editor.value = this.editedContent;
        this.updatePreview();
        this.updateAutoTitle();
        this.markAsUnsaved();
        this.scheduleBackgroundSave();
        
        // モーダルを閉じる
        this.aiEditModal.style.display = 'none';
        
        // 成功メッセージ
        this.showSuccessMessage('AI編集を適用しました');
        
        console.log('AI編集が適用されました');
    }
    
    cancelEdit() {
        // 編集をキャンセルしてモーダルを閉じる
        this.aiEditModal.style.display = 'none';
        console.log('AI編集がキャンセルされました');
    }

    // === 統合AIアシスタント機能 ===
    
    handleTextSelection() {
        const selectedText = this.editor.value.substring(
            this.editor.selectionStart,
            this.editor.selectionEnd
        );
        
        if (selectedText.trim() && selectedText.length > 0) {
            this.currentSelection = {
                text: selectedText,
                start: this.editor.selectionStart,
                end: this.editor.selectionEnd
            };
            
            // 選択テキスト情報を表示
            if (this.selectedTextInfo && this.selectionPreview) {
                const preview = selectedText.length > 50 ? 
                    selectedText.substring(0, 50) + '...' : 
                    selectedText;
                this.selectionPreview.textContent = preview;
                this.selectedTextInfo.style.display = 'block';
            }
        } else {
            this.currentSelection = null;
            if (this.selectedTextInfo) {
                this.selectedTextInfo.style.display = 'none';
            }
        }
    }
    
    async sendAIInstruction() {
        const instruction = this.aiInstruction.value.trim();
        
        if (!instruction) {
            alert('指示を入力してください。');
            return;
        }
        
        if (!this.apiKey) {
            alert('OpenAI APIキーが設定されていません。');
            this.showSettingsModal();
            return;
        }
        
        if (this.isAiProcessing) {
            alert('AI処理中です。しばらくお待ちください。');
            return;
        }
        
        try {
            this.isAiProcessing = true;
            
            // ユーザーメッセージを履歴に追加
            this.addConversationMessage('user', instruction);
            
            // 指示を処理中表示
            this.showProcessingIndicator();
            
            // AI指示を実行
            const result = await this.processAIInstruction(instruction);
            
            // AI回答を履歴に追加
            this.addConversationMessage('ai', result.response);
            
            // 編集結果があれば直接適用（Undoで元に戻せるので安全）
            if (result.editedContent) {
                this.applyAIEdit(result.editedContent, result.editType);
            }
            
            // 入力をクリア
            this.aiInstruction.value = '';
            
        } catch (error) {
            console.error('AI指示処理エラー:', error);
            this.addConversationMessage('ai', `エラーが発生しました: ${error.message}`);
        } finally {
            this.isAiProcessing = false;
            this.hideProcessingIndicator();
        }
    }
    
    async processAIInstruction(instruction) {
        const targetContent = this.currentSelection ? 
            this.currentSelection.text : 
            this.editor.value;
            
        const isSelection = !!this.currentSelection;
        
        console.log('AI指示処理:', {
            instruction,
            isSelection,
            contentLength: targetContent.length
        });
        
        // プロンプトを構築（デフォルトで非破壊的編集）
        const systemPrompt = `あなたは高度な文書編集アシスタントです。ユーザーからの指示に従って、与えられたテキストを編集または分析してください。

指示のタイプに応じて適切に処理してください：
1. 編集指示の場合：編集結果のみを返す
2. 質問や分析の場合：回答を返す
3. 生成指示の場合：新しいコンテンツを生成

🛡️ 編集時の重要な原則（必ず守ってください）：
- 既存の内容を削除せず、追記・改善・拡張を優先してください
- 「削除して」「短くして」などの明確な指示がない限り、内容を削らないでください
- 元の構造や意味を保持し、マークダウン形式を維持してください
- 文章の改善は既存部分を改良し、必要に応じて新しい内容を追加してください
- 大幅な変更が必要な場合は、元の内容を残しつつ改善版を追加してください
- 編集の場合は結果のみ、質問の場合は回答のみを返してください`;

        const selectionInfo = isSelection ? `
【対象テキスト】（選択範囲）
${targetContent}` : `
【対象テキスト】（全体）
${targetContent}`;

        const userPrompt = `${selectionInfo}

【指示】
${instruction}`;

        const response = await fetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${this.apiKey}`
            },
            body: JSON.stringify({
                model: 'gpt-4.1',
                messages: [
                    { role: 'system', content: systemPrompt },
                    { role: 'user', content: userPrompt }
                ],
                max_tokens: 4000,
                temperature: 0.3
            })
        });
        
        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(`API Error: ${errorData.error?.message || response.statusText}`);
        }
        
        const data = await response.json();
        const aiResponse = data.choices[0].message.content.trim();
        
        // 編集結果かどうかを判定
        const isEditResponse = this.isEditInstruction(instruction);
        
        return {
            response: aiResponse,
            editedContent: isEditResponse ? aiResponse : null,
            editType: isSelection ? 'selection' : 'full'
        };
    }
    
    isEditInstruction(instruction) {
        const editKeywords = [
            '編集', '修正', '変更', '改善', '調整', '書き換え', '直し', 
            '入れ替え', '並べ替え', '追加', '削除', '短縮', '拡張',
            'て', 'して', 'ください', 'してほしい', 'に変更', '改行'
        ];
        
        return editKeywords.some(keyword => 
            instruction.toLowerCase().includes(keyword.toLowerCase())
        );
    }
    
    applyAIEdit(editedContent, editType, saveToHistory = true) {
        // 編集前の状態を履歴に保存
        if (saveToHistory) {
            this.saveToHistory('ai-edit', this.editor.value);
        }
        
        if (editType === 'selection' && this.currentSelection) {
            // 選択範囲を編集結果で置換
            const before = this.editor.value.substring(0, this.currentSelection.start);
            const after = this.editor.value.substring(this.currentSelection.end);
            this.editor.value = before + editedContent + after;
            
            // 選択をクリア
            this.currentSelection = null;
            if (this.selectedTextInfo) {
                this.selectedTextInfo.style.display = 'none';
            }
        } else {
            // 全体を置換
            this.editor.value = editedContent;
        }
        
        // エディタの状態を更新
        this.updatePreview();
        this.updateAutoTitle();
        this.markAsUnsaved();
        this.scheduleBackgroundSave();
        
        // 編集後の状態も履歴に保存
        if (saveToHistory) {
            this.saveToHistory('ai-result', this.editor.value);
        }
        
        this.showSuccessMessage('AI編集を適用しました');
    }
    
    
    toggleAIPanel() {
        this.aiPanelCollapsed = !this.aiPanelCollapsed;
        
        if (this.aiAssistantPanel) {
            if (this.aiPanelCollapsed) {
                this.aiAssistantPanel.classList.add('collapsed');
                this.toggleAiPanelBtn.textContent = '展開';
            } else {
                this.aiAssistantPanel.classList.remove('collapsed');
                this.toggleAiPanelBtn.textContent = '縮小';
            }
        }
    }
    
    addConversationMessage(type, content) {
        const timestamp = new Date().toLocaleTimeString('ja-JP', {
            hour: '2-digit',
            minute: '2-digit'
        });
        
        const message = {
            type,
            content,
            timestamp: Date.now(),
            timeString: timestamp
        };
        
        this.conversationMessages.push(message);
        this.renderConversationHistory();
    }
    
    renderConversationHistory() {
        if (!this.conversationHistory) return;
        
        // ウェルカムメッセージを保持
        const welcomeMessage = this.conversationHistory.querySelector('.welcome-message');
        
        // 履歴をクリア
        this.conversationHistory.innerHTML = '';
        
        // ウェルカムメッセージを最初に表示（メッセージがない場合のみ）
        if (this.conversationMessages.length === 0 && welcomeMessage) {
            this.conversationHistory.appendChild(welcomeMessage);
        }
        
        // 対話履歴を表示
        this.conversationMessages.forEach(message => {
            const messageDiv = document.createElement('div');
            messageDiv.className = `conversation-item ${message.type}`;
            
            messageDiv.innerHTML = `
                <div class="timestamp">${message.timeString}</div>
                <div class="content">${this.escapeHtml(message.content)}</div>
            `;
            
            this.conversationHistory.appendChild(messageDiv);
        });
        
        // 最新メッセージにスクロール
        this.conversationHistory.scrollTop = this.conversationHistory.scrollHeight;
    }
    
    showProcessingIndicator() {
        if (this.conversationHistory) {
            const indicator = document.createElement('div');
            indicator.className = 'processing-indicator';
            indicator.id = 'ai-processing-indicator';
            indicator.textContent = 'AI処理中...';
            this.conversationHistory.appendChild(indicator);
            this.conversationHistory.scrollTop = this.conversationHistory.scrollHeight;
        }
    }
    
    hideProcessingIndicator() {
        const indicator = document.getElementById('ai-processing-indicator');
        if (indicator) {
            indicator.remove();
        }
    }
    
    
    // === タブ切り替え機能 ===
    
    toggleTab() {
        // Toggle between editor and preview
        const newTab = this.currentActiveTab === 'editor' ? 'preview' : 'editor';
        this.switchTab(newTab);
    }
    
    switchTab(tabName) {
        console.log('Switching to tab:', tabName);
        
        // Update toggle button icon and title
        if (this.tabToggleBtn) {
            if (tabName === 'editor') {
                this.tabToggleBtn.textContent = '📝';
                this.tabToggleBtn.title = 'プレビューに切り替え (Ctrl+2)';
            } else {
                this.tabToggleBtn.textContent = '👁️';
                this.tabToggleBtn.title = 'エディターに切り替え (Ctrl+1)';
            }
        }
        
        // コンテンツの表示/非表示を切り替え
        const allContents = document.querySelectorAll('.tab-content');
        allContents.forEach(content => content.classList.remove('active'));
        
        const targetContent = tabName === 'editor' ? this.editorContent : this.previewContent;
        if (targetContent) {
            targetContent.classList.add('active');
        }
        
        this.currentActiveTab = tabName;
        
        // プレビュータブに切り替える時は最新のマークダウンを反映
        if (tabName === 'preview') {
            this.updatePreview();
        }
        
        // エディタタブに切り替える時はフォーカスを当てる
        if (tabName === 'editor' && this.editor) {
            setTimeout(() => {
                this.editor.focus();
            }, 100);
        }
        
        this.currentActiveTab = tabName;
        console.log('Tab switched to:', tabName);
    }
    
    // === クリップボードコピー機能 ===
    
    async copyMarkdownToClipboard() {
        try {
            const markdownContent = this.editor.value;
            
            if (!markdownContent.trim()) {
                this.showNotification('コピーするコンテンツがありません', 'warning');
                return;
            }
            
            // クリップボードにコピー
            await navigator.clipboard.writeText(markdownContent);
            
            // 成功の視覚的フィードバック
            this.showCopySuccess();
            
            console.log('Markdown copied to clipboard');
        } catch (error) {
            console.error('Failed to copy to clipboard:', error);
            
            // フォールバック: 従来の方法でコピー
            try {
                const textArea = document.createElement('textarea');
                textArea.value = this.editor.value;
                document.body.appendChild(textArea);
                textArea.select();
                document.execCommand('copy');
                document.body.removeChild(textArea);
                
                this.showCopySuccess();
            } catch (fallbackError) {
                console.error('Fallback copy also failed:', fallbackError);
                this.showNotification('クリップボードへのコピーに失敗しました', 'error');
            }
        }
    }
    
    showCopySuccess() {
        // ボタンの一時的な視覚的フィードバック
        if (this.copyMarkdownBtn) {
            const originalText = this.copyMarkdownBtn.textContent;
            const originalTitle = this.copyMarkdownBtn.title;
            
            this.copyMarkdownBtn.textContent = '✓';
            this.copyMarkdownBtn.title = 'コピー完了！';
            this.copyMarkdownBtn.style.background = '#4CAF50';
            this.copyMarkdownBtn.style.color = 'white';
            
            setTimeout(() => {
                this.copyMarkdownBtn.textContent = originalText;
                this.copyMarkdownBtn.title = originalTitle;
                this.copyMarkdownBtn.style.background = '';
                this.copyMarkdownBtn.style.color = '';
            }, 1000);
        }
        
        this.showNotification('マークダウンをクリップボードにコピーしました', 'success');
    }
    
    showNotification(message, type = 'info') {
        // 既存の通知があれば削除
        const existingNotification = document.querySelector('.copy-notification');
        if (existingNotification) {
            existingNotification.remove();
        }
        
        // 通知要素を作成
        const notification = document.createElement('div');
        notification.className = `copy-notification ${type}`;
        notification.textContent = message;
        
        // ページに追加
        document.body.appendChild(notification);
        
        // 自動で削除
        setTimeout(() => {
            if (notification.parentNode) {
                notification.remove();
            }
        }, 3000);
    }
    
    // === 履歴管理とUndo/Redo機能 ===
    
    saveToHistory(type, content) {
        // 現在の内容と同じ場合はスキップ
        if (this.editHistory.length > 0 && this.editHistory[this.editHistory.length - 1].content === content) {
            return;
        }
        
        // 現在の位置より後の履歴を削除（新しい分岐を作る）
        if (this.currentHistoryIndex < this.editHistory.length - 1) {
            this.editHistory = this.editHistory.slice(0, this.currentHistoryIndex + 1);
        }
        
        // 新しい履歴を追加
        const historyItem = {
            type: type,
            content: content,
            timestamp: Date.now(),
            timeString: new Date().toLocaleTimeString('ja-JP', {
                hour: '2-digit',
                minute: '2-digit',
                second: '2-digit'
            })
        };
        
        this.editHistory.push(historyItem);
        this.currentHistoryIndex = this.editHistory.length - 1;
        
        // 最大履歴数を超えた場合は古いものを削除
        if (this.editHistory.length > this.maxHistorySize) {
            this.editHistory.shift();
            this.currentHistoryIndex--;
        }
        
        this.updateHistoryButtons();
        console.log('[History] Saved:', type, 'Index:', this.currentHistoryIndex, 'Total:', this.editHistory.length);
    }
    
    undo() {
        if (this.currentHistoryIndex > 0) {
            this.currentHistoryIndex--;
            const historyItem = this.editHistory[this.currentHistoryIndex];
            
            this.editor.value = historyItem.content;
            this.updatePreview();
            this.updateAutoTitle();
            this.markAsUnsaved();
            
            this.updateHistoryButtons();
            this.showSuccessMessage(`元に戻しました (${historyItem.timeString})`);
            
            console.log('[History] Undo to index:', this.currentHistoryIndex);
        }
    }
    
    redo() {
        if (this.currentHistoryIndex < this.editHistory.length - 1) {
            this.currentHistoryIndex++;
            const historyItem = this.editHistory[this.currentHistoryIndex];
            
            this.editor.value = historyItem.content;
            this.updatePreview();
            this.updateAutoTitle();
            this.markAsUnsaved();
            
            this.updateHistoryButtons();
            this.showSuccessMessage(`やり直しました (${historyItem.timeString})`);
            
            console.log('[History] Redo to index:', this.currentHistoryIndex);
        }
    }
    
    updateHistoryButtons() {
        if (this.undoBtn) {
            this.undoBtn.disabled = this.currentHistoryIndex <= 0;
        }
        if (this.redoBtn) {
            this.redoBtn.disabled = this.currentHistoryIndex >= this.editHistory.length - 1;
        }
    }
    

    showAIImageModal() {
        if (!this.apiKey) {
            alert('OpenAI APIキーが設定されていません。設定から APIキーを入力してください。');
            this.showSettingsModal();
            return;
        }
        this.aiImageModal.style.display = 'block';
    }

    showSettingsModal() {
        this.apiKeyInput.value = this.apiKey || '';
        this.defaultDirectoryInput.value = this.defaultDirectory || '';
        this.imageDirectoryInput.value = this.imageDirectory || '';
        this.settingsModal.style.display = 'block';
    }

    async generateContent() {
        if (!this.apiKey) {
            alert('APIキーが設定されていません。');
            return;
        }

        const prompt = this.contentPrompt.value.trim();
        if (!prompt) {
            alert('プロンプトを入力してください。');
            return;
        }

        this.generatedContent.innerHTML = '<div class="loading">AI文章を生成中...</div>';
        this.insertContentBtn.style.display = 'none';

        try {
            const response = await fetch('https://api.openai.com/v1/chat/completions', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${this.apiKey}`
                },
                body: JSON.stringify({
                    model: 'gpt-4.1',
                    messages: [
                        {
                            role: 'system',
                            content: 'あなたは優秀なライターです。ユーザーの要求に応じて、Markdown形式で高品質な文章を生成してください。'
                        },
                        {
                            role: 'user',
                            content: prompt
                        }
                    ],
                    max_tokens: 1000,
                    temperature: 0.7
                })
            });

            const data = await response.json();
            
            if (data.error) {
                throw new Error(data.error.message);
            }

            const content = data.choices[0].message.content;
            this.generatedContent.innerHTML = `<pre>${content}</pre>`;
            this.insertContentBtn.style.display = 'block';
            
        } catch (error) {
            console.error('Error generating content:', error);
            this.generatedContent.innerHTML = `<p style="color: red;">エラー: ${error.message}</p>`;
        }
    }

    async generateImage() {
        if (!this.apiKey) {
            alert('APIキーが設定されていません。');
            return;
        }

        const prompt = this.imagePrompt.value.trim();
        if (!prompt) {
            alert('プロンプトを入力してください。');
            return;
        }

        this.generatedImage.innerHTML = '<div class="loading">AI画像を生成中...</div>';
        if (this.imageActions) {
            this.imageActions.style.display = 'none';
        }

        try {
            const response = await fetch('https://api.openai.com/v1/images/generations', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${this.apiKey}`
                },
                body: JSON.stringify({
                    model: 'dall-e-3',
                    prompt: prompt,
                    n: 1,
                    size: '1792x1024'
                })
            });

            const data = await response.json();
            
            if (data.error) {
                throw new Error(data.error.message);
            }

            const imageUrl = data.data[0].url;
            
            // 生成された画像情報を保持
            this.currentGeneratedImage = {
                url: imageUrl,
                prompt: prompt,
                timestamp: new Date().toISOString().replace(/[:.]/g, '-')
            };
            
            this.generatedImage.innerHTML = `<img src="${imageUrl}" alt="Generated image">`;
            if (this.imageActions) {
                this.imageActions.style.display = 'flex';
            }
            
        } catch (error) {
            console.error('Error generating image:', error);
            this.generatedImage.innerHTML = `<p style="color: red;">エラー: ${error.message}</p>`;
        }
    }

    insertGeneratedContent() {
        const content = this.generatedContent.querySelector('pre');
        if (content) {
            const cursorPos = this.editor.selectionStart;
            const textBefore = this.editor.value.substring(0, cursorPos);
            const textAfter = this.editor.value.substring(cursorPos);
            
            this.editor.value = textBefore + '\n\n' + content.textContent + '\n\n' + textAfter;
            this.updatePreview();
            this.markAsUnsaved();
            this.aiContentModal.style.display = 'none';
        }
    }

    async saveGeneratedImageManually() {
        if (!this.currentGeneratedImage) {
            this.showErrorMessage('保存する画像がありません');
            return;
        }
        
        if (!this.imageDirectory) {
            this.showErrorMessage('画像保存ディレクトリが設定されていません。設定からディレクトリを選択してください。');
            return;
        }
        
        try {
            this.showLoading('画像を保存中...');
            
            const response = await fetch(this.currentGeneratedImage.url);
            const blob = await response.blob();
            const reader = new FileReader();
            
            reader.onload = async () => {
                try {
                    const base64Data = reader.result.split(',')[1];
                    const filename = `ai-image-${this.currentGeneratedImage.timestamp}.png`;
                    
                    const savedPath = await ipcRenderer.invoke('save-image', base64Data, filename, this.imageDirectory, this.currentGeneratedImage.prompt);
                    
                    if (savedPath) {
                        this.showSuccessMessage('画像を保存しました');
                    } else {
                        this.showErrorMessage('画像の保存に失敗しました');
                    }
                } catch (error) {
                    console.error('Error in save process:', error);
                    this.showErrorMessage('画像の保存エラー: ' + error.message);
                } finally {
                    this.hideLoading();
                }
            };
            
            reader.readAsDataURL(blob);
        } catch (error) {
            this.hideLoading();
            console.error('Error saving generated image:', error);
            this.showErrorMessage('画像のダウンロードに失敗しました: ' + error.message);
        }
    }
    
    async openImageFolder() {
        if (!this.imageDirectory) {
            this.showErrorMessage('画像ディレクトリが設定されていません。設定からディレクトリを選択してください。');
            return;
        }
        
        try {
            await ipcRenderer.invoke('open-folder', this.imageDirectory);
        } catch (error) {
            console.error('Error opening image folder:', error);
            this.showErrorMessage('フォルダを開けませんでした: ' + error.message);
        }
    }
    
    // insertGeneratedImage関数は削除（使用しない）

    async saveSettings() {
        try {
            this.apiKey = this.apiKeyInput.value.trim();
            this.defaultDirectory = this.defaultDirectoryInput.value.trim();
            this.imageDirectory = this.imageDirectoryInput.value.trim();
            
            // 設定を保存
            await ipcRenderer.invoke('set-store', 'openai-api-key', this.apiKey);
            await ipcRenderer.invoke('set-store', 'defaultSaveDirectory', this.defaultDirectory);
            await ipcRenderer.invoke('set-store', 'imageDirectory', this.imageDirectory);
            
            this.settingsModal.style.display = 'none';
            this.showSuccessMessage('設定を保存しました');
            
            // デフォルトディレクトリが変更された場合は記事リストを更新
            if (this.sidebarOpen) {
                this.refreshArticles();
            }
        } catch (error) {
            console.error('Error saving settings:', error);
            this.showErrorMessage('設定の保存に失敗しました: ' + error.message);
        }
    }

    async loadSettings() {
        console.log('[loadSettings] Loading settings...');
        try {
            this.apiKey = await ipcRenderer.invoke('get-store', 'openai-api-key');
            this.defaultDirectory = await ipcRenderer.invoke('get-store', 'defaultSaveDirectory');
            this.imageDirectory = await ipcRenderer.invoke('get-store', 'imageDirectory');
            
            console.log('[loadSettings] Settings loaded:');
            console.log('  API Key:', this.apiKey ? '[SET]' : '[NOT SET]');
            console.log('  Default Directory:', this.defaultDirectory);
            console.log('  Image Directory:', this.imageDirectory);
            
            // デフォルトディレクトリが設定されている場合は自動的にサイドバーを開く
            if (this.defaultDirectory) {
                console.log('[loadSettings] Auto-opening sidebar with default directory');
                this.sidebarOpen = true;
                this.sidebar.classList.add('open');
                // 記事リストを非同期で読み込み（UIをブロックしないように）
                setTimeout(() => {
                    this.refreshArticles();
                }, 100);
            } else {
                console.warn('[loadSettings] No default directory set - saves will fail');
                this.showErrorMessage('保存ディレクトリが設定されていません。設定からディレクトリを選択してください。');
            }
        } catch (error) {
            console.error('[loadSettings] Error loading settings:', error);
        }
    }
    
    toggleSidebar() {
        console.log('toggleSidebar called, current state:', this.sidebarOpen);
        
        try {
            if (!this.sidebar) {
                console.error('toggleSidebar: sidebar element not found');
                return;
            }
            
            this.sidebarOpen = !this.sidebarOpen;
            console.log('New sidebar state:', this.sidebarOpen);
            
            if (this.sidebarOpen) {
                console.log('Opening sidebar, adding class');
                this.sidebar.classList.add('open');
                console.log('Sidebar classes:', this.sidebar.className);
                
                // サイドバーが開かれたときのみ記事を読み込み、エラー時も安全に処理
                if (this.defaultDirectory) {
                    console.log('Calling refreshArticles...');
                    // 非同期で実行してUIをブロックしない
                    setTimeout(() => {
                        this.refreshArticles().catch(error => {
                            console.error('Error refreshing articles:', error);
                        });
                    }, 100);
                } else {
                    console.log('No default directory set for sidebar');
                    if (this.articleList) {
                        this.articleList.innerHTML = '<div class="no-articles">デフォルトディレクトリが設定されていません</div>';
                    }
                }
            } else {
                console.log('Closing sidebar, removing class');
                this.sidebar.classList.remove('open');
            }
        } catch (error) {
            console.error('Error in toggleSidebar:', error);
        }
    }
    
    async selectDirectory() {
        try {
            const result = await ipcRenderer.invoke('select-directory');
            if (result) {
                this.defaultDirectoryInput.value = result;
            }
        } catch (error) {
            console.error('Error selecting directory:', error);
        }
    }
    
    async selectImageDirectory() {
        try {
            const result = await ipcRenderer.invoke('select-directory');
            if (result) {
                this.imageDirectoryInput.value = result;
            }
        } catch (error) {
            console.error('Error selecting image directory:', error);
        }
    }
    
    async refreshArticles() {
        console.log('[refreshArticles] Called');
        console.log('[refreshArticles] defaultDirectory:', this.defaultDirectory);
        
        // 安全性チェック
        if (!this.articleList) {
            console.error('[refreshArticles] articleList element not found');
            return;
        }
        
        if (!this.defaultDirectory) {
            console.log('[refreshArticles] No default directory set');
            this.articleList.innerHTML = '<div class="no-articles">デフォルトディレクトリが設定されていません</div>';
            return;
        }
        
        try {
            // 記事リストを更新中であることを示すために一時的な表示
            this.articleList.innerHTML = '<div class="loading">記事を読み込み中...</div>';
            
            console.log('[refreshArticles] Invoking get-articles for directory:', this.defaultDirectory);
            
            // タイムアウト付きでIPC呼び出しを実行
            const articlesPromise = ipcRenderer.invoke('get-articles', this.defaultDirectory);
            const timeoutPromise = new Promise((_, reject) => 
                setTimeout(() => reject(new Error('タイムアウト: 記事の読み込みに時間がかかりすぎています')), 10000)
            );
            
            const articles = await Promise.race([articlesPromise, timeoutPromise]);
            console.log('[refreshArticles] Articles received:', articles ? articles.length : 'null');
            
            // レスポンスの検証
            if (Array.isArray(articles)) {
                this.articles = articles;
                console.log('[refreshArticles] Setting articles array with length:', articles.length);
                
                // レンダリングを次のイベントループで実行して白画面を防ぐ
                await new Promise(resolve => {
                    setTimeout(() => {
                        try {
                            this.renderArticles(this.articles);
                            resolve();
                        } catch (renderError) {
                            console.error('[refreshArticles] Render error:', renderError);
                            this.articleList.innerHTML = '<div class="no-articles">記事の表示に失敗しました</div>';
                            resolve();
                        }
                    }, 50);
                });
            } else {
                console.warn('[refreshArticles] Invalid articles response:', articles);
                this.articles = [];
                this.articleList.innerHTML = '<div class="no-articles">記事が見つかりません</div>';
            }
        } catch (error) {
            console.error('[refreshArticles] Critical error:', error);
            this.articles = [];
            
            // エラー時も安全にフォールバック
            if (this.articleList) {
                this.articleList.innerHTML = `<div class="no-articles">記事の読み込みエラー: ${error.message}</div>`;
            }
        }
    }
    
    async searchArticles() {
        console.log('searchArticles called');
        const query = this.searchInput.value.trim();
        console.log('Search query:', query);
        
        if (!query) {
            console.log('Empty query, refreshing articles');
            this.refreshArticles();
            return;
        }
        
        if (!this.defaultDirectory) {
            console.log('No default directory for search');
            this.articleList.innerHTML = '<div class="no-articles">デフォルトディレクトリが設定されていません</div>';
            return;
        }
        
        // 検索中であることを示す
        this.articleList.innerHTML = '<div class="loading">検索中...</div>';
        
        try {
            console.log('Searching articles in:', this.defaultDirectory);
            const results = await ipcRenderer.invoke('search-articles', this.defaultDirectory, query);
            console.log('Search results:', results.length);
            this.renderArticles(results);
        } catch (error) {
            console.error('Error searching articles:', error);
            this.articleList.innerHTML = '<div class="no-articles">検索に失敗しました</div>';
        }
    }
    
    renderArticles(articles) {
        console.log('[renderArticles] Called with', articles ? articles.length : 0, 'articles');
        
        // 重要: articleListの存在を確認
        if (!this.articleList) {
            console.error('[renderArticles] articleList element not found - aborting render');
            return;
        }
        
        try {
            // 記事が空の場合の安全な処理
            if (!Array.isArray(articles) || articles.length === 0) {
                console.log('[renderArticles] No valid articles to render');
                this.articleList.innerHTML = '<div class="no-articles">記事が見つかりません</div>';
                return;
            }
            
            console.log('[renderArticles] Generating HTML for', articles.length, 'articles...');
            
            // レンダリング中は一時的なプレースホルダーを表示
            this.articleList.innerHTML = '<div class="loading">記事を表示中...</div>';
            
            // バッチ処理でレンダリングを段階的に実行（白画面防止）
            this.renderArticlesBatch(articles, 0);
            
        } catch (error) {
            console.error('[renderArticles] Critical rendering error:', error);
            // エラー時の安全なフォールバック
            try {
                this.articleList.innerHTML = '<div class="no-articles">記事の表示エラーが発生しました</div>';
            } catch (fallbackError) {
                console.error('[renderArticles] Even fallback failed:', fallbackError);
            }
        }
    }
    
    renderArticlesBatch(articles, startIndex, batchSize = 10) {
        try {
            if (!this.articleList || !Array.isArray(articles)) {
                console.error('[renderArticlesBatch] Invalid state or articles');
                return;
            }
            
            const endIndex = Math.min(startIndex + batchSize, articles.length);
            
            // 最初のバッチの場合はコンテナをクリア
            if (startIndex === 0) {
                this.articleList.innerHTML = '';
            }
            
            // DocumentFragmentを使用してパフォーマンスを改善
            const fragment = document.createDocumentFragment();
            
            for (let i = startIndex; i < endIndex; i++) {
                const article = articles[i];
                
                try {
                    if (!article || !article.path) {
                        console.warn(`[renderArticlesBatch] Invalid article at index ${i}:`, article);
                        continue;
                    }
                    
                    const modifiedDate = article.modified ? new Date(article.modified).toLocaleDateString('ja-JP') : '日付不明';
                    const isSelected = this.selectedArticle && this.selectedArticle.path === article.path;
                    
                    const articleDiv = document.createElement('div');
                    articleDiv.className = `article-item ${isSelected ? 'selected' : ''}`;
                    articleDiv.setAttribute('data-path', article.path);
                    
                    const title = this.escapeHtml(article.title || 'タイトルなし');
                    const preview = this.escapeHtml(article.preview || '');
                    const size = article.size ? Math.round(article.size / 1024) : 0;
                    
                    articleDiv.innerHTML = `
                        <div class="article-content">
                            <div class="article-title">${title}</div>
                            <div class="article-meta">${modifiedDate} • ${size}KB</div>
                            <div class="article-preview">${preview}</div>
                        </div>
                        <div class="article-actions">
                            <button class="delete-btn" data-path="${this.escapeHtml(article.path)}" title="削除">×</button>
                        </div>
                    `;
                    
                    // イベントリスナーを効率的に設定
                    const articleContent = articleDiv.querySelector('.article-content');
                    const deleteBtn = articleDiv.querySelector('.delete-btn');
                    
                    if (articleContent) {
                        articleContent.addEventListener('click', () => {
                            console.log('[renderArticlesBatch] Article content clicked:', article.path);
                            this.loadArticle(article.path);
                        });
                    }
                    
                    if (deleteBtn) {
                        deleteBtn.addEventListener('click', (e) => {
                            console.log('[renderArticlesBatch] Delete button clicked:', article.path);
                            e.stopPropagation();
                            this.confirmDeleteArticle(article.path);
                        });
                    }
                    
                    fragment.appendChild(articleDiv);
                } catch (articleError) {
                    console.error(`[renderArticlesBatch] Error processing article ${i}:`, articleError, article);
                }
            }
            
            // バッチをDOMに追加
            this.articleList.appendChild(fragment);
            
            // 残りのアイテムがある場合は次のバッチを処理
            if (endIndex < articles.length) {
                // 次のバッチを非同期で処理（UIをブロックしない）
                setTimeout(() => {
                    this.renderArticlesBatch(articles, endIndex, batchSize);
                }, 10);
            } else {
                console.log('[renderArticlesBatch] All articles rendered successfully');
            }
            
        } catch (error) {
            console.error('[renderArticlesBatch] Error in batch rendering:', error);
            if (this.articleList) {
                this.articleList.innerHTML = '<div class="no-articles">記事の表示でエラーが発生しました</div>';
            }
        }
    }
    
    escapeHtml(text) {
        if (!text) return '';
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
    
    async loadArticle(path) {
        console.log('loadArticle called with path:', path);
        this.showLoading('記事を読み込み中...');
        
        try {
            // 未保存の変更がある場合は保存する
            if (this.currentFile && this.unsavedChanges) {
                console.log('Flushing saves before loading new article');
                this.updateLoadingMessage('現在の変更を保存中...');
                await this.flushAllSaves();
            }
            
            this.updateLoadingMessage('記事を読み込み中...');
            console.log('Invoking load-article for:', path);
            const result = await ipcRenderer.invoke('load-article', path);
            console.log('Load result:', result ? 'SUCCESS' : 'FAILED');
            
            if (result) {
                console.log('Setting editor content and updating state');
                this.editor.value = result.content;
                this.currentFile = result.filePath;
                this.markAsSaved();
                this.updatePreview();
                
                // ファイル読み込み時は自動タイトルを更新
                this.updateAutoTitle();
                
                // Update selected article
                this.selectedArticle = this.articles.find(a => a.path === path);
                console.log('Selected article updated:', this.selectedArticle ? this.selectedArticle.title : 'none');
                this.renderArticles(this.articles);
                
                // 履歴をリセットして読み込んだ内容を保存
                this.editHistory = [];
                this.currentHistoryIndex = -1;
                this.saveToHistory('file-load', result.content);
                this.updateHistoryButtons();
                
                // エディタにフォーカスを当てる
                this.editor.focus();
                console.log('Article loaded successfully');
                
                // 成功メッセージを短時間表示
                this.showSuccessMessage('記事を読み込みました');
            } else {
                throw new Error('記事データの取得に失敗しました');
            }
        } catch (error) {
            console.error('Error loading article:', error);
            this.showErrorMessage('記事の読み込みに失敗しました: ' + error.message);
        } finally {
            this.hideLoading();
        }
    }
    
    scheduleBackgroundSave() {
        console.log('[scheduleBackgroundSave] Called, unsavedChanges:', this.unsavedChanges);
        
        // 既存のタイマーをキャンセル
        if (this.autoSaveTimer) {
            clearTimeout(this.autoSaveTimer);
        }
        
        // 2秒後にバックグラウンド保存
        this.autoSaveTimer = setTimeout(() => {
            console.log('[scheduleBackgroundSave] Timer fired, currentFile:', this.currentFile, 'unsavedChanges:', this.unsavedChanges);
            // 新規ファイルの場合も保存するように変更
            if (this.unsavedChanges) {
                this.backgroundSave();
            }
        }, 2000);
    }
    
    async backgroundSave() {
        console.log('[backgroundSave] Called');
        
        // デフォルトディレクトリチェック
        if (!this.defaultDirectory) {
            console.log('[backgroundSave] No default directory set');
            this.showErrorMessage('デフォルトディレクトリが設定されていません');
            return;
        }
        
        const currentContent = this.editor.value;
        const currentTitle = this.currentTitle || '記事';
        
        console.log('[backgroundSave] Content length:', currentContent.length, 'Title:', currentTitle);
        
        // 前回保存した内容と同じ場合はスキップ
        if (currentContent === this.lastSaveContent && currentTitle === this.lastSaveTitle) {
            console.log('[backgroundSave] Content unchanged, skipping save');
            return;
        }
        
        // 保存データをキューに追加
        const saveData = {
            content: currentContent,
            title: currentTitle,
            file: this.currentFile,
            timestamp: Date.now()
        };
        
        console.log('[backgroundSave] Adding to queue:', {
            title: saveData.title,
            contentLength: saveData.content.length,
            hasFile: !!saveData.file,
            queueLength: this.saveQueue.length
        });
        
        this.saveQueue.push(saveData);
        this.processSaveQueue();
    }
    
    async processSaveQueue() {
        console.log('[processSaveQueue] Called, isBackgroundSaving:', this.isBackgroundSaving, 'queueLength:', this.saveQueue.length);
        
        if (this.isBackgroundSaving || this.saveQueue.length === 0) {
            console.log('[processSaveQueue] Skipping - already saving or empty queue');
            return;
        }
        
        this.isBackgroundSaving = true;
        this.updateSaveIndicator('saving');
        
        try {
            // 最新の保存データを取得（古いデータは破棄）
            const latestSave = this.saveQueue[this.saveQueue.length - 1];
            this.saveQueue = []; // キューをクリア
            
            console.log('[processSaveQueue] Processing save:', {
                title: latestSave.title,
                contentLength: latestSave.content.length,
                file: latestSave.file,
                defaultDirectory: this.defaultDirectory
            });
            
            let result;
            
            if (!latestSave.file) {
                // 新規ファイル
                console.log('[processSaveQueue] Creating new file with title:', latestSave.title);
                result = await ipcRenderer.invoke('save-new-file', latestSave.content, latestSave.title);
                console.log('[processSaveQueue] New file result:', result);
                
                if (result) {
                    this.currentFile = result;
                    console.log('[processSaveQueue] New file created in background:', result);
                    this.showSuccessMessage('新しい記事を保存しました');
                } else {
                    console.error('[processSaveQueue] Failed to create new file');
                    this.showErrorMessage('新しい記事の保存に失敗しました');
                }
            } else {
                // 既存ファイルの更新
                console.log('[processSaveQueue] Updating existing file:', latestSave.file);
                result = await ipcRenderer.invoke('save-file', latestSave.content, latestSave.file);
                console.log('[processSaveQueue] Update result:', result);
            }
            
            if (result) {
                this.lastSaveContent = latestSave.content;
                this.lastSaveTitle = latestSave.title;
                this.markAsSaved();
                
                console.log('[processSaveQueue] Background save successful');
                
                // サイドバーが開いている場合は非同期で更新
                if (this.sidebarOpen) {
                    setTimeout(() => this.refreshArticles(), 100);
                }
            } else {
                console.error('[processSaveQueue] Background save failed - no result');
                this.showErrorMessage('保存に失敗しました');
            }
            
        } catch (error) {
            console.error('[processSaveQueue] Background save error:', error);
            this.showErrorMessage('保存エラー: ' + error.message);
        } finally {
            this.isBackgroundSaving = false;
            console.log('[processSaveQueue] Finished, isBackgroundSaving set to false');
            
            // キューに新しいデータがある圴合は再度処理
            if (this.saveQueue.length > 0) {
                console.log('[processSaveQueue] More items in queue, scheduling next process');
                setTimeout(() => this.processSaveQueue(), 100);
            } else {
                // すべての保存が完了
                console.log('[processSaveQueue] All saves completed');
                this.updateSaveIndicator(this.unsavedChanges ? 'unsaved' : 'saved');
            }
        }
    }
    
    async triggerImmediateSave() {
        // 即座保存（フォーカスが外れた時など）
        console.log('[triggerImmediateSave] Called');
        if (this.autoSaveTimer) {
            clearTimeout(this.autoSaveTimer);
        }
        
        await this.backgroundSave();
    }
    
    async flushAllSaves() {
        // すべての保存を強制的に実行（アプリ終了時など）
        console.log('Flushing all saves...');
        
        // タイマーをキャンセル
        if (this.autoSaveTimer) {
            clearTimeout(this.autoSaveTimer);
        }
        
        // 現在の内容をキューに追加
        if (this.unsavedChanges) {
            await this.backgroundSave();
        }
        
        // バックグラウンド保存が完了するまで待機
        const maxWait = 10000; // 10秒最大待機
        const startTime = Date.now();
        
        while ((this.isBackgroundSaving || this.saveQueue.length > 0) && (Date.now() - startTime < maxWait)) {
            await new Promise(resolve => setTimeout(resolve, 100));
        }
        
        console.log('All saves flushed');
    }
    
    // 古いautoSave関数は削除（backgroundSaveで置き換え）
    
    confirmDeleteArticle(path) {
        try {
            const article = this.articles.find(a => a.path === path);
            if (!article) {
                console.error('Article not found for deletion:', path);
                return;
            }
            
            const confirmed = confirm(`"「${article.title}」を削除しますか？\n\nこの操作は元に戻せません。`);
            
            if (confirmed) {
                this.deleteArticle(path);
            }
        } catch (error) {
            console.error('Error in confirmDeleteArticle:', error);
        }
    }
    
    async deleteArticle(path) {
        this.showLoading('記事を削除中...');
        
        try {
            // 現在編集中のファイルが削除対象の場合は新規モードに切り替え
            if (this.currentFile === path) {
                this.updateLoadingMessage('エディタをリセット中...');
                this.editor.value = '';
                this.currentFile = null;
                this.unsavedChanges = false;
                this.updatePreview();
                this.selectedArticle = null;
                
                // 削除後はタイトルをリセット
                this.currentTitle = this.generateAutoTitle();
                this.currentTitleSpan.textContent = this.currentTitle;
            }
            
            // ファイルを削除
            this.updateLoadingMessage('ファイルを削除中...');
            const deleteResult = await ipcRenderer.invoke('delete-file', path);
            
            if (!deleteResult) {
                throw new Error('ファイルの削除に失敗しました');
            }
            
            // 記事リストを更新
            this.updateLoadingMessage('記事リストを更新中...');
            await this.refreshArticles();
            
            this.showSuccessMessage('記事を削除しました');
            
        } catch (error) {
            console.error('Error deleting article:', error);
            this.showErrorMessage('削除エラー: ' + error.message);
        } finally {
            this.hideLoading();
        }
    }
}

// Initialize the app
document.addEventListener('DOMContentLoaded', () => {
    console.log('DOM content loaded, initializing MarkdownEditor...');
    try {
        window.markdownEditor = new MarkdownEditor();
        console.log('MarkdownEditor instance created successfully');
        
        // デバッグ用のグローバル関数を追加
        window.debugSidebar = () => {
            console.log('=== SIDEBAR DEBUG ===');
            console.log('sidebarOpen:', window.markdownEditor.sidebarOpen);
            console.log('defaultDirectory:', window.markdownEditor.defaultDirectory);
            console.log('articles count:', window.markdownEditor.articles.length);
            console.log('sidebar element:', window.markdownEditor.sidebar);
            console.log('sidebar classes:', window.markdownEditor.sidebar.className);
            console.log('articleList element:', window.markdownEditor.articleList);
            console.log('articleList innerHTML length:', window.markdownEditor.articleList.innerHTML.length);
        };
        
        window.testToggle = () => {
            console.log('Manual toggle test');
            window.markdownEditor.toggleSidebar();
        };
        
        window.testRefresh = () => {
            console.log('Manual refresh test');
            window.markdownEditor.refreshArticles();
        };
        
        window.testSave = () => {
            console.log('Manual save test');
            console.log('  defaultDirectory:', window.markdownEditor.defaultDirectory);
            console.log('  currentTitle:', window.markdownEditor.currentTitle);
            console.log('  currentFile:', window.markdownEditor.currentFile);
            console.log('  unsavedChanges:', window.markdownEditor.unsavedChanges);
            console.log('  isBackgroundSaving:', window.markdownEditor.isBackgroundSaving);
            console.log('  saveQueue length:', window.markdownEditor.saveQueue.length);
            window.markdownEditor.backgroundSave();
        };
        
        window.forceSave = () => {
            console.log('Force triggering save immediately');
            window.markdownEditor.triggerImmediateSave();
        };
        
        window.checkState = () => {
            console.log('=== EDITOR STATE ===');
            console.log('defaultDirectory:', window.markdownEditor.defaultDirectory);
            console.log('currentTitle:', window.markdownEditor.currentTitle);
            console.log('currentFile:', window.markdownEditor.currentFile);
            console.log('unsavedChanges:', window.markdownEditor.unsavedChanges);
            console.log('isBackgroundSaving:', window.markdownEditor.isBackgroundSaving);
            console.log('saveQueue:', window.markdownEditor.saveQueue);
            console.log('editor content length:', window.markdownEditor.editor.value.length);
        };
        
    } catch (error) {
        console.error('Failed to initialize MarkdownEditor:', error);
        alert('アプリケーションの初期化に失敗しました: ' + error.message);
    }
});