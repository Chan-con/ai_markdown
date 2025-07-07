const { app, BrowserWindow, Menu, ipcMain, dialog, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const Store = require('electron-store');

const store = new Store();

let mainWindow;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    frame: false,
    webPreferences: {
      nodeIntegration: true,
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
  
  // ウィンドウを閉じる前に保存状態をチェック
  mainWindow.on('close', (event) => {
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