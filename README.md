# Release Checklist

A shared checklist that the whole team uses for each release. Everyone who opens the page sees the same list, and changes sync every few seconds.

## Run

```bash
node server.js            # http://localhost:3000  (Node 18+, no npm install needed)
PORT=8080 node server.js  # custom port
```

The server listens on `0.0.0.0`, so teammates can open `http://<your-ip>:3000`.

## How it works

- **+ Create release** asks for a name. The release date is set automatically to today and shown next to the name.
- **One release per day**: the button is disabled once today's release exists, and the server rejects a second one.
- A new release **copies the task list from the most recent release, with every checkbox cleared**.
- Each release is saved as its own JSON file: `data/releases/YYYY-MM-DD.json`.
- Tasks: check or uncheck them (the page records who checked each one and when), click a task to edit it, and use ↑/↓ to reorder or ✕ to delete. Double-click the release title to rename it.
- Enter your name in the header so your name appears on the tasks you check.
