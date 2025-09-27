const { app, BrowserWindow, Menu, ipcMain, dialog, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const Store = require('electron-store');

const store = new Store();

// Force transformers to use WASM backend to avoid native onnxruntime-node in Electron
try {
  if (!process.env.TRANSFORMERS_BACKEND) {
    process.env.TRANSFORMERS_BACKEND = 'wasm';
  }
} catch (_) {
  // ignore if env not writable
}

let mainWindow;

function createWindow() {
  // 保存されたウィンドウサイズを取得（デフォルト値も設定）
  const savedBounds = store.get('windowBounds', {
    width: 1200,
    height: 800,
    x: undefined,
    y: undefined
  });

  mainWindow = new BrowserWindow({
    width: savedBounds.width,
    height: savedBounds.height,
    x: savedBounds.x,
    y: savedBounds.y,
    frame: false,
    webPreferences: {
      nodeIntegration: true,
      // TODO: preload経由に移行後にtrueへ。現状はrendererでrequireを使用しているためfalseのまま。
      contextIsolation: false
    },
    icon: path.join(__dirname, '../assets/app-icon.png')
  });

  mainWindow.loadFile('src/renderer/index.html');

  if (process.argv.includes('--dev')) {
    mainWindow.webContents.openDevTools();
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
  
  // ウィンドウサイズと位置の変更を保存
  const saveBounds = () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      const bounds = mainWindow.getBounds();
      store.set('windowBounds', bounds);
    }
  };

  // リサイズ時とムーブ時に保存
  mainWindow.on('resize', saveBounds);
  mainWindow.on('move', saveBounds);
  
  // ウィンドウを閉じる前に保存状態をチェック
  mainWindow.on('close', (event) => {
    // ウィンドウサイズを保存
    saveBounds();
    // フロントエンドに保存状態を確認してから閉じる
    event.preventDefault();
    mainWindow.webContents.send('before-close');
  });
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

// IPC handlers
ipcMain.handle('save-file', async (event, content, filePath) => {
  try {
    if (!filePath) {
      const defaultDir = store.get('defaultSaveDirectory');
      if (!defaultDir) {
        throw new Error('デフォルト保存ディレクトリが設定されていません。設定から保存ディレクトリを選択してください。');
      }
      // エクスプローラを開かずに、デフォルトディレクトリに保存
      return null; // フロントエンドでファイル名を取得
    }
    
    fs.writeFileSync(filePath, content);
    return filePath;
  } catch (error) {
    console.error('Error saving file:', error);
    throw error;
  }
});

ipcMain.handle('open-file', async () => {
  try {
    const defaultDir = store.get('defaultSaveDirectory');
    if (!defaultDir) {
      throw new Error('デフォルト保存ディレクトリが設定されていません。サイドバーから記事を選択するか、設定からディレクトリを選択してください。');
    }
    
    // エクスプローラを開かずに、サイドバーから選択するよう案内
    return null;
  } catch (error) {
    console.error('Error opening file:', error);
    throw error;
  }
});

ipcMain.handle('get-store', (event, key) => {
  return store.get(key);
});

ipcMain.handle('load-article', async (event, filePath) => {
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    return { filePath, content };
  } catch (error) {
    console.error('Error loading article:', error);
    throw error;
  }
});

ipcMain.handle('set-store', (event, key, value) => {
  store.set(key, value);
});

ipcMain.handle('select-directory', async () => {
  try {
    const result = await dialog.showOpenDialog(mainWindow, {
      properties: ['openDirectory']
    });
    
    if (result.canceled) return null;
    return result.filePaths[0];
  } catch (error) {
    console.error('Error selecting directory:', error);
    throw error;
  }
});

ipcMain.handle('get-articles', async (event, directory) => {
  try {
    if (!directory || !fs.existsSync(directory)) {
      return [];
    }
    
    const files = fs.readdirSync(directory);
    const articles = [];
    
    for (const file of files) {
      if (file.endsWith('.md')) {
        const filePath = path.join(directory, file);
        const stats = fs.statSync(filePath);
        const content = fs.readFileSync(filePath, 'utf8');
        const firstLine = content.split('\n')[0] || '';
        const title = firstLine.startsWith('# ') ? firstLine.substring(2) : file.replace('.md', '');
        
        articles.push({
          filename: file,
          title: title,
          path: filePath,
          size: stats.size,
          modified: stats.mtime,
          preview: content.substring(0, 200) + (content.length > 200 ? '...' : '')
        });
      }
    }
    
    return articles.sort((a, b) => b.modified - a.modified);
  } catch (error) {
    console.error('Error getting articles:', error);
    throw error;
  }
});

ipcMain.handle('search-articles', async (event, directory, query) => {
  try {
    if (!directory || !fs.existsSync(directory) || !query) {
      return [];
    }
    
    const files = fs.readdirSync(directory);
    const results = [];
    
    for (const file of files) {
      if (file.endsWith('.md')) {
        const filePath = path.join(directory, file);
        const content = fs.readFileSync(filePath, 'utf8');
        const firstLine = content.split('\n')[0] || '';
        const title = firstLine.startsWith('# ') ? firstLine.substring(2) : file.replace('.md', '');
        
        if (title.toLowerCase().includes(query.toLowerCase()) || 
            content.toLowerCase().includes(query.toLowerCase())) {
          const stats = fs.statSync(filePath);
          results.push({
            filename: file,
            title: title,
            path: filePath,
            size: stats.size,
            modified: stats.mtime,
            preview: content.substring(0, 200) + (content.length > 200 ? '...' : '')
          });
        }
      }
    }
    
    return results.sort((a, b) => b.modified - a.modified);
  } catch (error) {
    console.error('Error searching articles:', error);
    throw error;
  }
});

ipcMain.handle('save-new-file', async (event, content, filename) => {
  try {
    const defaultDir = store.get('defaultSaveDirectory');
    if (!defaultDir) {
      throw new Error('デフォルト保存ディレクトリが設定されていません。');
    }
    
    // ファイル名に.mdがない場合は追加
    let baseFilename = filename.endsWith('.md') ? filename.slice(0, -3) : filename;
    let finalFilename = baseFilename + '.md';
    let filePath = path.join(defaultDir, finalFilename);
    
    // ファイルが既に存在する場合はナンバリング
    let counter = 1;
    while (fs.existsSync(filePath)) {
      finalFilename = baseFilename + counter + '.md';
      filePath = path.join(defaultDir, finalFilename);
      counter++;
      
      // 無限ループ防止
      if (counter > 1000) {
        throw new Error('ファイル名の生成に失敗しました。');
      }
    }
    
    console.log('Saving file as:', filePath);
    fs.writeFileSync(filePath, content);
    return filePath;
  } catch (error) {
    console.error('Error saving new file:', error);
    throw error;
  }
});

ipcMain.handle('check-file-exists', async (event, filename) => {
  try {
    const defaultDir = store.get('defaultSaveDirectory');
    if (!defaultDir) {
      return false;
    }
    
    const sanitizedFilename = filename.endsWith('.md') ? filename : filename + '.md';
    const filePath = path.join(defaultDir, sanitizedFilename);
    
    return fs.existsSync(filePath);
  } catch (error) {
    console.error('Error checking file exists:', error);
    return false;
  }
});

ipcMain.handle('delete-file', async (event, filePath) => {
  try {
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
      return true;
    }
    return false;
  } catch (error) {
    console.error('Error deleting file:', error);
    throw error;
  }
});

ipcMain.handle('close-app', () => {
  mainWindow.destroy();
});

// Window control handler
ipcMain.handle('close-window', () => {
  if (mainWindow) {
    mainWindow.close();
  }
});

ipcMain.handle('save-image', async (event, base64Data, filename, directory, prompt) => {
  try {
    if (!directory || !fs.existsSync(directory)) {
      throw new Error('画像保存ディレクトリが設定されていないか、存在しません。');
    }
    
    const imagePath = path.join(directory, filename);
    const buffer = Buffer.from(base64Data, 'base64');
    
    fs.writeFileSync(imagePath, buffer);
    
    // プロンプト情報も一緒に保存
    const infoPath = path.join(directory, filename.replace('.png', '.txt'));
    const info = `Generated: ${new Date().toLocaleString()}\nPrompt: ${prompt}`;
    fs.writeFileSync(infoPath, info);
    
    console.log('Image saved successfully:', imagePath);
    return imagePath;
  } catch (error) {
    console.error('Error saving image:', error);
    throw error;
  }
});

ipcMain.handle('open-folder', async (event, folderPath) => {
  try {
    if (!folderPath || !fs.existsSync(folderPath)) {
      throw new Error('フォルダが存在しません: ' + folderPath);
    }
    
    await shell.openPath(folderPath);
    console.log('Opened folder:', folderPath);
    return true;
  } catch (error) {
    console.error('Error opening folder:', error);
    throw error;
  }
});

// Create menu
const template = [
  {
    label: 'File',
    submenu: [
      {
        label: 'New',
        accelerator: 'CmdOrCtrl+N',
        click: () => {
          mainWindow.webContents.send('menu-new-file');
        }
      },
      {
        label: 'Save',
        accelerator: 'CmdOrCtrl+S',
        click: () => {
          mainWindow.webContents.send('menu-save-file');
        }
      },
      {
        label: 'Save As',
        accelerator: 'CmdOrCtrl+Shift+S',
        click: () => {
          mainWindow.webContents.send('menu-save-as-file');
        }
      },
      { type: 'separator' },
      {
        label: 'Exit',
        accelerator: process.platform === 'darwin' ? 'Cmd+Q' : 'Ctrl+Q',
        click: () => {
          app.quit();
        }
      }
    ]
  },
  {
    label: 'Edit',
    submenu: [
      { role: 'undo' },
      { role: 'redo' },
      { type: 'separator' },
      { role: 'cut' },
      { role: 'copy' },
      { role: 'paste' }
    ]
  },
  {
    label: 'View',
    submenu: [
      { role: 'reload' },
      { role: 'forceReload' },
      { role: 'toggleDevTools' },
      { type: 'separator' },
      { role: 'resetZoom' },
      { role: 'zoomIn' },
      { role: 'zoomOut' },
      { type: 'separator' },
      { role: 'togglefullscreen' }
    ]
  },
  {
    label: 'Tools',
    submenu: [
      {
        label: 'Open Image Folder',
        click: () => {
          const imageDir = store.get('imageDirectory');
          if (imageDir) {
            shell.openPath(imageDir);
          } else {
            dialog.showMessageBox(mainWindow, {
              type: 'warning',
              title: 'Image Directory Not Set',
              message: 'Please set the image directory in Settings first.'
            });
          }
        }
      }
    ]
  }
];

const menu = Menu.buildFromTemplate(template);
Menu.setApplicationMenu(menu);

// 外部URLを開く
ipcMain.handle('open-external-url', async (event, url) => {
  try {
    await shell.openExternal(url);
    return true;
  } catch (error) {
    console.error('Error opening external URL:', error);
    throw error;
  }
});

// =================== Embeddings-based KB index/search ===================
// 依存: @xenova/transformers（package.json 追加済み）
let embeddingPipelinePromise = null;
let kbIndexCache = new Map(); // key: directory, value: { model, chunks: [...], files: {...}, lastBuilt }
let embeddingsPermanentlyDisabled = false; // 初期化失敗後は以降の試行を停止

async function getEmbeddingPipeline() {
  if (embeddingsPermanentlyDisabled) {
    throw new Error('embeddings disabled');
  }
  if (!embeddingPipelinePromise) {
    embeddingPipelinePromise = (async () => {
      try {
        const { pipeline, env } = await import('@xenova/transformers');
        try {
          // 強制的にWASMバックエンドを使用（Node/Electronでのネイティブ依存を回避）
          if (env && env.backends && env.backends.onnx) {
            env.backends.onnx = 'wasm';
          }
        } catch (_) { /* noop */ }
        // 小型で高速な汎用埋め込みモデル
        const pipe = await pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2');
        return pipe;
      } catch (e) {
        console.error('Failed to load transformers pipeline:', e);
        // 失敗時は以降の呼び出しで検出できるようエラーを再スロー
        embeddingsPermanentlyDisabled = true;
        throw e;
      }
    })();
  }
  return embeddingPipelinePromise;
}

function l2norm(vec) {
  const s = Math.sqrt(vec.reduce((a, v) => a + v * v, 0) || 1);
  return vec.map(v => v / s);
}

function cosSim(a, b) {
  let s = 0;
  for (let i = 0; i < Math.min(a.length, b.length); i++) s += a[i] * b[i];
  return s;
}

async function embedText(text) {
  const pipe = await getEmbeddingPipeline();
  const output = await pipe(text, { pooling: 'mean', normalize: true });
  // output is TypedArray
  return Array.from(output.data || output);
}

function readJson(file) {
  try {
    if (fs.existsSync(file)) {
      return JSON.parse(fs.readFileSync(file, 'utf8'));
    }
  } catch (e) {
    console.warn('Failed to read index json:', e.message);
  }
  return null;
}

function writeJson(file, data) {
  try {
    fs.writeFileSync(file, JSON.stringify(data), 'utf8');
    return true;
  } catch (e) {
    console.warn('Failed to write index json:', e.message);
    return false;
  }
}

function listMarkdownFilesRecursive(dir, maxFiles = 2000) {
  const result = [];
  function walk(d) {
    if (result.length >= maxFiles) return;
    const entries = fs.readdirSync(d, { withFileTypes: true });
    for (const ent of entries) {
      const p = path.join(d, ent.name);
      if (ent.isDirectory()) {
        walk(p);
      } else if (ent.isFile() && ent.name.toLowerCase().endsWith('.md')) {
        result.push(p);
        if (result.length >= maxFiles) break;
      }
    }
  }
  walk(dir);
  return result;
}

function chunkMarkdownForIndex(content) {
  // H2+で区切り、段落で細分化。コードブロックは1塊。
  const lines = (content || '').split(/\r?\n/);
  const chunks = [];
  let currentHeading = '';
  let buffer = [];
  const flush = () => {
    if (buffer.length === 0) return;
    const text = buffer.join('\n').trim();
    if (text) {
      if (text.length <= 1200) {
        chunks.push({ heading: currentHeading, text });
      } else {
        const parts = text.split(/\n\n+/);
        let acc = '';
        for (const p of parts) {
          const candidate = acc ? acc + '\n\n' + p : p;
          if (candidate.length > 800) {
            if (acc.trim()) chunks.push({ heading: currentHeading, text: acc.trim() });
            acc = p;
          } else {
            acc = candidate;
          }
        }
        if (acc.trim()) chunks.push({ heading: currentHeading, text: acc.trim() });
      }
    }
    buffer = [];
  };
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (/^```/.test(line)) {
      const code = [line];
      i++;
      while (i < lines.length && !/^```/.test(lines[i])) { code.push(lines[i]); i++; }
      if (i < lines.length) code.push(lines[i]);
      buffer.push(code.join('\n'));
      continue;
    }
    const m = /^(#{2,6})\s+(.*)$/.exec(line);
    if (m) { flush(); currentHeading = m[2].trim(); continue; }
    buffer.push(line);
  }
  flush();
  return chunks;
}

async function ensureKbIndex(directory, options = {}) {
  const model = 'Xenova/all-MiniLM-L6-v2';
  const indexFile = path.join(directory, '.ai_markdown_index.json');
  let index = kbIndexCache.get(directory) || readJson(indexFile) || { model, chunks: [], files: {}, lastBuilt: 0 };

  // ファイル一覧と更新検知
  const files = listMarkdownFilesRecursive(directory, options.maxFiles || 2000);
  const fileSet = new Set(files);
  const toUpdate = [];

  // 既存のものと照合
  for (const filePath of files) {
    try {
      const st = fs.statSync(filePath);
      const mtime = st.mtimeMs;
      const rec = index.files[filePath];
      if (!rec || rec.mtime !== mtime) {
        toUpdate.push({ filePath, mtime });
      }
    } catch (_) {}
  }
  // 削除されたファイルを除去
  if (index.files) {
    for (const oldPath of Object.keys(index.files)) {
      if (!fileSet.has(oldPath)) {
        // 該当するチャンクを削除
        index.chunks = index.chunks.filter(ch => ch.path !== oldPath);
        delete index.files[oldPath];
      }
    }
  }

  if (toUpdate.length > 0) {
    // モデルの初期化（必要時）。失敗したら以降は埋め込みをスキップ
    try {
      await getEmbeddingPipeline();
    } catch (e) {
      console.warn('Embedding pipeline unavailable, skipping index embedding updates');
      kbIndexCache.set(directory, index);
      writeJson(indexFile, index);
      return { updated: 0, files: Object.keys(index.files).length, chunks: index.chunks.length };
    }
  }

  for (const { filePath, mtime } of toUpdate) {
    let content = '';
    try { content = fs.readFileSync(filePath, 'utf8'); } catch (e) { continue; }
    const firstLine = content.split('\n')[0] || '';
    const title = firstLine.startsWith('# ') ? firstLine.substring(2).trim() : path.basename(filePath).replace(/\.md$/i, '');
    const chunks = chunkMarkdownForIndex(content);

    // 既存チャンクを一旦削除
    index.chunks = index.chunks.filter(ch => ch.path !== filePath);

    // 埋め込み計算
    for (const ch of chunks) {
      let embedding = [];
      try {
        embedding = await embedText(ch.text);
      } catch (e) {
        console.warn('Embedding failed for chunk:', filePath, e.message);
        continue;
      }
      index.chunks.push({
        path: filePath,
        file: path.basename(filePath),
        title,
        heading: ch.heading,
        text: ch.text,
        embedding
      });
    }

    index.files[filePath] = { mtime, chunks: chunks.length };
  }

  index.model = model;
  index.lastBuilt = Date.now();
  kbIndexCache.set(directory, index);

  // 永続化（大きくなりすぎる場合は将来的に圧縮を検討）
  writeJson(indexFile, index);
  return { updated: toUpdate.length, files: Object.keys(index.files).length, chunks: index.chunks.length };
}

ipcMain.handle('kb-build-index', async (event, directory, options = {}) => {
  try {
    if (!directory || !fs.existsSync(directory)) throw new Error('Invalid directory');
    const stats = await ensureKbIndex(directory, options);
    return { ok: true, stats };
  } catch (e) {
    console.error('kb-build-index error:', e);
    // 埋め込み失敗時もアプリは落とさない
    return { ok: false, error: e.message };
  }
});

ipcMain.handle('kb-search-embeddings', async (event, directory, query, options = {}) => {
  try {
    if (!directory || !fs.existsSync(directory) || !query || !query.trim()) return [];
    await ensureKbIndex(directory, { maxFiles: options.maxFiles || 2000 });
    const index = kbIndexCache.get(directory);
    if (!index || !index.chunks || index.chunks.length === 0) return [];

    // クエリ埋め込み
    const q = await embedText(query);

    const scored = index.chunks.map(ch => ({
      score: cosSim(q, ch.embedding),
      file: ch.file,
      path: ch.path,
      title: ch.title,
      heading: ch.heading,
      text: ch.text
    }));

    scored.sort((a, b) => b.score - a.score);
    const topK = Math.min(options.topK || 6, scored.length);
    const maxChars = options.maxCharsPerPassage || 600;
    return scored.slice(0, topK).map(p => ({
      ...p,
      text: p.text.length > maxChars ? p.text.slice(0, maxChars) + '...' : p.text
    }));
  } catch (e) {
    console.error('kb-search-embeddings error:', e);
    // 失敗時は空配列（レンダラー側でキーワード検索にフォールバック）
    return [];
  }
});

// RAG-lite: ローカルMarkdownから関連抜粋を検索
// 単語頻度ベースの簡易スコアリングで、見出し/段落/コードブロックを塊に分割して上位を返す
ipcMain.handle('kb-search-passages', async (event, directory, query, options = {}) => {
  try {
    if (!directory || !fs.existsSync(directory) || !query || !query.trim()) {
      return [];
    }

    const {
      maxFiles = 2000,        // 走査する最大ファイル数（再帰に合わせて拡大）
      maxPassages = 6,       // 返す最大抜粋数
      maxCharsPerPassage = 600, // 抜粋の最大文字数
      includeFileMeta = true
    } = options;

    // 簡易トークナイズ（日本語と英数字を分ける）
    const tokenize = (text) => {
      return (text || '')
        .toLowerCase()
        .replace(/[\u3000\s]+/g, ' ')
        .match(/[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}a-z0-9#\-_.]+/giu) || [];
    };

    const queryTokens = tokenize(query);
    if (queryTokens.length === 0) return [];

    // 再帰的にMarkdownファイルを収集
    const files = listMarkdownFilesRecursive(directory, maxFiles);

    const passages = [];

    for (const filePath of files) {
      let content = '';
      try {
        content = fs.readFileSync(filePath, 'utf8');
      } catch (e) {
        console.warn('kb-search-passages: failed to read', filePath, e.message);
        continue;
      }

      // タイトル抽出（先頭行 # タイトル）
      const firstLine = content.split('\n')[0] || '';
      const title = firstLine.startsWith('# ') ? firstLine.substring(2).trim() : path.basename(filePath).replace(/\.md$/, '');

      // チャンク分割: 見出し(H2以降)を基点に、大きすぎる場合は段落単位に
      const chunks = splitMarkdownIntoChunks(content);

      for (const ch of chunks) {
        const tokens = tokenize(ch.text);
        if (tokens.length === 0) continue;

        // 単純な一致スコア: クエリ語の出現回数 + タイトル一致ボーナス + 見出し一致ボーナス
        let score = 0;
        for (const qt of queryTokens) {
          // 厳密一致と部分一致で重み
          const exact = tokens.filter(t => t === qt).length * 3;
          const partial = tokens.filter(t => qt.length >= 2 && t.includes(qt)).length;
          score += exact + partial;
          if (title.toLowerCase().includes(qt)) score += 4; // タイトルに含まれるとボーナス
          if (ch.heading && ch.heading.toLowerCase().includes(qt)) score += 2; // 見出しボーナス
        }

        if (score > 0) {
          const snippet = ch.text.length > maxCharsPerPassage
            ? ch.text.slice(0, maxCharsPerPassage) + '...'
            : ch.text;

          passages.push({
            score,
            file: includeFileMeta ? path.basename(filePath) : undefined,
            path: includeFileMeta ? filePath : undefined,
            title: includeFileMeta ? title : undefined,
            heading: ch.heading,
            text: snippet
          });
        }
      }
    }

    // スコア降順で上位を返す
    passages.sort((a, b) => b.score - a.score);
    return passages.slice(0, maxPassages);
  } catch (error) {
    console.error('Error in kb-search-passages:', error);
    return [];
  }
});

// 内部関数: Markdownを見出し/段落ベースでチャンクに分割
function splitMarkdownIntoChunks(markdown) {
  try {
    const lines = (markdown || '').split(/\r?\n/);
    const chunks = [];
    let currentHeading = '';
    let buffer = [];

    const flush = () => {
      if (buffer.length === 0) return;
      const text = buffer.join('\n').trim();
      if (text) {
        chunks.push({ heading: currentHeading, text });
      }
      buffer = [];
    };

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      // コードブロックはそのまま塊に
      if (/^```/.test(line)) {
        // 開始行含め格納
        const code = [line];
        i++;
        while (i < lines.length && !/^```/.test(lines[i])) {
          code.push(lines[i]);
          i++;
        }
        if (i < lines.length) code.push(lines[i]); // 終了 ```
        buffer.push(code.join('\n'));
        continue;
      }

      // H2以上の見出しで区切る
      const m = /^(#{2,6})\s+(.*)$/.exec(line);
      if (m) {
        flush();
        currentHeading = m[2].trim();
        continue;
      }

      buffer.push(line);
    }
    flush();

    // 大きすぎるチャンクは段落で分割
    const refined = [];
    for (const ch of chunks) {
      if (ch.text.length <= 1200) {
        refined.push(ch);
      } else {
        const parts = ch.text.split(/\n\n+/);
        let acc = '';
        for (const p of parts) {
          if ((acc + '\n\n' + p).trim().length > 800) {
            if (acc.trim()) refined.push({ heading: ch.heading, text: acc.trim() });
            acc = p;
          } else {
            acc = acc ? acc + '\n\n' + p : p;
          }
        }
        if (acc.trim()) refined.push({ heading: ch.heading, text: acc.trim() });
      }
    }
    return refined;
  } catch (e) {
    console.warn('splitMarkdownIntoChunks failed:', e.message);
    return [{ heading: '', text: markdown || '' }];
  }
}