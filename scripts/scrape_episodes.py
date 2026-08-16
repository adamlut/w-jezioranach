#!/usr/bin/env python3
"""Crawl the Polskie Radio "W Jezioranach" archive and build docs/episodes.json.

The archive listing at https://www.polskieradio.pl/357/7291/Strona/{N} shows
~30 episodes per page as links to individual article pages. The article page
does not need JavaScript rendering: the MP3 stream URL is already present in
the server-rendered HTML, embedded in a `data-media={...}` JSON blob used by
the site's own player widget (e.g. `data-media={"file":"//static.prsa.pl/...
.mp3", ...}`). We only stream/link to that URL - no audio is downloaded or
copied into this repository.

Usage:
    python scripts/scrape_episodes.py --start 25 --end 28

Running the script again with a different --start/--end range APPENDS newly
found episodes to docs/episodes.json instead of overwriting it, so the
archive can be extended incrementally. Episodes are de-duplicated by episode
number and the file is always re-sorted into chronological (ascending
episode number) order before being written back.
"""

from __future__ import annotations

import argparse
import json
import re
import sys
import time
from pathlib import Path
from urllib.parse import urljoin

import requests
from bs4 import BeautifulSoup

BASE_URL = "https://www.polskieradio.pl"
ARCHIVE_PAGE_URL = f"{BASE_URL}/357/7291/Strona/{{page}}"
EPISODES_JSON_PATH = Path(__file__).resolve().parent.parent / "docs" / "episodes.json"

HEADERS = {"User-Agent": "Mozilla/5.0 (compatible; WJezioranyArchiveBot/1.0)"}
REQUEST_DELAY_SECONDS = 0.5

EPISODE_NUMBER_RE = re.compile(r"Odcinek nr:\s*(\d+)")
DATA_MEDIA_RE = re.compile(r"data-media=(\{[^{}]*\})")
DATE_RE = re.compile(r'id="datetime\d+"[^>]*>\s*(\d{2})\.(\d{2})\.(\d{4})')


def fetch(url: str) -> str:
    resp = requests.get(url, headers=HEADERS, timeout=30)
    resp.raise_for_status()
    return resp.text


def list_episode_links(page_number: int) -> list[dict]:
    """Return [{"episode": int, "article_url": str}, ...] for one archive page."""
    html = fetch(ARCHIVE_PAGE_URL.format(page=page_number))
    soup = BeautifulSoup(html, "html.parser")

    episodes = []
    for link in soup.select("a[href*='/Artykul/']"):
        text = link.get_text(strip=True)
        match = EPISODE_NUMBER_RE.search(text)
        if not match:
            continue
        episodes.append(
            {
                "episode": int(match.group(1)),
                "article_url": urljoin(BASE_URL, link["href"]),
            }
        )
    return episodes


def parse_article(article_url: str) -> dict | None:
    """Extract title, air date, and mp3 stream URL from an article page."""
    html = fetch(article_url)

    media_match = DATA_MEDIA_RE.search(html)
    if not media_match:
        print(f"  WARNING: no audio player data found on {article_url}", file=sys.stderr)
        return None

    try:
        media = json.loads(media_match.group(1))
    except json.JSONDecodeError:
        print(f"  WARNING: could not parse audio player data on {article_url}", file=sys.stderr)
        return None

    mp3_url = media.get("file", "")
    if mp3_url.startswith("//"):
        mp3_url = "https:" + mp3_url

    date_match = DATE_RE.search(html)
    date_iso = None
    if date_match:
        day, month, year = date_match.groups()
        date_iso = f"{year}-{month}-{day}"

    title_match = re.search(r"data-article-title=['\"]([^'\"]+)['\"]", html)
    title = title_match.group(1) if title_match else None

    return {"title": title, "date": date_iso, "mp3_url": mp3_url}


def load_existing_episodes() -> dict[int, dict]:
    if not EPISODES_JSON_PATH.exists():
        return {}
    data = json.loads(EPISODES_JSON_PATH.read_text(encoding="utf-8"))
    return {ep["episode"]: ep for ep in data}


def save_episodes(episodes_by_number: dict[int, dict]) -> None:
    ordered = [episodes_by_number[num] for num in sorted(episodes_by_number)]
    EPISODES_JSON_PATH.parent.mkdir(parents=True, exist_ok=True)
    EPISODES_JSON_PATH.write_text(
        json.dumps(ordered, ensure_ascii=False, indent=2), encoding="utf-8"
    )


def crawl(start_page: int, end_page: int) -> None:
    step = 1 if end_page >= start_page else -1
    pages = range(start_page, end_page + step, step)

    episodes_by_number = load_existing_episodes()
    print(f"Loaded {len(episodes_by_number)} existing episode(s) from {EPISODES_JSON_PATH}")

    for page in pages:
        print(f"Archive page {page}...")
        links = list_episode_links(page)
        time.sleep(REQUEST_DELAY_SECONDS)

        for link in links:
            episode_number = link["episode"]
            if episode_number in episodes_by_number:
                continue

            details = parse_article(link["article_url"])
            time.sleep(REQUEST_DELAY_SECONDS)
            if details is None or not details["mp3_url"]:
                continue

            episodes_by_number[episode_number] = {
                "episode": episode_number,
                "title": details["title"] or f"Odcinek nr: {episode_number}",
                "date": details["date"],
                "article_url": link["article_url"],
                "mp3_url": details["mp3_url"],
            }
            print(f"  + episode {episode_number} ({details['date']})")

    save_episodes(episodes_by_number)
    print(f"Saved {len(episodes_by_number)} episode(s) to {EPISODES_JSON_PATH}")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--start", type=int, required=True, help="First archive page to crawl")
    parser.add_argument("--end", type=int, required=True, help="Last archive page to crawl (inclusive)")
    args = parser.parse_args()

    crawl(args.start, args.end)


if __name__ == "__main__":
    main()
