# Server search database

This folder defines the JSON format for the community server database. To host it on GitHub:

1. Create a new repo (or use an existing one).
2. Add a `servers.json` file with this structure:

```json
{
  "servers": [
    {
      "name": "Server display name",
      "url": "https://example.sharkord.com",
      "description": "Short description shown on the card"
    }
  ]
}
```

3. Get the raw URL: `https://raw.githubusercontent.com/YOUR_USER/YOUR_REPO/main/servers.json`
4. In `communities/test.html`, set `SERVER_DB_URL` to that URL.
