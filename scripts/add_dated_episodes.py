#!/usr/bin/env python3
"""Add the archive's dated, unnumbered recordings to docs/episodes.json.

From March 2016 Polskie Radio stopped titling archive items "Odcinek nr:
####" and instead filed broadcast recordings as e.g. "W Jezioranach 6 marca
godz. 13:15" - no episode number anywhere on the page. scrape_episodes.py
skips those. This script numbers them from explicit anchors: within a
segment, every Sunday is one episode, counted from a known (date, number)
pair.

That weekly assumption doesn't hold in general - some Sundays had no new
episode (e.g. 01.01.2023) - so a segment is only listed in SEGMENTS once its
numbering has been confirmed against an outside source, and the script
refuses to write anything if a segment has a Sunday with no recording (or
two recordings), rather than silently mislabelling.

Usage:
    python scripts/add_dated_episodes.py
"""

from __future__ import annotations

import datetime as dt
import re
import sys
import time
from urllib.parse import urljoin

from bs4 import BeautifulSoup

from scrape_episodes import (
    ARCHIVE_PAGE_URL,
    BASE_URL,
    REQUEST_DELAY_SECONDS,
    fetch,
    load_audioless,
    load_existing_episodes,
    parse_article,
    save_audioless,
    save_episodes,
)

# (first air date, its episode number, last air date to include).
# 2016: anchored by an outside listing - #2833 03.01.2016, #2842 06.03.2016,
#       #2884 25.12.2016, #2885 01.01.2017 - so no skipped Sundays in 2016.
# 2022: counted back from "W Jezioranach - odcinek 3189" (04.12.2022); every
#       Sunday from 13.02 to 27.11.2022 has a recording or an article, so
#       none were skipped. End date chosen to fill one player group of 25.
SEGMENTS = [
    ("2016-03-06", 2842, "2016-07-03"),
    ("2022-02-13", 3147, "2022-07-31"),
]

# Dated articles with no audio and no date on the page, so they can't be
# placed automatically: episode number -> article URL.
UNDATED_AUDIOLESS: dict[int, str] = {}

DATED_TITLE_RE = re.compile(r"^(W )?Jeziora\w* \d{1,2} \w+ godz", re.IGNORECASE)
LAST_ARCHIVE_PAGE = 14  # first page holding dated recordings, counting from the newest


def list_dated_links() -> list[str]:
    urls: list[str] = []
    for page in range(LAST_ARCHIVE_PAGE, 0, -1):
        soup = BeautifulSoup(fetch(ARCHIVE_PAGE_URL.format(page=page)), "html.parser")
        for link in soup.select("a[href*='/Artykul/']"):
            title = (link.get("title") or link.get_text(strip=True)).strip()
            url = urljoin(BASE_URL, link["href"])
            if DATED_TITLE_RE.match(title) and url not in urls:
                urls.append(url)
        time.sleep(REQUEST_DELAY_SECONDS)
    return urls


def main() -> None:
    episodes_by_number = load_existing_episodes()
    audioless = load_audioless()
    known_urls = {ep["article_url"] for ep in episodes_by_number.values()}

    segments = [
        (dt.date.fromisoformat(start), number, dt.date.fromisoformat(end))
        for start, number, end in SEGMENTS
    ]
    by_slot: dict[int, list[dict]] = {}

    urls = list_dated_links()
    print(f"Found {len(urls)} dated recordings in the archive listing")
    for url in urls:
        if url in known_urls:
            continue
        details = parse_article(url)
        time.sleep(REQUEST_DELAY_SECONDS)
        if details is None or not details["date"]:
            continue
        aired = dt.date.fromisoformat(details["date"])
        for start, number, end in segments:
            if start <= aired <= end:
                weeks, rest = divmod((aired - start).days, 7)
                if rest:
                    sys.exit(f"{url} aired {aired}, not on a Sunday of its segment - stopping")
                by_slot.setdefault(number + weeks, []).append({**details, "article_url": url})

    # Every Sunday of every segment must have exactly one recording (or be a
    # known audio-less article); otherwise the numbering can't be trusted.
    problems = []
    for start, number, end in segments:
        for weeks in range((end - start).days // 7 + 1):
            num = number + weeks
            found = by_slot.get(num, [])
            if num in episodes_by_number:
                continue
            if len(found) > 1:
                problems.append(f"#{num}: {len(found)} recordings on the same Sunday")
            elif not found and num not in UNDATED_AUDIOLESS:
                problems.append(f"#{num} ({start + dt.timedelta(weeks=weeks)}): no recording")
    if problems:
        sys.exit("Not writing anything:\n  " + "\n  ".join(problems))

    for num, found in sorted(by_slot.items()):
        details = found[0]
        episodes_by_number[num] = {
            "episode": num,
            "title": f"Odcinek nr: {num}",
            "date": details["date"],
            "article_url": details["article_url"],
            "mp3_url": details["mp3_url"],
        }
        print(f"  + episode {num} ({details['date']})")
    audioless.update(UNDATED_AUDIOLESS)

    save_episodes(episodes_by_number)
    save_audioless(audioless, episodes_by_number)
    print(f"Saved {len(episodes_by_number)} episode(s)")


if __name__ == "__main__":
    main()
