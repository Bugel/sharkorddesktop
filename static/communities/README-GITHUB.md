# Hosting Communities on GitHub

To host the Communities page on GitHub for always-fresh data:

1. Copy `communities-for-github.html` to your [sharkordserverdb](https://github.com/Bugel/sharkordserverdb) repo
2. Rename it to `communities.html`
3. Place it in the repo root, next to `communities.json`

The desktop app loads: `https://cdn.jsdelivr.net/gh/Bugel/sharkordserverdb@main/communities.html`

The page fetches `communities.json` directly (same origin when served via jsDelivr), so updates appear immediately with no app caching.
