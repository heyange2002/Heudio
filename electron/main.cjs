const { app, BrowserWindow, Menu, dialog, shell, utilityProcess } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const dotenv = require('dotenv');

app.setName('SoundIsle');
const appIcon = path.join(app.getAppPath(), 'assets', 'icons', process.platform === 'win32' ? 'icon.ico' : 'icon.png');
const smoke = process.argv.includes('--smoke-test');
// Smoke checks use a disposable profile, never the user's real authorization data.
if (smoke) app.setPath('userData', fs.mkdtempSync(path.join(app.getPath('temp'), 'soundisle-smoke-')));
let window, backend, origin, configFile;
let quitting = false;

if (!app.requestSingleInstanceLock()) app.quit();
else {
  app.on('second-instance', () => {
    if (window) { if (window.isMinimized()) window.restore(); window.show(); window.focus(); }
  });
  app.whenReady().then(start).catch(fail);
}

function fail(error) {
  console.error(error);
  quitting = true;
  backend?.kill();
  if (!smoke) dialog.showErrorBox('声屿 PC 版启动失败', `${error.message}\n配置文件：${configFile || app.getPath('userData')}\n修改配置后请重新启动。`);
  app.exit(1);
}

function readConfig() {
  const userDir = app.getPath('userData');
  fs.mkdirSync(userDir, { recursive: true, mode: 0o700 });
  configFile = path.join(userDir, '.env');
  if (!fs.existsSync(configFile)) {
    const devFile = path.join(app.getAppPath(), '.env');
    const initial = !app.isPackaged && !smoke && fs.existsSync(devFile) ? dotenv.parse(fs.readFileSync(devFile)) : {};
    fs.writeFileSync(configFile, `# 声屿 PC 版配置，修改后请重启。请勿分享此文件。\nMINIMAX_API_KEY=${initial.MINIMAX_API_KEY || ''}\n`, { mode: 0o600 });
  }
  const config = dotenv.parse(fs.readFileSync(configFile));
  return config;
}

async function start() {
  if (process.platform === 'darwin') app.dock.setIcon(appIcon);
  const config = readConfig();
  Menu.setApplicationMenu(Menu.buildFromTemplate([
    { label: '声屿 PC 版', submenu: [
      { label: '打开配置文件', click: () => shell.openPath(configFile) },
      { label: '打开数据目录', click: () => shell.openPath(app.getPath('userData')) },
      { type: 'separator' }, { role: 'quit', label: '退出声屿' },
    ] },
    { label: '编辑', submenu: [{ role: 'undo' }, { role: 'redo' }, { type: 'separator' }, { role: 'cut' }, { role: 'copy' }, { role: 'paste' }, { role: 'selectAll' }] },
    { label: '视图', submenu: [{ role: 'reload' }, { role: 'resetZoom' }, { role: 'zoomIn' }, { role: 'zoomOut' }, { role: 'togglefullscreen' }, ...(!app.isPackaged ? [{ role: 'toggleDevTools' }] : [])] },
  ]));
  const portFile = path.join(app.getPath('userData'), 'server-port');
  const port = fs.existsSync(portFile) ? Number(fs.readFileSync(portFile, 'utf8')) : 0;
  if (!Number.isInteger(port) || port < 0 || port > 65535) throw Error('本地端口记录无效，请删除数据目录中的 server-port 后重启。');
  backend = utilityProcess.fork(path.join(__dirname, 'server.mjs'), [], {
    cwd: app.getPath('userData'), serviceName: 'SoundIsle PC Service', stdio: 'pipe',
    env: { ...process.env, ...config, NODE_ENV: 'production', SOUNDISLE_DESKTOP: 'true',
      PORT: String(port), HOST: '127.0.0.1', SOUNDISLE_ENV_FILE: configFile,
      SOUNDISLE_DATA_DIR: path.join(app.getPath('userData'), 'data'),
      SOUNDISLE_STATIC_DIR: path.join(app.getAppPath(), 'dist'),
    },
  });
  let errors = '';
  backend.stderr.on('data', data => { errors = (errors + data).slice(-2000); });
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(Error('本地服务启动超时，请检查配置后重启。')), 30000);
    backend.once('exit', code => { clearTimeout(timer); reject(Error(`本地服务启动失败 (${code})。${errors.includes('EADDRINUSE') ? '端口被占用；请关闭占用程序，或删除数据目录的 server-port 后重启。' : '请检查配置文件。'}`)); });
    backend.on('message', message => {
      if (message?.type !== 'ready') return;
      clearTimeout(timer);
      origin = `http://127.0.0.1:${message.port}`;
      // A stable origin retains local playback, EQ and profile settings across restarts.
      fs.writeFileSync(portFile, String(message.port), { mode: 0o600 });
      resolve();
    });
  });
  backend.on('exit', () => { if (!quitting) fail(Error('本地服务已停止，请重新启动声屿。')); });
  await createWindow();
  app.on('activate', () => { if (!BrowserWindow.getAllWindows().length) createWindow().catch(fail); });
  if (smoke) await smokeTest();
}

async function createWindow() {
  window = new BrowserWindow({
    title: '声屿 SoundIsle · PC 版', width: 1440, height: 960, minWidth: 1100, minHeight: 720,
    backgroundColor: '#0c0a09', show: false,
    icon: appIcon,
    titleBarStyle: 'hidden',
    ...(process.platform === 'darwin' ? { trafficLightPosition: { x: 18, y: 23 } } : { titleBarOverlay: { color: '#0c0a09', symbolColor: '#d6d3d1', height: 64 } }),
    webPreferences: { preload: path.join(__dirname, 'preload.cjs'), nodeIntegration: false, contextIsolation: true, sandbox: true, webSecurity: true },
  });
  const session = window.webContents.session;
  session.setPermissionRequestHandler((contents, permission, callback, details) => {
    callback(contents === window?.webContents && permission === 'media' &&
      new URL(contents.getURL()).origin === origin && details.mediaTypes?.every(type => type === 'audio') === true);
  });
  session.setPermissionCheckHandler((contents, permission, requestingOrigin) =>
    contents === window?.webContents && permission === 'media' && requestingOrigin === origin);
  const allow = url => { try { return new URL(url).origin === origin; } catch { return false; } };
  window.webContents.on('will-navigate', (event, url) => { if (!allow(url)) event.preventDefault(); });
  window.webContents.on('will-redirect', (event, url) => { if (!allow(url)) event.preventDefault(); });
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  window.on('closed', () => { window = null; });
  await window.loadURL(origin);
  if (!smoke) window.show();
}

async function smokeTest() {
  const result = await window.webContents.executeJavaScript(`(async () => {
    const headers = { 'X-Soundisle-Client': 'web', 'Content-Type': 'application/json' };
    const response = await fetch('/api/auth/session', { headers });
    const session = await response.json();
    const unlocked = await fetch('/api/agent/config', { headers });
    localStorage.setItem('soundisle:desktop-smoke', 'persisted');
    return { title: document.title, rendered: !!document.querySelector('#root')?.textContent,
      status: response.status, session, unlocked: unlocked.status, node: typeof window.require };
  })()`);
  if (result.status !== 200 || result.session.authenticated !== true || result.session.desktop !== true || result.unlocked !== 200 || !result.rendered || result.node !== 'undefined') throw Error(`Desktop smoke check failed: ${JSON.stringify(result)}`);
  const layout = await window.webContents.executeJavaScript(`(async () => {
    const waitFor = async check => { for(let i=0;i<100;i++){if(check())return;await new Promise(r=>setTimeout(r,30));}throw Error('Layout UI timed out'); };
    await waitFor(()=>document.querySelector('.app-titlebar'));
    const header=document.querySelector('.app-titlebar'),control=header.querySelector('button');
    if (!window.soundisleWindow?.platform || document.documentElement.dataset.desktopPlatform!==window.soundisleWindow.platform) throw Error('Desktop layout bridge missing');
    if (getComputedStyle(header).getPropertyValue('app-region')!=='drag' || getComputedStyle(control).getPropertyValue('app-region')!=='no-drag') throw Error('Titlebar drag regions invalid');
    document.querySelector('button[aria-label="开启只听音乐模式"]').click();
    await waitFor(()=>document.querySelector('.pure-music-main'));
    await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));
    const art=document.querySelector('.pure-music-visualizer').getBoundingClientRect();
    const lyrics=document.querySelector('.pure-music-lyrics .lyrics-panel').getBoundingClientRect();
    const footer=document.querySelector('footer[aria-label="播放控制栏"]').getBoundingClientRect();
    const gap=footer.top-art.bottom;
    if(Math.abs(art.bottom-lyrics.bottom)>2 || gap<12 || gap>28 || art.height<300) throw Error('Pure music layout leaves blank space: '+JSON.stringify({art:art.toJSON(),lyrics:lyrics.toJSON(),gap}));
    return {platform:window.soundisleWindow.platform,headerTop:header.getBoundingClientRect().top,gap,height:art.height};
  })()`);
  if (process.env.SOUNDISLE_SMOKE_CAPTURE) fs.writeFileSync(process.env.SOUNDISLE_SMOKE_CAPTURE, (await window.webContents.capturePage()).toPNG());
  await window.webContents.executeJavaScript(`document.querySelector('button[aria-label="退出纯音乐模式"]').click()`);
  console.log('Desktop titlebar and layout check passed:', JSON.stringify(layout));
  const settingsChecked = await window.webContents.executeJavaScript(`(async () => {
    const waitFor = async check => { for (let i = 0; i < 100; i++) { if (check()) return; await new Promise(resolve => setTimeout(resolve, 50)); } throw Error('Settings UI timed out'); };
    if (document.body.textContent.includes('锁定访问') || document.querySelector('input[aria-label="4位数字访问码"]')) throw Error('Desktop still shows access code controls');
    await waitFor(() => [...document.querySelectorAll('button')].some(button => button.textContent === '设置'));
    [...document.querySelectorAll('button')].find(button => button.textContent === '设置').click();
    await waitFor(() => document.querySelector('#minimax-api-key'));
    const input = document.querySelector('#minimax-api-key');
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, 'desktop-smoke-test-key');
    input.dispatchEvent(new Event('input', { bubbles: true }));
    await waitFor(() => [...document.querySelectorAll('button')].some(button => button.textContent === '保存 Key' && !button.disabled));
    [...document.querySelectorAll('button')].find(button => button.textContent === '保存 Key').click();
    await waitFor(() => document.body.textContent.includes('Key 已保存，即刻生效'));
    if (input.value !== '') throw Error('Key input was not cleared');
    const headers = { 'X-Soundisle-Client': 'web' };
    for (const url of ['/api/voice/config', '/api/agent/config']) {
      const text = await (await fetch(url, { headers })).text();
      if (!JSON.parse(text).configured || text.includes('desktop-smoke-test-key')) throw Error('Key status or redaction failed');
    }
    [...document.querySelectorAll('button')].find(button => button.textContent === '移除 Key').click();
    await waitFor(() => document.body.textContent.includes('Key 已移除'));
    if ((await (await fetch('/api/voice/config', { headers })).json()).configured) throw Error('Key removal failed');
    return true;
  })()`);
  if (!settingsChecked) throw Error('Desktop settings check failed');
  const stored = JSON.parse(fs.readFileSync(path.join(app.getPath('userData'), 'data', 'minimax-settings.json'), 'utf8'));
  if (stored.apiKey !== '') throw Error('Desktop key removal was not persisted');
  await window.webContents.executeJavaScript(`(async () => {
    const sessionId = sessionStorage.getItem('soundisle:agent-session');
    if (!sessionId) throw Error('No conversation session');
    const headers = { 'X-Soundisle-Client': 'web', 'Content-Type': 'application/json' };
    const response = await fetch('/api/agent/chat', { method: 'POST', headers, body: JSON.stringify({ sessionId, message: 'desktop memory check', musicSource: 'qq-music', chatModel: 'local-heuristic' }) });
    if (!response.ok) throw Error('Memory chat route failed');
    const memory = await (await fetch('/api/agent/memory?sessionId=' + sessionId, { headers })).json();
    if (memory.shortTerm.length !== 2 || memory.shortTerm[0].content !== 'desktop memory check') throw Error('Conversation did not persist');
  })()`);
  await window.loadURL(origin);
  await window.webContents.executeJavaScript(`(async () => {
    for (let i = 0; i < 100; i++) {
      if (document.querySelector('[role="log"]')?.textContent.includes('desktop memory check')) return;
      await new Promise(resolve => setTimeout(resolve, 50));
    }
    throw Error('Conversation was not restored after reload');
  })()`);
  if (!await window.webContents.executeJavaScript(`localStorage.getItem('soundisle:desktop-smoke') === 'persisted'`)) throw Error('Desktop storage did not survive reload');
  console.log('Desktop smoke check passed:', JSON.stringify(result));
  app.quit();
}

app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
app.on('before-quit', () => { quitting = true; backend?.kill(); });
app.on('will-quit', () => { if (smoke) fs.rmSync(app.getPath('userData'), { recursive: true, force: true }); });
