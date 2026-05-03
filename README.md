# Connections

A self-contained NYT Connections clone. No backend, no build step, no framework — just three files and a JSON puzzle list.

**Bookmarkable URL:** `[https://rossmessing.github.io/connections/](https://rossmessing.github.io/connections/)`

---

## How to play

Select 4 words that share a common theme, then tap **Submit**. You get 4 mistakes before the game ends. Words are organised by difficulty:

| Colour | Tier |
|--------|------|
| 🟨 Yellow | Easiest |
| 🟩 Green  | Medium  |
| 🟦 Blue   | Hard    |
| 🟪 Purple | Hardest |

---

## Adding puzzles

Edit **`puzzles.json`**. Each puzzle is one JSON object in the array:

```json
{
  "id": "puzzle-003",
  "title": "Optional flavour text shown above the grid (use null to omit)",
  "groups": [
    { "category": "Category label", "tier": 0, "words": ["W1", "W2", "W3", "W4"] },
    { "category": "Category label", "tier": 1, "words": ["W1", "W2", "W3", "W4"] },
    { "category": "Category label", "tier": 2, "words": ["W1", "W2", "W3", "W4"] },
    { "category": "Category label", "tier": 3, "words": ["W1", "W2", "W3", "W4"] }
  ]
}
```

**Rules:**
- Each puzzle needs exactly **4 groups × 4 words = 16 unique words**.
- Tiers: `0` = Yellow, `1` = Green, `2` = Blue, `3` = Purple.
- The `id` must be **unique** across all puzzles. Changing an `id` resets saved progress for that puzzle (the old save is orphaned in localStorage).
- Puzzles appear in the order they are listed in the file.

---

## Running locally (for testing before pushing)

Because `puzzles.json` is loaded via `fetch()`, browsers block it when you open `index.html` directly as a `file://` URL. Start a quick local server instead:

```bash
# Python 3 (built in to macOS)
python3 -m http.server 8000

# then open http://localhost:8000 in your browser
```

---

## Deploying to GitHub Pages

**Suggested repo name:** `connections`

### Steps

1. **Create the repo** at [github.com/new](https://github.com/new)
   - Owner: `rossmessing`
   - Repository name: `connections`
   - Visibility: **Public** (required for free-plan GitHub Pages)
   - Do *not* initialise with a README.

2. **Push this repo:**

   ```bash
   git remote add origin https://github.com/rossmessing/connections.git
   git branch -M main
   git push -u origin main
   ```

3. **Enable GitHub Pages:**
   - Go to **Settings → Pages**
   - Under *Build and deployment*, set Source to **Deploy from a branch**
   - Branch: **main** · folder: **/ (root)**
   - Click **Save**

4. **Wait ~1 minute**, then visit:

   ```
   https://rossmessing.github.io/connections/
   ```

   Bookmark that URL.

### Adding new puzzles after deploy

```bash
# 1. edit puzzles.json
# 2. commit and push
git add puzzles.json
git commit -m "add puzzle: <title>"
git push
```

GitHub Pages redeploys automatically within about a minute.

---

## File structure

```
index.html      ← app shell (no logic)
style.css       ← all styles and animations
game.js         ← all game logic; localStorage schema at the top
puzzles.json    ← edit this to add puzzles
README.md       ← you are here
.gitignore
```
