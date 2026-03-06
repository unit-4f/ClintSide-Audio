# Streamless 🎵

> A sleek local music player that lives entirely in your browser. Zero uploads, zero telemetry, just your music.

Streamless is an advanced, client-side audio player built with Vanilla JavaScript. It leverages the modern File System Access API to read your local audio files and folders directly from your hard drive without ever uploading a single byte to a server. 

## ✨ Features

* **📂 True Local Playback:** Read entire directories of `.mp3`, `.wav`, `.m4a`, and `.flac` files directly from your machine.
* **🏷️ ID3 Metadata Extraction:** Automatically extracts and displays embedded album art, track names, and artist info.
* **🎨 Custom Themes:** Choose from 9+ built-in themes (Dark, Dracula, Nord, Matcha, etc.) or generate a random custom color palette.
* **🗂️ Playlist Management:** Create custom playlists, drag-to-resize your sidebar, and manage your library with bulk-selection tools.
* **💾 Persistent Sessions:** Your theme preferences, playlists, and song ratings are securely saved to your browser's IndexedDB.
* **⌨️ Keyboard Shortcuts:** Full media control via Spacebar, Arrow keys, and Mute shortcuts.
* **📦 Export/Import Backups:** Easily backup your playlists and ratings to a local `.json` file to transfer between browsers.

## 🚀 How to Use

Since Streamless is 100% client-side, there is no server setup or build process required.

1. Clone or download this repository.
2. Open `index.html` in any modern web browser (Chromium-based browsers like Chrome, Edge, or Brave are recommended for full File System API support).
3. Click the **+** icon next to "Library Sources" in the sidebar to grant the browser read-access to your local music folder.
4. Enjoy your music!

*Note: Due to browser security sandboxing, mobile browsers do not support local directory reading. This app is designed for desktop environments.*

## 🛠️ Built With

* **HTML5 / CSS3** - For a responsive, modern UI.
* **Vanilla JavaScript** - No bloated frameworks.
* **[jsmediatags](https://github.com/aadsm/jsmediatags)** - For client-side ID3 tag reading.
* **File System Access API** - For secure, local folder mounting.
* **IndexedDB** - For robust, in-browser database storage.

## 🔒 Privacy

Your files remain yours. This application does not contain any tracking, analytics, or external server calls. Audio files are read directly into browser memory and are **never** uploaded.

## 📜 License

Distributed under the MIT License. See `LICENSE` for more information.
