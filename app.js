// --- MOBILE BLOCKER SCRIPT ---
if (/Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) || window.innerWidth <= 768) {
    document.addEventListener("DOMContentLoaded", () => document.getElementById('mobileBlocker').style.display = 'flex');
}

// --- STATE MANAGEMENT ---
let appConfig = { theme: 'dark', customColors: null, sidebarWidth: '280px', lastVolume: 1, useMetadata: false, lastBackupTime: 0 };
let masterFiles = [], sources = [], playlists = [], songRatings = {}; 
let baseQueue = [], playQueue = [], playQueueIndex = -1; 
let currentActiveView = 'All Songs';
let isPlaying = false, isShuffle = false, repeatMode = 1, isDraggingProgress = false;
let selectedTracks = new Set();
let currentRenderToken = 0; // Used to abort chunked rendering if view changes
let db; let toastTimeout;

// --- DOM ELEMENTS ---
const htmlRoot = document.documentElement;
const themeDropdown = document.getElementById('themeDropdown');
const manualModal = document.getElementById('manualModal');
const dragResizer = document.getElementById('dragResizer');
const toastEl = document.getElementById('toast');
const searchInput = document.getElementById('searchInput');
const mainSearchContainer = document.getElementById('mainSearchContainer');

const addSourceMenu = document.getElementById('addSourceMenu');
const importBackupInput = document.getElementById('importBackupInput');
const restoreBtn = document.getElementById('restoreBtn');
const folderSidebarList = document.getElementById('folderSidebarList');
const playlistSidebarList = document.getElementById('playlistSidebarList');

const centerTrackList = document.getElementById('centerTrackList');
const viewTitle = document.getElementById('viewTitle');
const viewSubtitle = document.getElementById('viewSubtitle');
const batchActionBar = document.getElementById('batchActionBar');
const batchCountText = document.getElementById('batchCountText');
const batchPlaylistSelect = document.getElementById('batchPlaylistSelect');
const batchRemoveBtn = document.getElementById('batchRemoveBtn');

const navAllSongs = document.getElementById('navAllSongs');
const navSettings = document.getElementById('navSettings');

const audioPlayer = document.getElementById('audioPlayer');
const footerTitle = document.getElementById('footerTitle'), footerArtist = document.getElementById('footerArtist'), footerArt = document.getElementById('footerArt');

const playBtn = document.getElementById('playBtn'), playIcon = document.getElementById('playIcon'), pauseIcon = document.getElementById('pauseIcon');
const prevBtn = document.getElementById('prevBtn'), nextBtn = document.getElementById('nextBtn');
const shuffleBtn = document.getElementById('shuffleBtn'), repeatBtn = document.getElementById('repeatBtn');
const progressBar = document.getElementById('progressBar'), currentTimeEl = document.getElementById('currentTime'), totalTimeEl = document.getElementById('totalTime');
const muteBtn = document.getElementById('muteBtn'), volumeSlider = document.getElementById('volumeSlider');

// Utility: Toast
function showToast(msg) {
    toastEl.textContent = msg; toastEl.classList.add('show');
    clearTimeout(toastTimeout); toastTimeout = setTimeout(() => toastEl.classList.remove('show'), 2500);
}
function updateRangeFill(slider) {
    const val = (slider.value - slider.min) / (slider.max - slider.min) * 100;
    slider.style.background = `linear-gradient(to right, var(--text-main) ${val}%, var(--border) ${val}%)`;
}

// --- DRAGGABLE SIDEBAR ---
let isResizing = false;
dragResizer.addEventListener('mousedown', () => { isResizing = true; document.body.style.cursor = 'col-resize'; dragResizer.classList.add('dragging'); });
document.addEventListener('mousemove', (e) => {
    if (!isResizing) return;
    htmlRoot.style.setProperty('--sidebar-width', `${Math.max(180, Math.min(e.clientX, 600))}px`);
});
document.addEventListener('mouseup', () => {
    if (isResizing) {
        isResizing = false; document.body.style.cursor = 'default'; dragResizer.classList.remove('dragging');
        appConfig.sidebarWidth = htmlRoot.style.getPropertyValue('--sidebar-width'); saveToDB('appConfig', appConfig);
    }
});

// --- KEYBOARD SHORTCUTS ---
document.addEventListener('keydown', (e) => {
    if (e.target.tagName === 'INPUT' && e.target.type !== 'range') return;
    switch(e.key) {
        case ' ': e.preventDefault(); togglePlay(); break;
        case 'ArrowRight': if (e.ctrlKey) playNext(); else if (e.shiftKey) { audioPlayer.currentTime = Math.min(audioPlayer.duration, audioPlayer.currentTime + 5); updateProgressUI(); } break;
        case 'ArrowLeft': if (e.ctrlKey) playPrev(); else if (e.shiftKey) { audioPlayer.currentTime = Math.max(0, audioPlayer.currentTime - 5); updateProgressUI(); } break;
        case 'm': case 'M': toggleMute(); break;
    }
});

function updateProgressUI() {
    if (!audioPlayer.duration) return;
    progressBar.value = (audioPlayer.currentTime / audioPlayer.duration) * 100;
    currentTimeEl.textContent = formatTime(audioPlayer.currentTime); updateRangeFill(progressBar);
}

document.getElementById('openManualBtn').addEventListener('click', () => manualModal.classList.remove('hidden'));
document.getElementById('closeManualBtn').addEventListener('click', () => { manualModal.classList.add('hidden'); localStorage.setItem('manualShown', 'true'); });
if (!localStorage.getItem('manualShown')) manualModal.classList.remove('hidden');

// Check Backup Reminder
function checkBackupReminder() {
    const now = Date.now();
    if (appConfig.lastBackupTime && (now - appConfig.lastBackupTime > 7 * 24 * 60 * 60 * 1000)) {
        setTimeout(() => showToast("Friendly reminder: Export your latest backup in Settings!"), 2000);
    }
}

// --- THEME LOGIC ---
function applyCustomTheme(colors) { if(colors) for (const [key, value] of Object.entries(colors)) htmlRoot.style.setProperty(key, value); }
function clearCustomTheme() { ['--bg-base', '--bg-panel', '--bg-hover', '--bg-active', '--text-main', '--text-muted', '--accent', '--border', '--modal-bg'].forEach(p => htmlRoot.style.removeProperty(p)); }
function generateRandomTheme() {
    const h = Math.floor(Math.random() * 360), isDark = Math.random() > 0.4; 
    const lBase = isDark ? 10 : 90, lPanel = isDark ? 15 : 100, lHover = isDark ? 22 : 85, lActive = isDark ? 28 : 80, lText = isDark ? 95 : 15, lTextMuted = isDark ? 65 : 45;
    return {
        '--bg-base': `hsl(${h}, 15%, ${lBase}%)`, '--bg-panel': `hsl(${h}, 15%, ${lPanel}%)`, '--bg-hover': `hsl(${h}, 15%, ${lHover}%)`,
        '--bg-active': `hsl(${h}, 15%, ${lActive}%)`, '--text-main': `hsl(${h}, 10%, ${lText}%)`, '--text-muted': `hsl(${h}, 10%, ${lTextMuted}%)`,
        '--accent': `hsl(${(h + 160) % 360}, 85%, 60%)`, '--border': `hsl(${h}, 15%, ${lActive}%)`, '--modal-bg': `hsla(${h}, 20%, ${lBase}%, 0.9)`
    };
}
const randomNames = ["Nebula", "Quantum", "Plasma", "Supernova", "Void", "Aurora", "Eclipse", "Horizon", "Mirage", "Zenith"];

themeDropdown.addEventListener('change', (e) => {
    const val = e.target.value; appConfig.theme = val;
    if (val === 'random') {
        const newColors = generateRandomTheme(); appConfig.customColors = newColors; applyCustomTheme(newColors); htmlRoot.setAttribute('data-theme', 'custom');
        themeDropdown.querySelector('option[value="random"]').textContent = `Random (${randomNames[Math.floor(Math.random() * randomNames.length)]} ${Math.floor(Math.random() * 1000)})`;
    } else {
        clearCustomTheme(); appConfig.customColors = null; htmlRoot.setAttribute('data-theme', val); themeDropdown.querySelector('option[value="random"]').textContent = "Random Theme";
    }
    saveToDB('appConfig', appConfig);
});

// --- DATABASE ---
const DB_NAME = "MusicPlayerDB_Local_V10";
function initDB() {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = (e) => { db = e.target.result; db.createObjectStore('settings'); };
    req.onsuccess = (e) => { db = e.target.result; loadStoredData(); };
}
function loadStoredData() {
    const tx = db.transaction('settings', 'readonly');
    tx.objectStore('settings').get('appConfig').onsuccess = (e) => { 
        if (e.target.result) { 
            appConfig = { ...appConfig, ...e.target.result }; 
            if (appConfig.sidebarWidth) htmlRoot.style.setProperty('--sidebar-width', appConfig.sidebarWidth);
            if (appConfig.lastVolume !== undefined) { audioPlayer.volume = appConfig.lastVolume; volumeSlider.value = appConfig.lastVolume; updateRangeFill(volumeSlider); }
            if (appConfig.theme === 'random' && appConfig.customColors) { applyCustomTheme(appConfig.customColors); htmlRoot.setAttribute('data-theme', 'custom'); themeDropdown.value = 'random'; } 
            else if (appConfig.theme) { htmlRoot.setAttribute('data-theme', appConfig.theme); themeDropdown.value = appConfig.theme; }
            checkBackupReminder();
        } 
    };
    tx.objectStore('settings').get('sources').onsuccess = (e) => { if (e.target.result && e.target.result.length > 0) { sources = e.target.result; restoreBtn.classList.remove('hidden'); renderSidebarFolders(); } };
    tx.objectStore('settings').get('ratings').onsuccess = (e) => { if (e.target.result) songRatings = e.target.result; };
    tx.objectStore('settings').get('playlists').onsuccess = (e) => { if (e.target.result) playlists = e.target.result; renderSidebarPlaylists(); };
}
function saveToDB(key, data) { if(db) db.transaction('settings', 'readwrite').objectStore('settings').put(data, key); }
initDB();

// --- ADD SOURCES LOGIC ---
window.toggleAddMenu = function(e) { e.stopPropagation(); addSourceMenu.classList.toggle('show'); };
document.addEventListener('click', (e) => { if(!addSourceMenu.contains(e.target)) addSourceMenu.classList.remove('show'); });

window.addLocalFolder = async function() {
    addSourceMenu.classList.remove('show');
    if (window.showDirectoryPicker) {
        try {
            const handle = await window.showDirectoryPicker();
            const sourceId = 'src_' + Date.now();
            sources.push({ id: sourceId, name: handle.name, handle: handle, type: 'folder' });
            saveToDB('sources', sources); renderSidebarFolders();
            await extractFilesFromSource(sources[sources.length-1]); loadView(sourceId);
        } catch (err) {}
    } else { document.getElementById('fallbackFolderInput').click(); }
};

window.addLocalFiles = async function() {
    addSourceMenu.classList.remove('show');
    if (window.showOpenFilePicker) {
        try {
            const handles = await window.showOpenFilePicker({ multiple: true, types: [{ description: 'Audio', accept: {'audio/*': ['.mp3', '.wav', '.m4a', '.flac']} }] });
            if(handles.length === 0) return;
            let targetSrc = sources.find(s => s.id === 'src_single_files');
            if (targetSrc) {
                const existingNames = new Set(targetSrc.handle.map(h => h.name));
                const newHandles = handles.filter(h => !existingNames.has(h.name));
                targetSrc.handle.push(...newHandles);
            } else {
                targetSrc = { id: 'src_single_files', name: 'Single Files', handle: handles, type: 'files' };
                sources.push(targetSrc);
            }
            saveToDB('sources', sources); renderSidebarFolders();
            await extractFilesFromSource(targetSrc); loadView('src_single_files');
        } catch (err) {}
    } else { document.getElementById('fallbackFileInput').click(); }
};

document.getElementById('fallbackFolderInput').addEventListener('change', (e) => processFallbackFiles(Array.from(e.target.files), 'Folder'));
document.getElementById('fallbackFileInput').addEventListener('change', (e) => processFallbackFiles(Array.from(e.target.files), 'Files'));

function processFallbackFiles(files, type) {
    if(files.length === 0) return;
    let sourceId = 'src_' + Date.now();
    let srcName = 'Session Folder';
    if (type === 'Files') {
        sourceId = 'src_single_files';
        let targetSrc = sources.find(s => s.id === sourceId);
        if (!targetSrc) { targetSrc = { id: sourceId, name: 'Single Files', handle: null, type: 'session' }; sources.push(targetSrc); }
        srcName = targetSrc.name;
    } else { sources.push({ id: sourceId, name: srcName, handle: null, type: 'session' }); }
    
    files.forEach(f => { f.sourceId = sourceId; f.uniqueId = sourceId + '::' + f.name; });
    const existingIds = new Set(masterFiles.map(f => f.uniqueId));
    const newUnique = files.filter(f => !existingIds.has(f.uniqueId));
    masterFiles = [...masterFiles, ...newUnique].sort((a, b) => a.name.localeCompare(b.name));
    renderSidebarFolders(); loadView(sourceId);
}

restoreBtn.addEventListener('click', async () => {
    restoreBtn.textContent = "Loading..."; let loadedAny = false;
    let failedSources = [];
    
    for (let src of sources) {
        let verified = false;
        if (src.type === 'folder') verified = await verifyPermission(src.handle);
        else if (src.type === 'files') {
            verified = true;
            for (let h of src.handle) { if(!(await verifyPermission(h))) verified = false; }
        }
        if (verified) { await extractFilesFromSource(src); loadedAny = true; }
        else { failedSources.push(src.name); }
    }
    
    if (failedSources.length > 0) {
        alert(`Missing Directory Alert:\nCould not restore access to:\n- ${failedSources.join('\n- ')}\n\nThey may have been renamed or moved on your PC. Please remove and re-add them.`);
    }
    
    if (loadedAny) { restoreBtn.classList.add('hidden'); loadView('All Songs'); } else { restoreBtn.textContent = "↻ Restore Session"; }
});

async function verifyPermission(handle) {
    try {
        if ((await handle.queryPermission({mode: 'read'})) === 'granted') return true;
        if ((await handle.requestPermission({mode: 'read'})) === 'granted') return true;
    } catch(e) {}
    return false;
}

async function extractFilesFromSource(source) {
    let extracted = [];
    try {
        if (source.type === 'folder') {
            for await (const entry of source.handle.values()) {
                if (entry.kind === 'file') {
                    const file = await entry.getFile();
                    if (file.type.startsWith('audio/') || file.name.endsWith('.mp3') || file.name.endsWith('.m4a') || file.name.endsWith('.flac')) { 
                        file.sourceId = source.id; file.uniqueId = source.id + '::' + file.name; extracted.push(file); 
                    }
                }
            }
        } else if (source.type === 'files') {
            for (let h of source.handle) { 
                const file = await h.getFile(); file.sourceId = source.id; file.uniqueId = source.id + '::' + file.name; extracted.push(file); 
            }
        }
    } catch (err) { console.warn("Failed reading source", source.name); }
    
    const existingIds = new Set(masterFiles.map(f => f.uniqueId));
    const newUnique = extracted.filter(f => !existingIds.has(f.uniqueId));
    masterFiles = [...masterFiles, ...newUnique].sort((a, b) => a.name.localeCompare(b.name));
}

window.renameFolder = (id) => {
    const src = sources.find(f => f.id === id);
    if(src) { const newName = prompt("Rename source:", src.name); if(newName) { src.name = newName; saveToDB('sources', sources); renderSidebarFolders(); } }
};

window.deleteFolder = (id) => {
    if(confirm("Remove this source from your library?")) {
        sources = sources.filter(f => f.id !== id); masterFiles = masterFiles.filter(f => f.sourceId !== id);
        saveToDB('sources', sources); 
        if(currentActiveView === id) loadView('All Songs'); else { renderSidebarFolders(); loadView(currentActiveView); }
    }
};

function renderSidebarFolders() {
    folderSidebarList.innerHTML = '';
    sources.forEach(src => {
        const isFolder = src.type === 'folder' || src.type === 'session';
        const icon = isFolder ? `<path d="M10 4H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2h-8l-2-2z"/>` : `<path d="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z"/>`;
        const div = document.createElement('div'); div.className = 'sidebar-list-item';
        div.innerHTML = `
            <div class="nav-item ${currentActiveView === src.id ? 'active' : ''}" onclick="window.loadView('${src.id}')">
                <svg viewBox="0 0 24 24">${icon}</svg> ${src.name}
            </div>
            <div style="display:flex; gap:2px;">
                <button class="action-btn" onclick="window.renameFolder('${src.id}')" title="Rename"><svg viewBox="0 0 24 24" width="14" height="14"><path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04c.39-.39.39-1.02 0-1.41l-2.34-2.34c-.39-.39-1.02-.39-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"/></svg></button>
                <button class="action-btn action-btn-danger" onclick="window.deleteFolder('${src.id}')" title="Remove"><svg viewBox="0 0 24 24" width="14" height="14"><path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/></svg></button>
            </div>
        `;
        folderSidebarList.appendChild(div);
    });
}

// --- SEARCH FILTER ---
searchInput.addEventListener('input', (e) => {
    const term = e.target.value.toLowerCase();
    document.querySelectorAll('.track-item').forEach(item => {
        const title = item.querySelector('.track-title').textContent.toLowerCase();
        item.style.display = title.includes(term) ? 'flex' : 'none';
    });
});

// --- PLAYLIST MANAGEMENT & BATCH ACTIONS ---
document.getElementById('newPlaylistBtn').addEventListener('click', () => {
    const name = prompt("Playlist Name:");
    if (name) { playlists.push({ id: 'pl_' + Date.now(), name: name, tracks: [] }); saveToDB('playlists', playlists); renderSidebarPlaylists(); }
});

window.deletePlaylist = (id) => {
    if(confirm("Delete this playlist permanently?")) {
        playlists = playlists.filter(p => p.id !== id); saveToDB('playlists', playlists);
        if(currentActiveView === id) loadView('All Songs'); else renderSidebarPlaylists();
    }
};

function renderSidebarPlaylists() {
    playlistSidebarList.innerHTML = '';
    let opts = '<option value="">Add selected to...</option>';
    playlists.forEach(pl => {
        opts += `<option value="${pl.id}">${pl.name}</option>`;
        const div = document.createElement('div'); div.className = 'sidebar-list-item';
        div.innerHTML = `
            <div class="nav-item ${currentActiveView === pl.id ? 'active' : ''}" onclick="window.loadView('${pl.id}')">
                <svg viewBox="0 0 24 24"><path d="M15 6H3v2h12V6zm0 4H3v2h12v-2zM3 16h8v-2H3v2zM17 6v8.18c-.31-.11-.65-.18-1-.18-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3V8h3V6h-5z"/></svg> ${pl.name}
            </div>
            <button class="action-btn action-btn-danger" onclick="window.deletePlaylist('${pl.id}')" title="Delete Playlist"><svg viewBox="0 0 24 24" width="14" height="14"><path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/></svg></button>
        `;
        playlistSidebarList.appendChild(div);
    });
    batchPlaylistSelect.innerHTML = opts;
}

window.removeFromPlaylist = function(songId, plId) {
    const pl = playlists.find(p => p.id === plId);
    if(pl) {
        pl.tracks = pl.tracks.filter(t => t !== songId); saveToDB('playlists', playlists); showToast("Removed from playlist");
        if(currentActiveView === plId) loadView(plId);
    }
}

window.batchRemoveFromPlaylist = function() {
    const pl = playlists.find(p => p.id === currentActiveView);
    if(pl && selectedTracks.size > 0) {
        pl.tracks = pl.tracks.filter(t => !selectedTracks.has(t));
        saveToDB('playlists', playlists); showToast(`Removed ${selectedTracks.size} songs`); clearSelection(); loadView(currentActiveView);
    }
}

window.batchRemoveFromLibrary = function() {
    if(confirm(`Remove ${selectedTracks.size} songs from your library session?`)) {
        selectedTracks.forEach(songId => {
            masterFiles = masterFiles.filter(f => f.uniqueId !== songId);
            playlists.forEach(pl => {
                pl.tracks = pl.tracks.filter(t => t !== songId);
            });
        });
        saveToDB('playlists', playlists);
        showToast(`Removed ${selectedTracks.size} songs`); 
        clearSelection(); 
        loadView(currentActiveView);
    }
}

// --- BATCH SELECTION ---
window.handleTrackSelect = function(cb) {
    if (cb.checked) selectedTracks.add(cb.value); else selectedTracks.delete(cb.value);
    updateBatchActionBar();
}
function updateBatchActionBar() {
    if (selectedTracks.size > 0) { 
        batchActionBar.classList.add('visible'); batchCountText.textContent = `${selectedTracks.size} selected`; 
        batchRemoveBtn.classList.remove('hidden');
        if(currentActiveView.startsWith('pl_')) {
            batchRemoveBtn.textContent = "Remove from Playlist";
            batchRemoveBtn.onclick = batchRemoveFromPlaylist;
        } else {
            batchRemoveBtn.textContent = "Remove from Library";
            batchRemoveBtn.onclick = batchRemoveFromLibrary;
        }
    } else { 
        batchActionBar.classList.remove('visible'); document.querySelectorAll('.track-select-cb').forEach(c => c.checked = false); 
    }
}
window.clearSelection = function() { selectedTracks.clear(); updateBatchActionBar(); }

batchPlaylistSelect.addEventListener('change', (e) => {
    const plId = e.target.value; if (!plId) return;
    const pl = playlists.find(p => p.id === plId);
    if (pl) {
        let count = 0;
        selectedTracks.forEach(songId => { if (!pl.tracks.includes(songId)) { pl.tracks.push(songId); count++; } });
        saveToDB('playlists', playlists); e.target.value = ""; clearSelection();
        if(currentActiveView === plId) loadView(plId); showToast(`Added ${count} songs to ${pl.name}`);
    }
});

// --- MAIN VIEW RENDERING (CHUNKED FOR PERFORMANCE) ---
navAllSongs.addEventListener('click', () => loadView('All Songs'));
navSettings.addEventListener('click', () => loadView('Settings'));

window.loadView = function(viewId) {
    currentRenderToken++; // abort previous renders
    currentActiveView = viewId;
    navAllSongs.classList.toggle('active', viewId === 'All Songs');
    navSettings.classList.toggle('active', viewId === 'Settings');
    renderSidebarFolders(); renderSidebarPlaylists(); clearSelection(); 
    
    if (viewId === 'Settings') { mainSearchContainer.style.display = 'none'; renderSettingsView(); return; }
    mainSearchContainer.style.display = 'flex'; searchInput.value = '';

    if (viewId === 'All Songs') { viewTitle.textContent = "All Songs"; baseQueue = [...masterFiles]; } 
    else if (viewId.startsWith('src_')) {
        const src = sources.find(f => f.id === viewId);
        viewTitle.textContent = src ? src.name : "Source";
        baseQueue = masterFiles.filter(f => f.sourceId === viewId);
    } else if (viewId.startsWith('pl_')) {
        const pl = playlists.find(p => p.id === viewId);
        viewTitle.textContent = pl ? pl.name : "Playlist";
        // Map saved IDs back to file objects, tag missing ones
        baseQueue = pl ? pl.tracks.map(id => masterFiles.find(f => f.uniqueId === id) || { uniqueId: id, name: id.split('::')[1], missing: true }) : [];
    }
    viewSubtitle.textContent = `${baseQueue.length} Tracks`;
    renderCenterList(baseQueue, currentRenderToken);
    updateVisualHighlight();
};

function renderCenterList(queueToRender, token) {
    centerTrackList.innerHTML = '';
    if (queueToRender.length === 0) return;

    let plOptions = '<option value="">Add to...</option>' + playlists.map(pl => `<option value="${pl.id}">${pl.name}</option>`).join('');
    const isPlaylistView = currentActiveView.startsWith('pl_');

    // Chunked Rendering logic to prevent UI freeze on 10,000+ files
    let index = 0;
    const CHUNK_SIZE = 50;

    function renderChunk() {
        if (token !== currentRenderToken) return; // aborted by view change
        const fragment = document.createDocumentFragment();
        const end = Math.min(index + CHUNK_SIZE, queueToRender.length);
        
        for (; index < end; index++) {
            const song = queueToRender[index];
            const item = document.createElement('div');
            item.className = 'track-item' + (song.missing ? ' missing' : ''); 
            item.dataset.id = song.uniqueId;
            
            let rawName = song.name.replace(/\.[^/.]+$/, "");
            let rating = songRatings[song.uniqueId] || 5;
            let isChecked = selectedTracks.has(song.uniqueId);

            let removeBtnHtml = isPlaylistView 
                ? `<button class="action-btn action-btn-danger" onclick="window.removeFromPlaylist('${song.uniqueId}', '${currentActiveView}'); event.stopPropagation();" title="Remove from Playlist"><svg viewBox="0 0 24 24" width="16" height="16"><path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/></svg></button>` 
                : `<button class="action-btn action-btn-danger" onclick="window.removeSongFromLibrary('${song.uniqueId}'); event.stopPropagation();" title="Remove from Library"><svg viewBox="0 0 24 24" width="16" height="16"><path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/></svg></button>`;

            item.innerHTML = `
                <div style="display: flex; align-items: center;">
                    <input type="checkbox" class="track-select-cb" value="${song.uniqueId}" ${isChecked ? 'checked' : ''} onchange="window.handleTrackSelect(this)" onclick="event.stopPropagation()">
                </div>
                <div class="track-num">
                    <span class="t-num">${index + 1}</span>
                    <svg class="t-play" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>
                </div>
                <div class="track-info" onclick="${song.missing ? '' : `window.startPlaybackFromList('${song.uniqueId}', ${index})`}">
                    <span class="track-title">${rawName}</span>
                </div>
                <div class="track-actions">
                    ${removeBtnHtml}
                    <select class="select-mini" onchange="window.updateRating('${song.uniqueId}', this.value)" title="Shuffle Weight">
                        ${[1,2,3,4,5,6,7,8,9,10].map(i => `<option value="${i}" ${i==rating?'selected':''}>⭐ ${i}</option>`).join('')}
                    </select>
                    <select class="select-mini" onchange="window.addToPlaylist('${song.uniqueId}', this.value); this.value='';" title="Add to Playlist">
                        ${plOptions}
                    </select>
                </div>
            `;
            fragment.appendChild(item);
        }
        centerTrackList.appendChild(fragment);
        if (index < queueToRender.length) requestAnimationFrame(renderChunk);
    }
    requestAnimationFrame(renderChunk);
}

function renderSettingsView() {
    viewTitle.textContent = "Settings & Backup"; viewSubtitle.textContent = "Manage your player data";
    centerTrackList.innerHTML = `
        <div class="settings-card" style="border-color: var(--accent); background: rgba(29, 185, 84, 0.05);">
            <h3 style="margin-bottom: 8px; color: var(--text-main);">General Settings</h3>
            <div style="display:flex; justify-content:space-between; align-items:center;">
                <div>
                    <div style="font-weight:600; font-size:14px; color:var(--text-main);">Extract ID3 Metadata</div>
                    <div style="font-size:12px; color:var(--text-muted); margin-top:4px;">Read embedded Album Art, Track, and Artist names directly from MP3 files upon playback.</div>
                </div>
                <label class="switch">
                    <input type="checkbox" id="metadataToggle" ${appConfig.useMetadata ? 'checked' : ''}>
                    <span class="slider"></span>
                </label>
            </div>
        </div>
        <div class="settings-card">
            <h3 style="margin-bottom: 8px; color: var(--text-main);">Data Backup</h3>
            <p style="color: var(--text-muted); font-size: 14px; margin-bottom: 16px;">Export your custom playlists and song ratings to a JSON file to transfer between browsers or PCs. <br><br><b>Note:</b> You will still need to hit the + folder icon and load your music files locally after importing a backup for the songs to physically play!</p>
            <div style="display: flex; gap: 12px;">
                <button class="btn-small" id="exportDataBtn" style="background: var(--accent); color: var(--bg-base); border: none; font-size: 14px; padding: 10px 16px;">⬇ Export Backup (.json)</button>
                <button class="btn-small" id="importDataBtn" style="font-size: 14px; padding: 10px 16px;">⬆ Import Backup</button>
            </div>
        </div>
        <div class="settings-card" style="border-color: #ff4444; background: rgba(255,0,0,0.05);">
            <h3 style="margin-bottom: 8px; color: #ff4444;">Danger Zone</h3>
            <p style="color: var(--text-muted); font-size: 14px; margin-bottom: 16px;">Wipe all internal player data (ratings, playlists, saved folders).</p>
            <button class="btn-small" id="factoryResetBtn" style="border-color: #ff4444; color: #ff4444;">Wipe Data</button>
        </div>
    `;

    document.getElementById('metadataToggle').addEventListener('change', (e) => {
        appConfig.useMetadata = e.target.checked; saveToDB('appConfig', appConfig); showToast("Settings saved.");
    });

    document.getElementById('exportDataBtn').addEventListener('click', () => {
        appConfig.lastBackupTime = Date.now(); saveToDB('appConfig', appConfig);
        const data = { playlists, songRatings, appConfig };
        const blob = new Blob([JSON.stringify(data)], { type: "application/json" });
        const url = URL.createObjectURL(blob); const a = document.createElement('a');
        a.href = url; a.download = "local_player_backup.json"; a.click(); URL.revokeObjectURL(url);
        showToast("Backup exported!");
    });
    document.getElementById('importDataBtn').addEventListener('click', () => importBackupInput.click());
    document.getElementById('factoryResetBtn').addEventListener('click', () => {
        if(confirm("Are you SURE? This clears all playlists and ratings.")) { db.transaction('settings', 'readwrite').objectStore('settings').clear(); location.reload(); }
    });
}

importBackupInput.addEventListener('change', (e) => {
    const file = e.target.files[0]; if(!file) return; const reader = new FileReader();
    reader.onload = (ev) => {
        try {
            const data = JSON.parse(ev.target.result);
            if(data.playlists) { playlists = data.playlists; saveToDB('playlists', playlists); }
            if(data.songRatings) { songRatings = data.songRatings; saveToDB('ratings', songRatings); }
            if(data.appConfig) { 
                appConfig = data.appConfig; saveToDB('appConfig', appConfig); 
                if(appConfig.theme === 'random' && appConfig.customColors) { applyCustomTheme(appConfig.customColors); htmlRoot.setAttribute('data-theme', 'custom'); }
                else { htmlRoot.setAttribute('data-theme', appConfig.theme); themeDropdown.value = appConfig.theme; }
            }
            showToast("Backup imported successfully!"); loadView('All Songs');
        } catch(err) { alert("Invalid backup file."); }
    }; reader.readAsText(file);
});

window.updateRating = (id, val) => { songRatings[id] = parseInt(val); saveToDB('ratings', songRatings); showToast("Rating updated");};
window.addToPlaylist = (songId, plId) => {
    const pl = playlists.find(p => p.id === plId);
    if(pl && !pl.tracks.includes(songId)) { pl.tracks.push(songId); saveToDB('playlists', playlists); showToast(`Added to ${pl.name}`); }
};

window.removeSongFromLibrary = function(songId) {
    if(confirm("Remove this song from your library session?")) {
        masterFiles = masterFiles.filter(f => f.uniqueId !== songId);
        playlists.forEach(pl => {
            pl.tracks = pl.tracks.filter(t => t !== songId);
        });
        saveToDB('playlists', playlists);
        showToast("Song removed");
        loadView(currentActiveView);
    }
};

// --- PLAYBACK ENGINE ---
window.startPlaybackFromList = function(songId, visualIndex) {
    if (isShuffle) {
        const clickedSong = baseQueue.find(s => s.uniqueId === songId);
        let remaining = baseQueue.filter(s => s.uniqueId !== songId);
        let pool = []; remaining.forEach(song => { let weight = songRatings[song.uniqueId] || 5; for(let w=0; w<weight; w++) pool.push(song); });
        let shuffled = [];
        while(pool.length > 0) {
            let picked = pool[Math.floor(Math.random() * pool.length)];
            shuffled.push(picked); pool = pool.filter(s => s.uniqueId !== picked.uniqueId);
        }
        playQueue = [clickedSong, ...shuffled]; playQueueIndex = 0; 
        currentRenderToken++; renderCenterList(playQueue, currentRenderToken);
    } else {
        playQueue = [...baseQueue]; playQueueIndex = playQueue.findIndex(s => s.uniqueId === songId);
    }
    playActiveSong();
};

shuffleBtn.addEventListener('click', () => {
    if(baseQueue.length === 0) return;
    isShuffle = !isShuffle; shuffleBtn.classList.toggle('active', isShuffle);
    const currentSong = playQueue[playQueueIndex];
    if (isShuffle) {
        let remaining = baseQueue.filter(s => s !== currentSong);
        let pool = []; remaining.forEach(song => { let w = songRatings[song.uniqueId] || 5; for(let i=0; i<w; i++) pool.push(song); });
        let shuffled = [];
        while(pool.length > 0) {
            let picked = pool[Math.floor(Math.random() * pool.length)];
            shuffled.push(picked); pool = pool.filter(s => s.uniqueId !== picked.uniqueId);
        }
        playQueue = currentSong ? [currentSong, ...shuffled] : [...shuffled]; playQueueIndex = 0; 
        currentRenderToken++; renderCenterList(playQueue, currentRenderToken);
    } else {
        playQueue = [...baseQueue]; if(currentSong) playQueueIndex = playQueue.findIndex(s => s.uniqueId === currentSong.uniqueId);
        currentRenderToken++; renderCenterList(playQueue, currentRenderToken);
    }
    updateVisualHighlight();
});

// ID3 Tag Parser Promise wrapper
function extractMetadata(file) {
    return new Promise((resolve) => {
        if(!window.jsmediatags) { resolve(null); return; }
        jsmediatags.read(file, {
            onSuccess: function(tag) {
                let data = { title: tag.tags.title, artist: tag.tags.artist, art: null };
                if(tag.tags.picture) {
                    const picData = tag.tags.picture.data;
                    let base64String = "";
                    // Chunking to prevent stack overflow on large images
                    for (let i = 0; i < picData.length; i += 8192) { base64String += String.fromCharCode.apply(null, picData.slice(i, i + 8192)); }
                    data.art = "data:" + tag.tags.picture.format + ";base64," + window.btoa(base64String);
                }
                resolve(data);
            },
            onError: function() { resolve(null); }
        });
    });
}

async function playActiveSong() {
    const song = playQueue[playQueueIndex]; if(!song) return;
    
    // Active Error Catcher (if song is a placeholder from a missing directory)
    if (song.missing) {
        showToast(`File missing: ${song.name}. Skipping...`);
        setTimeout(playNext, 1500);
        return;
    }

    try {
        audioPlayer.src = URL.createObjectURL(song); 
        audioPlayer.play(); isPlaying = true;
        
        let rawName = song.name.replace(/\.[^/.]+$/, "");
        let displayTitle = rawName;
        let displayArtist = "Local Audio";
        if(rawName.includes(" - ")) { let parts = rawName.split(" - "); displayArtist = parts[0]; displayTitle = parts.slice(1).join(" - "); } 
        
        // Set basics immediately
        footerTitle.textContent = displayTitle; footerArtist.textContent = displayArtist; footerArt.innerHTML = `🎵`;
        
        // Parse Metadata if enabled
        if (appConfig.useMetadata) {
            const meta = await extractMetadata(song);
            if (meta) {
                if(meta.title) displayTitle = meta.title;
                if(meta.artist) displayArtist = meta.artist;
                if(meta.art) footerArt.innerHTML = `<img src="${meta.art}" style="width:100%; height:100%; object-fit:cover; border-radius:inherit;">`;
                footerTitle.textContent = displayTitle; footerArtist.textContent = displayArtist;
            }
        }
        
        footerArt.style.boxShadow = "0 4px 20px var(--accent)"; 
        updatePlayButtonUI(); updateVisualHighlight();

        // Set OS/Hardware Media Session
        if ('mediaSession' in navigator) {
            let artwork = footerArt.querySelector('img') ? [{ src: footerArt.querySelector('img').src, sizes: '512x512', type: 'image/jpeg' }] : [];
            navigator.mediaSession.metadata = new MediaMetadata({ title: displayTitle, artist: displayArtist, artwork: artwork });
            navigator.mediaSession.setActionHandler('play', togglePlay);
            navigator.mediaSession.setActionHandler('pause', togglePlay);
            navigator.mediaSession.setActionHandler('previoustrack', playPrev);
            navigator.mediaSession.setActionHandler('nexttrack', playNext);
        }
    } catch(err) {
        showToast("Error playing file. Skipping...");
        setTimeout(playNext, 1500);
    }
}

// Audio Error Catcher (corrupted file, or file deleted while app is open)
audioPlayer.addEventListener('error', () => {
    showToast("Playback error: File unreadable or missing. Skipping...");
    setTimeout(playNext, 1500);
});

function updateVisualHighlight() {
    const song = playQueue[playQueueIndex]; if(!song) return;
    const items = centerTrackList.querySelectorAll('.track-item');
    items.forEach(item => {
        if (item.dataset.id === song.uniqueId) {
            item.classList.add('playing');
            const rect = item.getBoundingClientRect(), containerRect = document.querySelector('.track-list-container').getBoundingClientRect();
            if(rect.top < containerRect.top || rect.bottom > containerRect.bottom) item.scrollIntoView({ behavior: 'smooth', block: 'center' });
        } else { item.classList.remove('playing'); }
    });
}

function playNext() {
    if (playQueue.length === 0) return;
    if (repeatMode === 2 && event && event.type === 'ended') { audioPlayer.currentTime = 0; audioPlayer.play(); return; }
    playQueueIndex++;
    if (playQueueIndex >= playQueue.length) { if (repeatMode === 1) playQueueIndex = 0; else { playQueueIndex--; return; } }
    playActiveSong();
}

function playPrev() {
    if (playQueue.length === 0) return;
    if (audioPlayer.currentTime > 3) { audioPlayer.currentTime = 0; return; }
    playQueueIndex--;
    if (playQueueIndex < 0) playQueueIndex = repeatMode === 1 ? playQueue.length - 1 : 0;
    playActiveSong();
}

function togglePlay() {
    if (playQueue.length === 0) return;
    isPlaying ? audioPlayer.pause() : audioPlayer.play();
    isPlaying = !isPlaying; updatePlayButtonUI();
}

function toggleMute() {
    audioPlayer.volume = audioPlayer.volume === 0 ? 1 : 0;
    volumeSlider.value = audioPlayer.volume; updateRangeFill(volumeSlider);
    appConfig.lastVolume = audioPlayer.volume; saveToDB('appConfig', appConfig);
}

function updatePlayButtonUI() {
    playIcon.classList.toggle('hidden', isPlaying); pauseIcon.classList.toggle('hidden', !isPlaying);
    footerArt.style.boxShadow = isPlaying ? "0 4px 20px rgba(29, 185, 84, 0.4)" : "0 4px 12px rgba(0,0,0,0.5)";
}

playBtn.addEventListener('click', togglePlay); nextBtn.addEventListener('click', playNext); prevBtn.addEventListener('click', playPrev);
repeatBtn.addEventListener('click', () => {
    repeatMode = (repeatMode + 1) % 3; repeatBtn.classList.toggle('active', repeatMode !== 0); repeatBtn.style.opacity = repeatMode === 0 ? '0.5' : '1';
});

audioPlayer.addEventListener('timeupdate', () => { if (!isDraggingProgress && audioPlayer.duration) updateProgressUI(); });
audioPlayer.addEventListener('loadedmetadata', () => totalTimeEl.textContent = formatTime(audioPlayer.duration));
audioPlayer.addEventListener('ended', playNext);

progressBar.addEventListener('input', () => {
    isDraggingProgress = true;
    if(audioPlayer.duration) { currentTimeEl.textContent = formatTime((progressBar.value / 100) * audioPlayer.duration); updateRangeFill(progressBar); }
});
progressBar.addEventListener('change', () => {
    isDraggingProgress = false;
    if(audioPlayer.duration) audioPlayer.currentTime = (progressBar.value / 100) * audioPlayer.duration; updateRangeFill(progressBar);
});

volumeSlider.addEventListener('input', (e) => { audioPlayer.volume = e.target.value; updateRangeFill(volumeSlider); });
volumeSlider.addEventListener('change', (e) => { appConfig.lastVolume = audioPlayer.volume; saveToDB('appConfig', appConfig); });
muteBtn.addEventListener('click', toggleMute);

function formatTime(s) {
    if(isNaN(s) || !isFinite(s)) return "0:00";
    const m = Math.floor(s/60), sec = Math.floor(s%60);
    return `${m}:${sec<10?'0':''}${sec}`;
}

updateRangeFill(progressBar); updateRangeFill(volumeSlider);
