# W Jezioranach - Archive Player

An unofficial, static player for archived episodes of *W Jezioranach*, a
long-running radio drama produced by Polskie Radio (Teatr Polskiego Radia).

Episodes are listed in correct chronological order, and the "Next"/"Previous"
buttons actually move forward/backward in time - unlike the official
polskieradio.pl article player, whose "next episode" button navigates to an
*older* episode instead of a newer one.

**This project does not host, mirror, or redistribute any audio.** The site
only links to and streams MP3 files directly from Polskie Radio's own
servers (`static.prsa.pl`). Copyright for the recordings belongs to
Polskie Radio S.A.; see their
[terms](https://www.polskieradio.pl/357/7291).

## How it works

- [`scripts/scrape_episodes.py`](scripts/scrape_episodes.py) crawls the
  public archive listing (`polskieradio.pl/357/7291/Strona/{N}`), visits
  each episode's article page, and extracts the episode number, air date,
  and MP3 stream URL. The stream URL doesn't require JavaScript rendering -
  it's already present in the server-rendered HTML inside a `data-media={...}`
  JSON attribute used by the site's own player widget.
- Results are written to [`docs/episodes.json`](docs/episodes.json).
- [`docs/index.html`](docs/index.html) + [`docs/player.js`](docs/player.js)
  read that JSON file and render a simple list + HTML5 `<audio>` player,
  sorted ascending by episode number (oldest first).

## Running the scraper

```bash
pip install -r requirements.txt
python scripts/scrape_episodes.py --start 25 --end 28
```

`--start`/`--end` are archive page numbers (`/357/7291/Strona/{N}`). Lower
page numbers list newer episodes; higher page numbers list older ones. The
script always appends new episodes to `docs/episodes.json` - it never
overwrites existing entries - so it can be re-run later with a different
page range to extend the archive incrementally. Output is de-duplicated by
episode number and kept sorted.

## Running the site locally

```bash
python -m http.server 8000 --directory docs
```

Then open http://localhost:8000.

## Deploying to GitHub Pages

The site lives entirely in the [`docs/`](docs) folder, so it can be
published without a separate branch:

1. Push this repository to GitHub.
2. In the repo settings, go to **Pages**.
3. Under **Build and deployment**, set **Source** to "Deploy from a branch",
   pick the `main` branch, and select the `/docs` folder.
4. Save. The site will be published at
   `https://<username>.github.io/<repo>/`.

This is a small, family-only project and isn't meant to be discovered or
shared publicly. [`docs/robots.txt`](docs/robots.txt) asks crawlers not to
index it, and `index.html` also carries a `<meta name="robots"
content="noindex, nofollow">` tag as a second line of defense. Note that
neither of these makes the site private - the repo and the published page
are both still publicly reachable by anyone with the link, since GitHub
Pages doesn't support access control on the free plan. Share the URL only
with people you want to have it.
