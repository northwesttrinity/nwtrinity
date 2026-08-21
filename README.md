# Northwest Trinity — artist site

A static, no-build site: plain HTML/CSS/JS. That keeps GitHub + Cloudflare
Pages deployment simple, and Chromecast working out of the box.

## Structure

```
index.html
css/styles.css
js/tracks.js      ← track list data (titles, durations, file paths)
js/player.js      ← local playback + persistent player bar
js/cast.js        ← Google Cast (Chromecast) integration
assets/audio/     ← put your MP3 files here (see the .txt note inside)
assets/icons/     ← favicon
_headers          ← Cloudflare Pages headers (CORS + caching for audio)
```

## 1. Add your music

Drop MP3 files into `assets/audio/` using the filenames listed in
`js/tracks.js` (or edit that file to match your own filenames/titles/
durations). MP3 is recommended — it's what Chromecast's built-in
receiver supports most reliably.

## 2. Push to GitHub

```bash
cd timberline-site
git init
git add .
git commit -m "Initial site"
git branch -M main
git remote add origin https://github.com/<your-username>/<your-repo>.git
git push -u origin main
```

## 3. Deploy on Cloudflare Pages

1. Cloudflare dashboard → **Workers & Pages** → **Create** → **Pages** →
   **Connect to Git**.
2. Select the GitHub repo you just pushed.
3. Build settings: this is a static site, so leave the **build command**
   empty and set the **output directory** to `/` (root).
4. Deploy. Cloudflare gives you a `*.pages.dev` URL immediately; attach
   a custom domain afterward under the project's **Custom domains** tab.

Cloudflare Pages serves everything over HTTPS automatically, which is
required for Chromecast — casting will not work on plain HTTP or on a
locally-opened `file://` page.

## 4. Chromecast notes

The site uses Google's Cast Sender SDK with the **default media
receiver** (`chrome.cast.media.DEFAULT_MEDIA_RECEIVER_APP_ID`), so
there's no receiver app to register or configure — the Cast button
just appears automatically in Chrome/Edge on desktop and in the
Chrome/Android app once the SDK detects a Cast-capable browser.

- The Cast button (in the tracklist rows and the bottom player bar)
  only becomes visible once the SDK reports Cast is available — it's
  hidden by default so the UI doesn't show a dead button on
  unsupported browsers (e.g. Safari, Firefox, iOS Chrome).
- Casting requires the audio file to be reachable at a public URL,
  which only works after deployment — not when testing by opening
  `index.html` directly from disk.

## 5. Visitor & play counters (optional backend)

The site can show a site-wide visit count and a per-track play count, but
this requires a small Worker + KV backend on top of the static files —
it's optional and the site looks complete without it (the counter
elements just stay hidden until the backend responds).

**Files involved:** `src/index.js` (the Worker), `wrangler.toml`
(configuration + KV bindings), `.assetsignore` (keeps the Worker's own
source out of the public site), `package.json` (so the build can install
Wrangler), and `js/counters.js` on the frontend.

This project uses Cloudflare's newer **Workers with static assets**
architecture rather than the older separate Pages product — the two look
similar in the dashboard but behave differently, so the steps below are
specific to this setup.

1. **Create two KV namespaces.** In the Cloudflare dashboard, go to
   **Storage & Databases → KV → Create a namespace**. Create two:
   one for visits (e.g. `timberline-visitors`) and one for play counts
   (e.g. `timberline-plays`). Copy each namespace's ID.

2. **Fill in `wrangler.toml`.**
   - Set `name` to the exact project name shown in your Cloudflare
     dashboard for this project (Workers & Pages → your project). A
     mismatch here fails the build.
   - Paste the visitor namespace ID into the `VISITOR_COUNT` binding's
     `id`, and the play-counts namespace ID into `TRACK_PLAYS`'s `id`.

3. **Confirm the deploy command.** In the project's
   **Settings → Builds & deployments**, the Deploy command should be
   `npx wrangler deploy` (this is the default for a Worker with static
   assets). If it's set to `wrangler pages deploy` from an older
   template, change it — that command is for the separate Pages
   product and will fail here.

4. **Push everything** (`src/index.js`, `wrangler.toml`, `.assetsignore`,
   `package.json`, plus the rest of the site) to your GitHub repo.
   Cloudflare will rebuild.

5. **Verify the build actually picked up the bindings.** Open the build
   log for that deployment and confirm it lists both KV bindings —
   a build can report "success" while silently not applying a
   configuration change, so don't just trust the green checkmark.

6. **Check the live site.** The visit count appears in the footer, and
   "N plays" labels appear next to each track, once `/api/hit` and
   `/api/plays` respond successfully. If they don't show up, open your
   browser's Network tab and check those two requests directly — the
   frontend is designed to fail silently, so a missing counter usually
   means one of those requests is erroring, not that something crashed.

## 6. Editing content

- **Track list / audio**: `js/tracks.js`. Durations there are just a
  placeholder/fallback — the site automatically reads each file's real
  length from its own metadata once it's reachable, so you don't need
  to type durations in by hand. If a track shows `--:--`, that usually
  means the audio file at its `src` path isn't in place yet.
- **Bio / about text**: the `.about-text` paragraph in `index.html`
- **Colors / type**: CSS custom properties at the top of
  `css/styles.css` (`:root { ... }`)
- **Contact email**: the `mailto:` link in the footer of `index.html`

## Local preview

Any static server works, e.g.:

```bash
npx serve .
```

(Note: Chromecast itself won't function against `localhost` — test
casting after deploying to Cloudflare Pages.)
