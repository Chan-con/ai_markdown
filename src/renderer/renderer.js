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
            'newArticleBtn': 'new-article-btn',
            'toggleSidebarBtn': 'toggle-sidebar-btn',
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
        this.resizeHandle = document.querySelector('.resize-handle');
        this.conversationHistory = document.getElementById('conversation-history');
        this.aiInstruction = document.getElementById('ai-instruction');
        this.sendAiInstructionBtn = document.getElementById('send-ai-instruction');
        this.selectedTextInfo = document.getElementById('selected-text-info');
        this.selectionPreview = document.getElementById('selection-preview');
        this.selectionClearBtn = document.getElementById('selection-clear-btn');
        this.webSearchIndicator = document.getElementById('web-search-indicator');
        this.ragSearchIndicator = document.getElementById('rag-search-indicator');
        
        // Slide menu elements
        this.slideMenu = document.getElementById('slide-menu');
        this.overlay = document.getElementById('overlay');
    // close-menu-btn はUIから削除。存在しない前提で進める。
    this.closeMenuBtn = null;
        this.newArticleLoading = document.getElementById('new-article-loading');
        
        console.log('Slide menu elements initialized:');
        console.log('slideMenu:', this.slideMenu);
        console.log('overlay:', this.overlay);
    // console.log('closeMenuBtn:', this.closeMenuBtn);
        console.log('newArticleLoading:', this.newArticleLoading);
        
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
        this.articleConversationHistory = {}; // 記事ごとのチャット履歴を保存
        this.currentSelection = null;
        this.isAiProcessing = false;
    this.conversationSessionId = 0; // セッションIDでレスポンス混入を防止
        
        // Delete confirmation modal elements
        this.deleteConfirmationModal = document.getElementById('delete-confirmation-modal');
        this.deleteModalClose = document.getElementById('delete-modal-close');
        this.deleteArticleTitle = document.getElementById('delete-article-title');
        this.deleteArticlePath = document.getElementById('delete-article-path');
        this.deleteCancelBtn = document.getElementById('delete-cancel-btn');
        this.deleteConfirmBtn = document.getElementById('delete-confirm-btn');
        this.currentDeletePath = null;
        
    // Debug: close menu button was removed from UI
        
        // 編集履歴管理用
        this.editHistory = [];
        this.currentHistoryIndex = -1;
        this.maxHistorySize = 50;
        
        // 外部リンクを外部ブラウザで開く設定
        this.setupExternalLinks();
        
        // チャット履歴の初期化
        this.initializeConversationHistory();
        
        console.log('All elements initialized successfully');
    }

    setupEventListeners() {
        // Editor events - 統合したinputイベントリスナー
        let typingTimer;
        this.editor.addEventListener('input', () => {
            console.log('[Editor] Input event triggered');
            
            // 即座に実行する処理
            this.updatePreview();
            this.updateAutoTitle();
            this.markAsUnsaved();
            this.scheduleBackgroundSave();
            
            // タイピング終了検出による履歴保存
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
        
        // AIアシスタントパネル内でのテキスト選択監視
        if (this.conversationHistory) {
            this.conversationHistory.addEventListener('mouseup', () => this.handleConversationSelection());
            this.conversationHistory.addEventListener('keyup', () => this.handleConversationSelection());
        }
        
        // AI Assistant Panel events
        if (this.sendAiInstructionBtn) {
            this.sendAiInstructionBtn.addEventListener('click', () => this.sendAIInstruction());
        }
        
        // 選択解除ボタン
        if (this.selectionClearBtn) {
            this.selectionClearBtn.addEventListener('click', () => this.clearSelection());
        }
        
        // AIパネルのリサイズ機能
        this.setupPanelResize();
        
        // スライドメニューのイベントリスナー
        this.setupSlideMenu();
        
        if (this.aiInstruction) {
            this.aiInstruction.addEventListener('keydown', (e) => {
                if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                    this.sendAIInstruction();
                }
            });
            
            // 入力内容変更時にボタン状態を更新
            this.aiInstruction.addEventListener('input', () => {
                this.updateAIButtonState();
            });
            
            // 初期状態でボタン状態を更新
            this.updateAIButtonState();
        }
        
        // Delete confirmation modal events
        this.setupDeleteConfirmationModal();
        
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
        this.newArticleBtn.addEventListener('click', async () => {
            try {
                this.showNewArticleLoading();
                await this.newFile();
                this.closeSlideMenu(); // 新規記事作成後にメニューを閉じる
            } catch (error) {
                console.error('Error creating new article:', error);
            } finally {
                this.hideNewArticleLoading();
            }
        });
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
            if (e.target === this.deleteConfirmationModal) {
                this.hideDeleteConfirmationModal();
            }
        });
    }

    updatePreview() {
        const markdown = this.editor.value;
        if (this.preview) {
            this.preview.innerHTML = marked(markdown);
        }
        
        // プレビュータブがアクティブな場合は、タブ切り替えを呼ばない（無限再帰を防ぐ）
        // プレビューの内容は既に更新されているので、タブの表示状態だけ確認
        if (this.currentActiveTab === 'preview') {
            // タブの表示状態だけ確認（switchTabは呼ばない）
            if (this.previewContent && !this.previewContent.classList.contains('active')) {
                this.previewContent.classList.add('active');
            }
            if (this.editorContent && this.editorContent.classList.contains('active')) {
                this.editorContent.classList.remove('active');
            }
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
            
            // 現在の記事に紐づくチャット履歴を保存してから、新規記事用にAIアシスタントを初期化
            if (this.currentFile) {
                try {
                    await this.saveConversationHistory(this.currentFile);
                } catch (e) {
                    console.warn('Failed to save conversation history before new file:', e);
                }
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
            
            // AIアシスタントの状態を新規記事用にリセット
            this.conversationMessages = [];
            this.renderConversationHistory();
            this.currentSelection = null;
            if (this.selectedTextInfo) {
                this.selectedTextInfo.style.display = 'none';
            }
            if (this.aiInstruction) {
                this.aiInstruction.value = '';
            }
            this.isAiProcessing = false;
            this.hideProcessingIndicator();
            this.hideWebSearchIndicator();
            this.updateAIButtonState();
            // 新しい会話セッションを開始
            this.conversationSessionId++;
            
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
                    model: 'gpt-5',
                    messages: [
                        { role: 'system', content: systemPrompt },
                        { role: 'user', content: userPrompt }
                    ],
                    max_completion_tokens: 4000
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
                end: this.editor.selectionEnd,
                source: 'editor'
            };
            
            // 選択テキスト情報を表示
            if (this.selectedTextInfo && this.selectionPreview) {
                const preview = selectedText.length > 50 ? 
                    selectedText.substring(0, 50) + '...' : 
                    selectedText;
                this.selectionPreview.textContent = preview;
                this.selectedTextInfo.style.display = 'block';
                
                // 選択元の表示を更新
                const selectionLabel = this.selectedTextInfo.querySelector('.selection-label');
                if (selectionLabel) {
                    selectionLabel.className = 'selection-label';
                }
            }
        } else {
            // エディターで選択がない場合、会話履歴での選択をクリアしない
            if (this.currentSelection && this.currentSelection.source === 'editor') {
                this.currentSelection = null;
                if (this.selectedTextInfo) {
                    this.selectedTextInfo.style.display = 'none';
                }
            }
        }
    }
    
    handleConversationSelection() {
        const selection = window.getSelection();
        const selectedText = selection.toString().trim();
        
        if (selectedText && selectedText.length > 0) {
            // 選択範囲がAIアシスタントパネル内かどうかを確認
            const range = selection.getRangeAt(0);
            const container = range.commonAncestorContainer;
            const conversationPanel = container.nodeType === Node.TEXT_NODE ? 
                container.parentElement : container;
            
            if (this.conversationHistory.contains(conversationPanel)) {
                this.currentSelection = {
                    text: selectedText,
                    source: 'conversation'
                };
                
                if (this.selectedTextInfo && this.selectionPreview) {
                    const preview = selectedText.length > 50 ? 
                        selectedText.substring(0, 50) + '...' : 
                        selectedText;
                    this.selectionPreview.textContent = preview;
                    this.selectedTextInfo.style.display = 'block';
                    
                    // 選択元の表示を更新
                    const selectionLabel = this.selectedTextInfo.querySelector('.selection-label');
                    if (selectionLabel) {
                        selectionLabel.className = 'selection-label conversation';
                    }
                }
            }
        } else {
            // 会話履歴で選択がない場合、エディターでの選択をクリアしない
            if (this.currentSelection && this.currentSelection.source === 'conversation') {
                this.currentSelection = null;
                if (this.selectedTextInfo) {
                    this.selectedTextInfo.style.display = 'none';
                }
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
            const requestSessionId = this.conversationSessionId;
            
            // 選択状態を保存（送信前に保存）
            const hadSelection = !!this.currentSelection;
            const selectionInfo = this.currentSelection ? {
                text: this.currentSelection.text,
                source: this.currentSelection.source
            } : null;
            
            // 送信ボタンを無効化し、入力をすぐにクリア
            this.updateAIButtonState();
            this.aiInstruction.value = '';
            
        // Web検索が必要か（ヒューリスティック）
        const heuristicWeb = this.needsWebSearch(instruction);
        
        // ユーザーメッセージを履歴に追加（選択中のテキストがある場合は引用情報も含める）
            let userMessage = instruction;
            if (selectionInfo && selectionInfo.text) {
                const selectedPreview = selectionInfo.text.length > 50 ? 
                    selectionInfo.text.substring(0, 50) + '...' : 
                    selectionInfo.text;
                const sourceLabel = selectionInfo.source === 'conversation' ? 'AI会話' : 'エディター';
                userMessage = `> **選択中 (${sourceLabel}):** ${selectedPreview}\n\n${instruction}`;
            }
            this.addConversationMessage('user', userMessage);
            
            // チャットログに追加した後に選択中表示を解除
            if (hadSelection) {
                console.log('チャットログ追加後に選択中表示を解除します');
                this.clearSelection();
            }
            
            // 指示を処理中表示
            this.showProcessingIndicator();
            
            // Web検索インジケーターは最終判定後（processAIInstruction内）で表示する
            
            // AI指示を実行
            const result = await this.processAIInstruction(instruction);
            // セッションが切り替わっていないか確認（新規記事や別記事に切り替えた場合は無視）
            if (requestSessionId !== this.conversationSessionId) {
                console.warn('Stale AI response ignored due to session switch');
                return;
            }
            
            // AI回答を履歴に追加（段階と検索情報を含む）
            let responseMessage = result.response;
            const instructionLevel = result.instructionLevel || this.getInstructionLevel(instruction);
            
            // 段階に応じたプレフィックスを追加
            const levelPrefix = instructionLevel === 1 ? '💭' : 
                               instructionLevel === 2 ? '💡' : '✏️';

            // 検索モードのアイコンを先頭に付ける（Web:🔍 / Local RAG:📚）
            let searchPrefix = '';
            if (result.needsWebSearch) searchPrefix += '🔍';
            if (result.needsLocalRag) searchPrefix += '📚';
            responseMessage = `${searchPrefix}${levelPrefix} ${responseMessage}`;
            this.addConversationMessage('ai', responseMessage);
            
            // 編集結果があれば直接適用（Undoで元に戻せるので安全）
            if (result.editedContent) {
                this.applyAIEdit(result.editedContent, result.editType);
            }
            
        } catch (error) {
            console.error('AI指示処理エラー:', error);
            this.addConversationMessage('ai', `エラーが発生しました: ${error.message}`);
        } finally {
            this.isAiProcessing = false;
            this.updateAIButtonState();
            this.hideProcessingIndicator();
            this.hideWebSearchIndicator();
        }
    }
    
    async processAIInstruction(instruction) {
        const targetContent = this.currentSelection ? 
            this.currentSelection.text : 
            this.editor.value;
            
        const isSelection = !!this.currentSelection;
        const selectionSource = this.currentSelection ? this.currentSelection.source : null;
        
        console.log('AI指示処理:', {
            instruction,
            isSelection,
            selectionSource,
            contentLength: targetContent.length
        });
        
        // ルーター主体で判定（キーワードは使わない）
        let needsWebSearch = false;
        let needsLocalRag = false;
        // AIルーターで最終判定（失敗時は両方false）
        try {
            const route = await this.decideRetrievalMode(instruction);
            if (route && typeof route.web === 'boolean' && typeof route.local === 'boolean') {
                console.log('[Router] decision:', route);
                needsWebSearch = route.web;
                needsLocalRag = route.local;
            } else {
                // ルーターが無効な場合のフォールバック：強いローカル意図ならRAG実施
                const txt = (instruction || '').toLowerCase();
                const fallbackLocal = this.hasStrongPastLocalIntent(txt);
                const explicitLatest = ['最新','ニュース','速報','今日','今週','今月','今年','現在','最新情報','最新動向','最新状況']
                    .some(w => txt.includes(w));
                needsLocalRag = !!fallbackLocal && !!this.defaultDirectory;
                needsWebSearch = explicitLatest && !fallbackLocal; // 最新性のみが主眼ならwebのみ
                console.log('[Router] fallback decision:', { local: needsLocalRag, web: needsWebSearch });
            }
        } catch (e) {
            console.warn('Retrieval router failed, applying heuristic fallback:', e);
            const txt = (instruction || '').toLowerCase();
            const fallbackLocal = this.hasStrongPastLocalIntent(txt);
            const explicitLatest = ['最新','ニュース','速報','今日','今週','今月','今年','現在','最新情報','最新動向','最新状況']
                .some(w => txt.includes(w));
            needsLocalRag = !!fallbackLocal && !!this.defaultDirectory;
            needsWebSearch = explicitLatest && !fallbackLocal;
            console.log('[Router] heuristic fallback decision:', { local: needsLocalRag, web: needsWebSearch });
        }
        
        // 追記指示かどうかを判定
        const isAppendInstruction = this.isAppendInstruction(instruction);
        
        // 指示の段階を判定
        const instructionLevel = this.getInstructionLevel(instruction);
        
        // 会話履歴をOpenAI API形式に変換
        const conversationHistory = this.buildConversationHistory();
        
    // プロンプトを構築（デフォルトで非破壊的編集）
    let systemPrompt = `あなたは段階的相談ベースの文書編集アシスタントです。ユーザーと一緒に記事・文書を作り上げていく共同作業者として振る舞ってください。

🤝 基本的な役割：
- ユーザーとの継続的な対話を通じて記事を改善・発展させる
- 過去の会話内容や調査結果を活用して一貫性のある提案を行う
- 記事の全体的な方向性や品質向上をサポートする

ユーザーの指示の明確さに応じて、以下の3段階で対応してください。

🔍 指示判定と対応方法：

【第1段階：相談・アドバイス】（明確な編集指示がない場合）
- 文書に関する質問、相談、方向性の検討
- アイデア提案、構成案の提示、改善提案
- 「〜についてどう思いますか？」「〜の方向性は？」「アイデアを教えて」など
→ 相談相手として丁寧にアドバイスのみを提供

【第2段階：確認付き提案】（編集意図があるが曖昧な場合）  
- 「〜を改善したい」「〜をもっと良くしたい」「〜について書きたい」など
- 編集意図は感じられるが、具体的な指示が不明確
→ 具体的な編集案を提示し「このように編集しましょうか？」と確認を求める

【第3段階：即座実行】（明確な編集指示がある場合）
- 「編集して」「書いて」「追記して」「削除して」「修正して」など明確な動詞
- 「〜に変更して」「〜を加えて」など具体的な指示
→ 指示通りに即座に編集結果を返す
⚠️ 第3段階では相槌や返事は一切不要！純粋な編集結果のみを返してください

🛡️ 編集時の重要な原則（第3段階時に適用）：
- 既存の内容を削除せず、追記・改善・拡張を優先してください
- 「削除して」「短くして」などの明確な指示がない限り、内容を削らないでください
- 元の構造や意味を保持し、マークダウン形式を維持してください
- 文章の改善は既存部分を改良し、必要に応じて新しい内容を追加してください
- 大幅な変更が必要な場合は、元の内容を残しつつ改善版を追加してください
- Web検索を使用した場合は、情報源を明記してください

⚠️ 出力形式の重要な注意事項：
- 【対象テキスト】【指示】【重要】などの内部フォーマット指示は絶対に出力に含めないでください
- プロンプトの構造や指示の枠組みは表示せず、純粋なコンテンツのみを返してください
- ユーザーに見せる必要のない技術的な指示や分類は一切出力しないでください
- 第3段階（編集指示）では「はい、わかりました」「承知いたしました」等の相槌・返事は絶対に含めないでください
- 編集結果は直接マークダウンエディタに反映されるため、編集内容のみを出力してください
 - 具体的なテンプレートや雛形（例：見出しだけが並ぶ骨組み、プレースホルダだらけの枠）は出力しないでください。内容のない枠はノイズになります。必要な場合のみ最小限の構造と実文で返してください。

📝 記事フォーマット規則（第3段階時に適用）：
- 1行目は必ず「# タイトル」で開始してください
- 内容は「## サブタイトル」でセクション分けしてください  
- 既存のH1タイトル（# タイトル）は絶対に変更・削除しないでください
- 既存のH2構造（## サブタイトル）も維持してください
- 追記時は適切なH2セクションに追加するか、新しいH2セクションを作成してください
- 新規作成時もこのフォーマットに従ってください`;

        // 段階情報を追加
        systemPrompt += `

🎯 現在の指示段階：第${instructionLevel}段階
${instructionLevel === 1 ? '→ 相談・アドバイスモード：質問に対して丁寧なアドバイスを提供' : 
  instructionLevel === 2 ? '→ 確認付き提案モード：具体的な編集案を提示し確認を求める' : 
  '→ 即座実行モード：指示通りに編集を実行'}`;

    systemPrompt += `

🚨 エラー処理ルール：
- 指示どおりに安全かつ正確な編集ができない場合は、必ず次のフォーマットで失敗理由を返してください。
[[AI_ERROR]]
code: <snake_caseで短く分類したコード（例: missing_selection, insufficient_context, forbidden_change）>
reason: <ユーザーに伝えるべき失敗理由。日本語で簡潔に記述する>
fix_suggestions:
- <ユーザーが再試行するために取るべき具体的な改善策>
- <必要に応じて複数の手順を列挙>
[[AI_ERROR_END]]

- 上記ブロック以外の形式でエラー理由を返さないでください。
- エラーブロックを返す場合は通常の編集結果や会話文を混在させないでください。
- 問題が解消された場合は通常どおり編集結果だけを返してください。`;

        if (isAppendInstruction) {
            systemPrompt += `

📝 追記専用モード：
- 既存の内容は一切変更せず、そのまま保持してください
- 既存コンテンツの最後に新しい内容を追加してください
- 必ず既存の内容 + 新しい内容の形で返してください
- 既存コンテンツを要約したり削除したりしないでください`;
        }

        // RAGで拾った関連抜粋を取得（埋め込み検索優先、失敗時はキーワード検索）
        let ragPassages = [];
        if (needsLocalRag && this.defaultDirectory) {
            this.showRagSearchIndicator();
            try {
                // 必要ならインデックスを自動生成/更新
                const buildRes = await ipcRenderer.invoke('kb-build-index', this.defaultDirectory, { maxFiles: 2000 });
                // 失敗した場合は即フォールバック
                if (!buildRes || buildRes.ok === false) {
                    throw new Error(buildRes?.error || 'kb-build-index failed');
                }
                ragPassages = await ipcRenderer.invoke('kb-search-embeddings', this.defaultDirectory, instruction, {
                    topK: 6,
                    maxCharsPerPassage: 500
                });
                if (!Array.isArray(ragPassages) || ragPassages.length === 0) {
                    throw new Error('embeddings search returned no results');
                }
            } catch (e1) {
                console.warn('埋め込み検索に失敗、キーワード検索にフォールバック:', e1);
                try {
                    ragPassages = await ipcRenderer.invoke('kb-search-passages', this.defaultDirectory, instruction, {
                        maxFiles: 300,
                        maxPassages: 6,
                        maxCharsPerPassage: 500,
                        includeFileMeta: true
                    });
                    // 0件なら広めのフォールバッククエリで再検索（Google検索関連を想定）
                    if (!Array.isArray(ragPassages) || ragPassages.length === 0) {
                        const fallbackQuery = 'Google 検索 SEO SERP Search Console 生成AI SGE AI Overview';
                        ragPassages = await ipcRenderer.invoke('kb-search-passages', this.defaultDirectory, fallbackQuery, {
                            maxFiles: 2000,
                            maxPassages: 6,
                            maxCharsPerPassage: 500,
                            includeFileMeta: true
                        });
                    }
                } catch (e2) {
                    console.warn('キーワード検索も失敗:', e2);
                }
            } finally {
                this.hideRagSearchIndicator();
            }
            console.log('[RAG] passages found:', Array.isArray(ragPassages) ? ragPassages.length : 0);
        }

        // RAGが必須の指示で抜粋が0件なら、汎用生成に進まない（明示メッセージを返す）
        if (needsLocalRag && (!Array.isArray(ragPassages) || ragPassages.length === 0)) {
            const msg = `過去記事の要約をご希望ですが、現在の保存ディレクトリ内から該当する内容を見つけられませんでした。\n\n確認してください:\n- 設定の保存ディレクトリに、対象の過去記事（Markdown）が置かれているか\n- サブフォルダも対象ですが、ファイル名や見出しに「Google 検索/SEO/SERP/Search Console」等の語が含まれていると見つかりやすくなります\n\nヒント: 指示文に具体語を足すと精度が上がります（例: 『Search Console 関連の過去記事を要約』）。`;
            return {
                response: msg,
                editedContent: null,
                editType: isSelection ? 'selection' : 'full',
                instructionLevel: instructionLevel,
                needsWebSearch: false,
                needsLocalRag: true
            };
        }

        const selectionInfo = isSelection ? `
【対象テキスト】（選択範囲）
${targetContent}` : `
【対象テキスト】（全体）
${targetContent}`;

        // RAG抜粋をプロンプトに付与（引用ブロック化）
        let ragBlock = '';
        if (Array.isArray(ragPassages) && ragPassages.length > 0) {
            const formatted = ragPassages.map((p, idx) => {
                const meta = [p.title, p.heading].filter(Boolean).join(' > ');
                const header = meta ? `【参考${idx + 1}：${meta}】` : `【参考${idx + 1}】`;
                // 出典ジャンプ用の行（path埋め込み）。AI回答内には出さずユーザー提示用に保持するため、会話ログに二重化で利用
                const source = p.path ? `（source:${p.path}）` : '';
                return `${header}${source}\n> ${p.text.replace(/\n/g, '\n> ')}`;
            }).join('\n\n');
            ragBlock = `\n\n【参考資料（ローカル記事から抽出）】\n${formatted}`;
        }

    let userPrompt = `${selectionInfo}${ragBlock}

【指示】
${instruction}`;

    // RAG資料がある場合は、その範囲での要約/整理を強調
    if (Array.isArray(ragPassages) && ragPassages.length > 0) {
        const sumHints = ['まとめ', '要約', '整理', '俯瞰', 'ダイジェスト', '総括', '一覧'];
        const lowerInst = instruction.toLowerCase();
        const wantsSum = sumHints.some(w => lowerInst.includes(w.toLowerCase()));
        if (wantsSum) {
        userPrompt += `

【重要】上の参考資料（ローカル記事から抽出）に基づいて要約・整理してください。外部の一般論や最新ニュースは混ぜないでください。根拠のない新情報の追加は禁止です。`;
        }
    }

        if (isAppendInstruction) {
            userPrompt += `

【重要】これは追記指示です。既存のコンテンツを削除・変更せず、そのまま保持して最後に新しい内容を追加してください。返答は「既存コンテンツ + 改行 + 新しい内容」の形式にしてください。`;
        }

        let response;
        
        if (needsWebSearch) {
            // Responses API with web search - 会話履歴を含む
            const inputMessages = [
                { role: 'system', content: systemPrompt },
                ...conversationHistory,
                { role: 'user', content: userPrompt }
            ];
            this.showWebSearchIndicator();
            try {
                response = await fetch('https://api.openai.com/v1/responses', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${this.apiKey}`
                    },
                    body: JSON.stringify({
                        model: 'gpt-5',
                        input: inputMessages,
                        tools: [{ type: 'web_search' }]
                    })
                });
            } finally {
                this.hideWebSearchIndicator();
            }
        } else {
            // Traditional chat completions API - 会話履歴を含む
            const messages = [
                { role: 'system', content: systemPrompt },
                ...conversationHistory,
                { role: 'user', content: userPrompt }
            ];
            
            response = await fetch('https://api.openai.com/v1/chat/completions', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${this.apiKey}`
                },
                body: JSON.stringify({
                    model: 'gpt-5',
                    messages: messages,
                    max_completion_tokens: 4000
                })
            });
        }
        
        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(`API Error: ${errorData.error?.message || response.statusText}`);
        }
        
        const data = await response.json();
        let aiResponse;
        
        if (needsWebSearch) {
            // Responses API format - extract content from output array
            console.log('Responses API data:', data);
            
            if (data.output && Array.isArray(data.output)) {
                // Find the message object in the output array
                const messageOutput = data.output.find(item => item.type === 'message');
                if (messageOutput && messageOutput.content && Array.isArray(messageOutput.content)) {
                    // Extract text from content array
                    const textContent = messageOutput.content.find(item => item.type === 'output_text');
                    if (textContent && textContent.text) {
                        aiResponse = textContent.text;
                    }
                }
            }
            
            // Fallback checks
            if (!aiResponse) {
                if (data.message?.content) {
                    aiResponse = data.message.content;
                } else if (data.response) {
                    aiResponse = data.response;
                } else if (data.choices && data.choices[0]?.message?.content) {
                    aiResponse = data.choices[0].message.content;
                } else if (data.content) {
                    aiResponse = data.content;
                } else if (typeof data === 'string') {
                    aiResponse = data;
                } else {
                    // Fallback: try to extract content from any available field
                    aiResponse = JSON.stringify(data, null, 2);
                    console.log('Unexpected Responses API format:', data);
                }
            }
            
            // Ensure we have a string response
            if (typeof aiResponse !== 'string') {
                aiResponse = String(aiResponse);
            }
        } else {
            // Chat completions format
            aiResponse = data.choices[0].message.content.trim();
        }
        
        // 内部指示の漏れを除去
        aiResponse = this.cleanInternalInstructions(aiResponse);

        const trimmedResponse = (aiResponse ?? '').trim();
        const aiError = this.parseAiErrorResponse(trimmedResponse);

        if (aiError) {
            const guidance = this.buildAiErrorGuidance(aiError, {
                instructionLevel,
                isSelection
            });
            this.showErrorMessage(aiError.toastMessage || 'AI編集エラーが発生しました。指示を確認してください。');
            return {
                response: guidance,
                editedContent: null,
                editType: isSelection ? 'selection' : 'full',
                instructionLevel,
                needsWebSearch,
                needsLocalRag
            };
        }

        aiResponse = this.stripAiErrorMarkers(trimmedResponse).trim();

        if (!aiResponse) {
            const explanation = `AIから編集結果を受け取れませんでした。

考えられる原因:
- 指示が曖昧または矛盾している
- 編集対象のテキストが不足している
- ネットワークやAPIの応答が一時的に不安定

対処案:
- 編集してほしい箇所を選択するか、編集範囲を明示してください
- 指示文を短く具体的に書き直してください
- 数秒待ってから再度「送信」してください。`;
            this.showErrorMessage('AIから編集内容を受け取れませんでした。指示を見直して再試行してください。');
            return {
                response: explanation,
                editedContent: null,
                editType: isSelection ? 'selection' : 'full',
                instructionLevel,
                needsWebSearch,
                needsLocalRag
            };
        }

        // 編集結果かどうかを判定（第3段階の場合のみ自動適用）
        const isEditResponse = (instructionLevel === 3) || isAppendInstruction;
        
        // 編集結果の場合は相槌や返事も除去
        if (isEditResponse) {
            aiResponse = this.removeConversationalResponses(aiResponse);
        }
        
        return {
            response: aiResponse,
            editedContent: isEditResponse ? aiResponse : null,
            editType: isSelection ? 'selection' : 'full',
            instructionLevel: instructionLevel,
            needsWebSearch,
            needsLocalRag
        };
    }

    // === AIベースのルーティング判定 ===
    async decideRetrievalMode(instruction) {
        try {
            if (!this.apiKey) return null;

            // 明示の否定/強制を優先
            const txt = (instruction || '').toLowerCase();
            const disableWeb = ['web検索なし','ウェブ検索なし','インターネット検索なし','ローカルのみ','ローカル記事のみ','ローカルだけ','オフライン','ragのみ','ragだけ','ローカル検索のみ']
                .some(k => txt.includes(k));
            if (disableWeb) {
                const forceLocal = ['ragのみ','ragだけ','ローカルのみ','ローカル記事のみ','ローカル検索のみ'].some(k => txt.includes(k));
                return { local: !!forceLocal, web: false };
            }

            // 強いローカル要約/振り返り意図を早期検出（例: 「過去記事をまとめて」「以前書いた記事の要約」など）
            const hasPastLocal = this.hasStrongPastLocalIntent(txt);
            const summarizeWords = ['まとめ', '要約', '整理', '振り返り', '一覧', 'アーカイブ', 'ダイジェスト', '総括', 'ハイライト'];
            const wantsSummary = summarizeWords.some(w => txt.includes(w));
            const explicitLatest = ['最新','ニュース','速報','今日','今週','今月','今年','現在','最新情報','最新動向','最新状況']
                .some(w => txt.includes(w));
            if (hasPastLocal && wantsSummary && !explicitLatest) {
                // ディレクトリ未設定なら local は実行不能なので無効化
                const canLocal = !!this.defaultDirectory;
                return { local: canLocal, web: false };
            }

            // プロンプト：JSONのみ返す
            const system = 'You are a retrieval router. Output ONLY strict JSON with keys "local" and "web" (booleans). No prose, no code fences.';
            const examples = [
                {
                    q: 'Googleの検索について書いてる過去記事をまとめてほしいです',
                    a: { local: true, web: false }
                },
                {
                    q: 'Google 検索の最新アップデートについて教えて',
                    a: { local: false, web: true }
                },
                {
                    q: '過去の記事を踏まえて、今年のGoogle検索のアップデートを整理して。必要なら最新情報も参照',
                    a: { local: true, web: true }
                },
                {
                    q: 'この文章を推敲して',
                    a: { local: false, web: false }
                }
            ];
            const user = `Instruction: ${instruction}\n\nDecide whether to use the user's local markdown articles (local) and/or web search (web).\nRules:\n- The presence of words like "検索" or "Google検索" DOES NOT imply web=true.\n- If the user asks to summarize/overview/organize past writings (e.g., 過去/以前 + 記事/ブログ + まとめ/要約/整理), set local=true and web=false unless latest/real-time info is explicitly requested.\n- If the user explicitly needs latest/real-time news, set web=true.\n- If both past writings and latest info are needed, set both true.\n- If neither source is needed (pure editing or brainstorming), set both false.\n\nExamples:\n${examples.map(e => `Q: ${e.q}\nA: ${JSON.stringify(e.a)}`).join('\n')}\n\nAnswer with JSON only.`;

            const response = await fetch('https://api.openai.com/v1/chat/completions', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${this.apiKey}`
                },
                body: JSON.stringify({
                    model: 'gpt-5',
                    messages: [
                        { role: 'system', content: system },
                        { role: 'user', content: user }
                    ],
                    max_completion_tokens: 100
                })
            });

            if (!response.ok) return null;
            const data = await response.json();
            const text = data?.choices?.[0]?.message?.content?.trim() || '';
            const json = this.parseRouterJson(text);
            if (json && typeof json.local === 'boolean' && typeof json.web === 'boolean') {
                // 実行可能性を後処理（保存ディレクトリ未設定ならlocalは無効化）
                if (!this.defaultDirectory) json.local = false;
                return json;
            }
            return null;
        } catch (e) {
            console.warn('decideRetrievalMode error:', e);
            return null;
        }
    }

    parseRouterJson(text) {
        try {
            let s = text.trim();
            // ```json ... ``` を除去
            s = s.replace(/^```json\s*/i, '').replace(/```$/i, '').trim();
            // 単一行に不要な前置きを含む場合の簡易抽出
            const match = s.match(/\{[\s\S]*\}/);
            if (match) s = match[0];
            return JSON.parse(s);
        } catch (_) {
            return null;
        }
    }

    // 質問/要約/検索系キーワードでローカルRAGを有効化
    needsLocalRag(instruction) {
        const ragKeywords = [
            'まとめ', '要約', '要点', '一覧', '振り返り', 'ダイジェスト', '俯瞰',
            '関連', '参照', 'どれ', 'どの', 'について', '質問', '教えて', '比較', '類似',
            '検索', '探して', '見つけて', 'ピックアップ', '抽出',
            'データ', '実績', '過去', '以前', '書いた', '記事', 'メモ', 'ノート'
        ];
        const text = (instruction || '').toLowerCase();
        return ragKeywords.some(k => text.includes(k.toLowerCase()));
    }
    
    needsWebSearch(instruction) {
        const webSearchKeywords = [
            '最新', '最新情報', '最新の', '今日', '今週', '今月', '今年', '現在',
            'ニュース', '最近', '近況', '最新動向', '最新状況', '今の状況',
            // '検索' は汎用すぎるため除外（誤検知を減らす）
            '調べて', '調査', '情報', '詳細', '詳しく',
            '最新版', '最新技術', '最新研究', '最新発表', '最新リリース',
            '今何時', '天気', '株価', '為替', '価格', '相場'
        ];
        // 明示的にWeb検索を無効にする否定キーワード（優先）
        const disableKeywords = [
            'web検索なし', 'ウェブ検索なし', 'インターネット検索なし',
            'ローカルのみ', 'ローカル記事のみ', 'ローカルだけ', 'オフライン',
            'ragのみ', 'ragだけ', 'ローカル検索のみ'
        ];

        const text = (instruction || '').toLowerCase();

        if (disableKeywords.some(k => text.includes(k))) {
            return false;
        }

        // 「過去の/以前の 記事/メモ/ノート から ～」は原則ローカル優先（最新系語が無ければWebはオフ）
        if (this.hasStrongPastLocalIntent(text)) {
            const explicitLatest = ['最新','今日','今週','今月','今年','現在','ニュース','最新情報','最新動向','最新状況'].some(k => text.includes(k));
            if (!explicitLatest) return false;
        }

        return webSearchKeywords.some(keyword => 
            text.includes(keyword.toLowerCase())
        );
    }

    // 過去コンテンツを明示する強い意図検出
    hasStrongPastLocalIntent(text) {
        const pastWords = ['過去', '以前', 'これまで', 'アーカイブ', '過去の記事', '書いてる', '書いた'];
        const corpusWords = ['記事', 'メモ', 'ノート', 'ブログ', 'ポスト'];
        const t = (text || '').toLowerCase();
        const hasPast = pastWords.some(k => t.includes(k));
        const hasCorpus = corpusWords.some(k => t.includes(k));
        return hasPast && hasCorpus;
    }
    
    isAppendInstruction(instruction) {
        const appendKeywords = [
            '追記', '追加', '付け足し', '付け加え', '末尾に', '最後に',
            'まとめて追記', '軽くまとめて追記', 'まとめを追加', '要約を追加',
            '補足', '加筆', '追補', '後に追加', '文末に', '終わりに'
        ];
        
        return appendKeywords.some(keyword => 
            instruction.toLowerCase().includes(keyword.toLowerCase())
        );
    }

    stripAiErrorMarkers(text) {
        if (!text) return '';
        return text.replace(/\[\[AI_ERROR\]\][\s\S]*?\[\[AI_ERROR_END\]\]/g, '').trim();
    }

    parseAiErrorResponse(text) {
        if (!text) return null;

        const startMarker = '[[AI_ERROR]]';
        const endMarker = '[[AI_ERROR_END]]';
        const startIndex = text.indexOf(startMarker);
        const endIndex = text.indexOf(endMarker);

        if (startIndex === -1 || endIndex === -1 || endIndex <= startIndex) {
            return null;
        }

        const block = text.slice(startIndex + startMarker.length, endIndex).trim();
        const cleanedResponse = this.stripAiErrorMarkers(text);

        const lines = block.split('\n').map(line => line.trim()).filter(Boolean);
        let code = null;
        let reason = null;
        const suggestions = [];
        let collectingSuggestions = false;

        lines.forEach(line => {
            if (!collectingSuggestions && /^code\s*:/i.test(line)) {
                code = line.split(':').slice(1).join(':').trim() || null;
                return;
            }
            if (!collectingSuggestions && /^reason\s*:/i.test(line)) {
                reason = line.split(':').slice(1).join(':').trim() || null;
                return;
            }
            if (/^fix_suggestions\s*:/i.test(line)) {
                collectingSuggestions = true;
                const afterColon = line.split(':').slice(1).join(':').trim();
                if (afterColon) {
                    const sanitized = afterColon.replace(/^-\s*/, '').trim();
                    if (sanitized) suggestions.push(sanitized);
                }
                return;
            }
            if (collectingSuggestions) {
                const sanitized = line.replace(/^-\s*/, '').trim();
                if (sanitized) suggestions.push(sanitized);
            }
        });

        const toastMessage = reason ? `AI編集エラー: ${reason}` : 'AI編集エラーが発生しました。';

        return {
            code,
            reason,
            suggestions,
            toastMessage,
            cleanedResponse
        };
    }

    buildAiErrorGuidance(errorInfo, context = {}) {
        const { isSelection } = context;
        const suggestions = Array.isArray(errorInfo.suggestions) ? [...errorInfo.suggestions] : [];

        if (isSelection && !suggestions.some(s => s.includes('選択'))) {
            suggestions.push('編集対象のテキストを選択した状態で再実行してください。');
        }

        if (!suggestions.length) {
            suggestions.push('指示文をより具体的に書き直し、必要な文脈や目的を明記してください。');
        }

        const lines = ['AIによる自動編集を完了できませんでした。'];

        if (errorInfo.reason) {
            lines.push('', `理由: ${errorInfo.reason}`);
        }

        if (errorInfo.code) {
            lines.push('', `エラーコード: ${errorInfo.code}`);
        }

        lines.push('', '次に試すこと:');

        suggestions.forEach(item => {
            lines.push(`- ${item}`);
        });

        lines.push('', '修正後に再度「送信」してください。');

        return lines.join('\n');
    }
    
    cleanInternalInstructions(text) {
        // 内部指示文を除去
        const internalPatterns = [
            /【対象テキスト】[^】]*】?/g,
            /【指示】[^】]*】?/g,
            /【重要】[^】]*】?/g,
            /【対象テキスト】（[^）]*）[^\n]*/g,
            /【指示】\s*\n?/g,
            /【重要】[^】\n]*\n?/g,
            /^【.*】.*\n?/gm  // 行頭の【】形式を除去
        ];
        
        let cleanedText = text;
        internalPatterns.forEach(pattern => {
            cleanedText = cleanedText.replace(pattern, '');
        });
        
        // 連続する空行を整理
        cleanedText = cleanedText.replace(/\n\s*\n\s*\n/g, '\n\n');
        
        // 先頭と末尾の空行を除去
        cleanedText = cleanedText.trim();
        
        return cleanedText;
    }
    
    // 編集時の相槌や返事を除去
    removeConversationalResponses(text) {
        // 相槌や返事のパターン
        const conversationalPatterns = [
            /^はい[、，]*\s*わかりました[！!。．]*\s*/i,
            /^承知[いし]たしました[！!。．]*\s*/i,
            /^了解[いし]たしました[！!。．]*\s*/i,
            /^わかりました[！!。．]*\s*/i,
            /^はい[！!。．]*\s*/i,
            /^かしこまりました[！!。．]*\s*/i,
            /^承知[！!。．]*\s*/i,
            /^分かりました[！!。．]*\s*/i,
            /^理解しました[！!。．]*\s*/i,
            /^以下[にの].*編集[いし]たします[。．]*\s*/i,
            /^記事を.*編集[いし]ます[。．]*\s*/i,
            /^では[、，]*.*編集[いし]ます[。．]*\s*/i,
            /^それでは[、，]*.*編集[いし]ます[。．]*\s*/i
        ];
        
        let cleanedText = text;
        
        // 各パターンで行頭から相槌を除去
        conversationalPatterns.forEach(pattern => {
            cleanedText = cleanedText.replace(pattern, '');
        });
        
        // 行頭の不要な改行を除去
        cleanedText = cleanedText.replace(/^\s*\n+/, '');
        
        return cleanedText.trim();
    }
    
    // AI送信ボタンの状態を更新
    updateAIButtonState() {
        if (!this.sendAiInstructionBtn) return;
        
        const instruction = this.aiInstruction?.value?.trim() || '';
        const isProcessing = this.isAiProcessing;
        
        // 処理中または入力が空の場合は無効化
        const shouldDisable = isProcessing || !instruction;
        
        this.sendAiInstructionBtn.disabled = shouldDisable;
        
        if (isProcessing) {
            this.sendAiInstructionBtn.textContent = '処理中...';
            this.sendAiInstructionBtn.classList.add('processing');
        } else {
            this.sendAiInstructionBtn.textContent = '送信';
            this.sendAiInstructionBtn.classList.remove('processing');
        }
    }
    
    // スライドメニューの設定
    setupSlideMenu() {
        console.log('setupSlideMenu called');
        console.log('toggleSidebarBtn:', this.toggleSidebarBtn);
        console.log('closeMenuBtn:', this.closeMenuBtn);
        console.log('overlay:', this.overlay);
        console.log('slideMenu:', this.slideMenu);
        
        // ハンバーガーメニューボタンのクリック
        if (this.toggleSidebarBtn) {
            this.toggleSidebarBtn.addEventListener('click', () => {
                console.log('Toggle sidebar button clicked');
                this.openSlideMenu();
            });
        }
        
        // メニューを閉じるボタンのクリック - より確実な実装
        // 閉じるボタンは撤去済みのため、イベント登録は行わない
        
        // オーバーレイのクリック
        if (this.overlay) {
            this.overlay.addEventListener('click', () => {
                this.closeSlideMenu();
            });
        }
        
        // ESCキーでメニューを閉じる
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && this.slideMenu && this.slideMenu.classList.contains('active')) {
                this.closeSlideMenu();
            }
        });
    }
    
    // スライドメニューを開く
    openSlideMenu() {
        if (this.slideMenu && this.overlay) {
            this.slideMenu.classList.add('active');
            this.overlay.classList.add('active');
            document.body.style.overflow = 'hidden'; // スクロールを無効化
        }
    }
    
    // スライドメニューを閉じる
    closeSlideMenu() {
        console.log('closeSlideMenu called');
        console.log('slideMenu:', this.slideMenu);
        console.log('overlay:', this.overlay);
        if (this.slideMenu && this.overlay) {
            console.log('Closing slide menu');
            this.slideMenu.classList.remove('active');
            this.overlay.classList.remove('active');
            document.body.style.overflow = ''; // スクロールを有効化
            this.sidebarOpen = false; // 状態を同期
        } else {
            console.error('slideMenu or overlay not found!');
        }
    }
    
    // 新規記事ローディング表示
    showNewArticleLoading() {
        if (this.newArticleLoading) {
            this.newArticleLoading.style.display = 'flex';
        }
        if (this.newArticleBtn) {
            this.newArticleBtn.disabled = true;
            this.newArticleBtn.style.opacity = '0.7';
        }
    }
    
    // 新規記事ローディング非表示
    hideNewArticleLoading() {
        if (this.newArticleLoading) {
            this.newArticleLoading.style.display = 'none';
        }
        if (this.newArticleBtn) {
            this.newArticleBtn.disabled = false;
            this.newArticleBtn.style.opacity = '1';
        }
    }
    
    // AIパネルのリサイズ機能を設定
    setupPanelResize() {
        if (!this.resizeHandle || !this.aiAssistantPanel) return;
        
        let isResizing = false;
        let startX = 0;
        let startWidth = 0;
        
        const handleMouseDown = (e) => {
            isResizing = true;
            startX = e.clientX;
            startWidth = this.aiAssistantPanel.offsetWidth;
            
            document.addEventListener('mousemove', handleMouseMove);
            document.addEventListener('mouseup', handleMouseUp);
            document.body.style.userSelect = 'none';
            document.body.style.cursor = 'ew-resize';
            
            e.preventDefault();
        };
        
        const handleMouseMove = (e) => {
            if (!isResizing) return;
            
            const deltaX = startX - e.clientX; // 左にドラッグすると拡大
            const newWidth = startWidth + deltaX;
            
            // 最小幅と最大幅の制限
            const minWidth = 250;
            const maxWidth = 800;
            const constrainedWidth = Math.max(minWidth, Math.min(maxWidth, newWidth));
            
            this.aiAssistantPanel.style.flexBasis = `${constrainedWidth}px`;
            
            e.preventDefault();
        };
        
        const handleMouseUp = () => {
            isResizing = false;
            document.removeEventListener('mousemove', handleMouseMove);
            document.removeEventListener('mouseup', handleMouseUp);
            document.body.style.userSelect = '';
            document.body.style.cursor = '';
        };
        
        this.resizeHandle.addEventListener('mousedown', handleMouseDown);
    }
    
    // 会話履歴をOpenAI API形式に変換（トークン管理付き）
    buildConversationHistory() {
        const messages = [];
        
        // 会話履歴の長さ制限（最大20件、またはトークン数制限）
        const maxMessages = 20;
        const maxHistoryTokens = 8000; // システムプロンプトとユーザープロンプト用にトークンを確保
        
        // 最近のメッセージから逆順で処理
        const recentMessages = this.conversationMessages.slice(-maxMessages);
        let totalTokens = 0;
        
        // 文字数による簡易トークン推定（日本語：1文字≈1.5トークン、英語：1文字≈0.25トークン）
        const estimateTokens = (text) => {
            const japaneseChars = (text.match(/[\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FAF]/g) || []).length;
            const otherChars = text.length - japaneseChars;
            return Math.ceil(japaneseChars * 1.5 + otherChars * 0.25);
        };
        
        for (const msg of recentMessages) {
            // AIメッセージから段階アイコンを除去して純粋な内容のみ取得
            let content = msg.content;
            if (msg.type === 'ai') {
                // 段階アイコン（💭💡✏️）とWeb検索アイコン（🔍）を除去
                content = content.replace(/^[🔍💭💡✏️\s]+/, '').trim();
            }
            
            const tokenCount = estimateTokens(content);
            
            // トークン制限を超える場合は古いメッセージを除外
            if (totalTokens + tokenCount > maxHistoryTokens) {
                break;
            }
            
            messages.unshift({
                role: msg.type === 'ai' ? 'assistant' : 'user',
                content: content
            });
            
            totalTokens += tokenCount;
        }
        
        console.log(`会話履歴: ${messages.length}件のメッセージ（推定${totalTokens}トークン）`);
        return messages;
    }
    
    // 3段階の指示判定
    getInstructionLevel(instruction) {
        // 第3段階：明確な編集指示
        const explicitEditKeywords = [
            '編集して', '修正して', '変更して', '書いて', '追記して', '削除して',
            '改善して', '調整して', '書き換えて', '直して', '生成して', '作成して',
            'に変更して', 'を加えて', 'を削除', 'に修正', 'を書き直し', 'を改良',
            'してください', 'してほしい', 'に書き換え', 'を短く', 'を拡張',
            '作って', '入れて', '足して', '消して'
        ];
        
        if (explicitEditKeywords.some(keyword => 
            instruction.toLowerCase().includes(keyword.toLowerCase())
        )) {
            return 3; // 即座実行
        }
        
        // 第2段階：編集意図があるが曖昧
        const ambiguousEditKeywords = [
            '改善したい', 'よくしたい', '良くしたい', 'について書きたい',
            'を書きたい', 'について考えたい', 'にしたい', 'できたらいい',
            '変えたい', '直したい', '修正したい', '追加したい', '削りたい',
            'もっと', 'さらに', 'より良い', 'ブラッシュアップ'
        ];
        
        if (ambiguousEditKeywords.some(keyword => 
            instruction.toLowerCase().includes(keyword.toLowerCase())
        )) {
            return 2; // 確認付き提案
        }
        
        // 第1段階：相談・質問
        return 1; // 相談・アドバイス
    }
    
    isEditInstruction(instruction) {
        return this.getInstructionLevel(instruction) === 3;
    }
    
    applyAIEdit(editedContent, editType, saveToHistory = true) {
        // 会話履歴からの選択の場合は編集を適用しない
        if (this.currentSelection && this.currentSelection.source === 'conversation') {
            console.log('会話履歴からの選択のため、編集を適用しません');
            return;
        }
        
        // 編集前の状態を履歴に保存
        if (saveToHistory) {
            this.saveToHistory('ai-edit', this.editor.value);
        }
        
        if (editType === 'selection' && this.currentSelection && this.currentSelection.source === 'editor') {
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
        
        // 記事ごとのチャット履歴を保存
        this.saveConversationHistory();
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
        this.conversationMessages.forEach((message, index) => {
            const messageDiv = document.createElement('div');
            messageDiv.className = `conversation-item ${message.type}`;

            // 参考資料のsource:pathをクリック可能化
            const html = marked(message.content);
            const enhanced = html.replace(/（source:([^\)]+)）/g, (m, p1) => {
                const safe = this.escapeHtml(p1);
                return `（<a href="#" class="kb-source-link" data-path="${safe}">出典へジャンプ</a>）`;
            });

            messageDiv.innerHTML = `
                <div class="timestamp">${message.timeString}</div>
                <div class="content">${enhanced}</div>
            `;
            
            this.conversationHistory.appendChild(messageDiv);
        });
        
        // 最新メッセージにスクロール
        this.conversationHistory.scrollTop = this.conversationHistory.scrollHeight;

        // ソースリンクのクリックで記事を開く
        const links = this.conversationHistory.querySelectorAll('.kb-source-link');
        links.forEach(a => {
            a.addEventListener('click', (e) => {
                e.preventDefault();
                const p = a.getAttribute('data-path');
                if (p) {
                    this.loadArticle(p);
                }
            });
        });
    }
    
    // 記事ごとのチャット履歴を保存
    async saveConversationHistory(filePath = null) {
        const path = filePath || this.currentFile;
        if (!path) return;
        
        this.articleConversationHistory[path] = [...this.conversationMessages];
        
        // Electron-storeに保存
        try {
            await ipcRenderer.invoke('set-store', 'articleConversationHistory', this.articleConversationHistory);
            console.log('Chat history saved for article:', path);
        } catch (error) {
            console.error('Error saving chat history:', error);
        }
    }
    
    // 記事ごとのチャット履歴を読み込み
    async loadConversationHistory(filePath = null) {
        const path = filePath || this.currentFile;
        if (!path) return;
        
        try {
            // Electron-storeから読み込み
            const allHistory = await ipcRenderer.invoke('get-store', 'articleConversationHistory') || {};
            this.articleConversationHistory = allHistory;
            
            // 該当記事の履歴を設定
            this.conversationMessages = this.articleConversationHistory[path] || [];
            this.renderConversationHistory();
            
            console.log('Chat history loaded for article:', path, 'Messages:', this.conversationMessages.length);
        } catch (error) {
            console.error('Error loading chat history:', error);
            this.conversationMessages = [];
        }
    }
    
    // 記事削除時のチャット履歴削除
    async deleteConversationHistory(filePath) {
        if (!filePath) return;
        
        try {
            delete this.articleConversationHistory[filePath];
            await ipcRenderer.invoke('set-store', 'articleConversationHistory', this.articleConversationHistory);
            console.log('Chat history deleted for article:', filePath);
        } catch (error) {
            console.error('Error deleting chat history:', error);
        }
    }
    
    // チャット履歴の初期化
    async initializeConversationHistory() {
        try {
            const allHistory = await ipcRenderer.invoke('get-store', 'articleConversationHistory') || {};
            this.articleConversationHistory = allHistory;
            console.log('Chat history initialized:', Object.keys(this.articleConversationHistory).length, 'articles');
        } catch (error) {
            console.error('Error initializing chat history:', error);
            this.articleConversationHistory = {};
        }
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
    
    showWebSearchIndicator() {
        const indicator = document.getElementById('web-search-indicator');
        if (indicator) {
            indicator.style.display = 'flex';
        }
    }
    
    hideWebSearchIndicator() {
        const indicator = document.getElementById('web-search-indicator');
        if (indicator) {
            indicator.style.display = 'none';
        }
    }

    showRagSearchIndicator() {
        const indicator = document.getElementById('rag-search-indicator');
        if (indicator) {
            indicator.style.display = 'flex';
            // フリッカー防止のため、最小表示時間を確保
            this._ragIndicatorShownAt = Date.now();
        }
    }

    hideRagSearchIndicator() {
        const indicator = document.getElementById('rag-search-indicator');
        if (indicator) {
            const minVisibleMs = 600;
            const elapsed = this._ragIndicatorShownAt ? (Date.now() - this._ragIndicatorShownAt) : minVisibleMs;
            const delay = Math.max(0, minVisibleMs - elapsed);
            setTimeout(() => {
                indicator.style.display = 'none';
            }, delay);
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
        
        // 既に同じタブがアクティブな場合は何もしない（無限再帰を防ぐ）
        if (this.currentActiveTab === tabName) {
            return;
        }
        
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
        
        // プレビュータブに切り替える時は最新のマークダウンを反映（但し無限再帰を防ぐ）
        if (tabName === 'preview') {
            const markdown = this.editor.value;
            if (this.preview) {
                this.preview.innerHTML = marked(markdown);
            }
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
                    model: 'gpt-5',
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
                    max_completion_tokens: 1000
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
            
            // デフォルトディレクトリが設定されている場合は記事リストを読み込み
            if (this.defaultDirectory) {
                console.log('[loadSettings] Loading articles from default directory');
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
            this.sidebarOpen = !this.sidebarOpen;
            console.log('New sidebar state:', this.sidebarOpen);
            
            if (this.sidebarOpen) {
                console.log('Opening slide menu');
                this.openSlideMenu();
                
                // スライドメニューが開かれたときのみ記事を読み込み、エラー時も安全に処理
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
                console.log('Closing slide menu');
                this.closeSlideMenu();
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
                
                // 現在のチャット履歴を保存（既存の記事がある場合）
                if (this.currentFile) {
                    await this.saveConversationHistory(this.currentFile);
                }
                
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
                
                // 新しい記事のチャット履歴を読み込み
                await this.loadConversationHistory(result.filePath);
                // 記事切替ごとに会話セッションを更新
                this.conversationSessionId++;
                
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
    
    setupDeleteConfirmationModal() {
        if (this.deleteModalClose) {
            this.deleteModalClose.addEventListener('click', () => this.hideDeleteConfirmationModal());
        }
        
        if (this.deleteCancelBtn) {
            this.deleteCancelBtn.addEventListener('click', () => this.hideDeleteConfirmationModal());
        }
        
        if (this.deleteConfirmBtn) {
            this.deleteConfirmBtn.addEventListener('click', () => this.executeDelete());
        }
    }
    
    showDeleteConfirmationModal(article) {
        this.currentDeletePath = article.path;
        this.deleteArticleTitle.textContent = article.title;
        this.deleteArticlePath.textContent = article.path;
        this.deleteConfirmationModal.style.display = 'block';
    }
    
    hideDeleteConfirmationModal() {
        this.deleteConfirmationModal.style.display = 'none';
        this.currentDeletePath = null;
    }
    
    executeDelete() {
        if (this.currentDeletePath) {
            this.deleteArticle(this.currentDeletePath);
            this.hideDeleteConfirmationModal();
        }
    }
    
    confirmDeleteArticle(path) {
        try {
            const article = this.articles.find(a => a.path === path);
            if (!article) {
                console.error('Article not found for deletion:', path);
                return;
            }
            
            this.showDeleteConfirmationModal(article);
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
            
            // チャット履歴も削除
            this.updateLoadingMessage('チャット履歴を削除中...');
            await this.deleteConversationHistory(path);
            
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
    
    
    // 選択解除機能
    clearSelection() {
        console.log('clearSelection called, current selection:', this.currentSelection);
        this.currentSelection = null;
        if (this.selectedTextInfo) {
            this.selectedTextInfo.style.display = 'none';
            console.log('選択中ウィンドウを非表示にしました');
        }
        
        // エディターの選択もクリア
        if (this.editor) {
            this.editor.setSelectionRange(0, 0);
        }
        
        // ブラウザの選択もクリア
        if (window.getSelection) {
            window.getSelection().removeAllRanges();
        }
        
        console.log('選択を解除しました');
    }
    
    // 外部リンクを外部ブラウザで開く設定
    setupExternalLinks() {
        // プレビューエリアとAI会話エリアのリンクを外部ブラウザで開く
        const handleLinkClick = (e) => {
            if (e.target.tagName === 'A' && e.target.href) {
                e.preventDefault();
                ipcRenderer.invoke('open-external-url', e.target.href);
            }
        };
        
        // プレビューエリア
        if (this.preview) {
            this.preview.addEventListener('click', handleLinkClick);
        }
        
        // AI会話履歴エリア
        if (this.conversationHistory) {
            this.conversationHistory.addEventListener('click', handleLinkClick);
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