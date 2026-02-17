<img width="1920" height="1079" alt="{D37853BC-7D1C-40D5-A88D-4BDF79C7FF3A}" src="https://github.com/user-attachments/assets/4c978e5f-b125-446f-9d51-e9ee729de913" />
<img width="1920" height="1080" alt="{51AF5157-1C2F-4C29-81CE-539127E17CEF}" src="https://github.com/user-attachments/assets/9f625854-b371-4d83-91ed-1e7026fa7ad7" />
<img width="223" height="148" alt="{9886215C-1340-4934-AC81-C2ED634408EB}" src="https://github.com/user-attachments/assets/7f9d10c4-5fa8-49e1-87fc-9c9edc8181fd" />
<img width="859" height="631" alt="{F25AFCF5-9AE3-4B7C-A825-D29DD1079E03}" src="https://github.com/user-attachments/assets/aa8a47e6-148d-4cc8-907e-022d0c3f2bd5" />



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

Output is in **`out\`**. On macOS you get a DMG; on Linux, an AppImage.

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
