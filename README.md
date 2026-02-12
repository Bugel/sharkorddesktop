# Sharkord Desktop

Electron desktop app for [Sharkord](https://github.com/sharkord/sharkord). Use the Sharkord client outside the browser with a configurable server URL.

**Credits.** Sharkord is by [Diogo Martino](https://github.com/sharkord/sharkord). This desktop wrapper is unofficial and not affiliated with the Sharkord project.

**Fully portable:** All requirements can live in this directory. No global Node.js or npm needed after one-time setup.

---

## Portable setup (recommended)

**1. One-time setup** (downloads Node.js into this folder and installs dependencies):

```powershell
cd apps\desktop
.\setup-portable.bat
```

(Or `.\setup-portable.ps1` if your PowerShell allows scripts. If you get "running scripts is disabled", use the `.bat`.)

**2. Run the app** (any time; works after you copy the folder elsewhere too):

Double‑click **`run.bat`** or in a terminal:

```powershell
.\run.bat
```

(Use `run.bat` so you don't need to enable PowerShell scripts. `run.ps1` does the same thing but requires script execution allowed.)

After setup, the folder contains:

- **`node\`** – Node.js runtime (portable)
- **`node_modules\`** – npm dependencies
- **`dist\`** – built app

You can copy the whole **`apps\desktop`** folder (or the whole repo) to another PC and run **`run.ps1`** or **`run.bat`** there without installing Node globally.

---

## If you already have Node/npm

From this directory:

```bash
npm install
npm run dev
```

Or from repo root: **`npm run desktop`**.

---

## Building an EXE (Windows)

To create a standalone executable you can share (no Node needed on the other PC):

**Option A – Double‑click (portable setup)**  
1. Run **`setup-portable.bat`** once if you haven’t already.  
2. Double‑click **`pack.bat`**.  
3. When it finishes, open the **`out`** folder. You’ll get:
   - **Portable EXE:** `out\Sharkord X.X.X.exe` – single file, no installer.
   - **Installer:** `out\Sharkord X.X.X Setup.exe` – NSIS installer.

**Option B – Command line**  
From `apps\desktop` (with Node on your PATH):

```powershell
npm install
npm run build
npm run pack
```

Output is in **`out\`**. On macOS you get a DMG; on Linux, an AppImage. (untested)

### If the build fails with "Cannot create symbolic link" (Windows)

The pack step downloads a code-signing helper that contains symlinks. Windows blocks creating symlinks unless you have extra rights. Use **one** of these:

1. **Enable Developer Mode** (recommended):  
   **Settings → Privacy & security → For developers → Developer Mode** → turn On. Then run `pack.bat` (or `npm run pack`) again.

2. **Run as Administrator**:  
   Right‑click **Command Prompt** or **PowerShell** → **Run as administrator**, `cd` to this folder, then run `pack.bat` or `npm run pack`.

---


## Credits

- **[Sharkord](https://github.com/sharkord/sharkord)** — self-hosted voice, video, and text chat. Created by **Diogo Martino**.
- This desktop app is an unofficial wrapper. Sharkord itself runs in the browser; this app provides a standalone window and server list.

---

## App usage

The app opens the Sharkord demo server by default (`https://demo.sharkord.com`). Change the server URL via **Server URL…** in the application menu (or `Ctrl+,` / `Cmd+,`).
