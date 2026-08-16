// Player for the "W Jezioranach" archive.
//
// Episodes in episodes.json are pre-sorted ascending by episode number by
// the scraper. We treat ascending episode number as "forward in time":
// index 0 is the oldest episode, the last index is the newest.
//
// The official polskieradio.pl article player has a "next episode" button
// that actually navigates to an OLDER episode (a known bug on their site).
// Here "Next" always moves to a higher episode number (forward) and
// "Previous" always moves to a lower episode number (backward).

(function () {
  "use strict";

  const audio = document.getElementById("audio-player");
  const nowPlayingTitle = document.getElementById("now-playing-title");
  const nowPlayingDate = document.getElementById("now-playing-date");
  const prevBtn = document.getElementById("prev-btn");
  const nextBtn = document.getElementById("next-btn");
  const episodeListEl = document.getElementById("episode-list");
  const episodeCountEl = document.getElementById("episode-count");
  const searchBox = document.getElementById("search-box");

  let episodes = [];
  let currentIndex = -1;

  const STORAGE_KEY = "wjezioranach:lastEpisode";

  function formatDate(isoDate) {
    if (!isoDate) return "";
    const [year, month, day] = isoDate.split("-");
    return `${day}.${month}.${year}`;
  }

  function renderList(filterText) {
    const query = (filterText || "").trim().toLowerCase();
    episodeListEl.innerHTML = "";

    const filtered = episodes.filter((ep, idx) => {
      if (!query) return true;
      return (
        String(ep.episode).includes(query) ||
        (ep.date || "").includes(query) ||
        formatDate(ep.date).includes(query)
      );
    });

    episodeCountEl.textContent = `${filtered.length} / ${episodes.length} odcinków`;

    for (const ep of filtered) {
      const idx = episodes.indexOf(ep);
      const li = document.createElement("li");
      li.className = "episode-item";
      li.dataset.index = String(idx);
      if (idx === currentIndex) li.classList.add("active");

      const number = document.createElement("span");
      number.className = "episode-number";
      number.textContent = `#${ep.episode}`;

      const date = document.createElement("span");
      date.className = "episode-date";
      date.textContent = formatDate(ep.date);

      const link = document.createElement("a");
      link.className = "episode-article-link";
      link.href = ep.article_url;
      link.target = "_blank";
      link.rel = "noopener";
      link.textContent = "artykuł";
      link.addEventListener("click", (e) => e.stopPropagation());

      li.appendChild(number);
      li.appendChild(date);
      li.appendChild(link);

      li.addEventListener("click", () => playEpisode(idx));
      episodeListEl.appendChild(li);
    }
  }

  function updateActiveListItem() {
    for (const li of episodeListEl.children) {
      li.classList.toggle("active", Number(li.dataset.index) === currentIndex);
    }
  }

  function playEpisode(index, autoplay = true) {
    if (index < 0 || index >= episodes.length) return;
    currentIndex = index;
    const ep = episodes[index];

    nowPlayingTitle.textContent = String(ep.episode);
    nowPlayingDate.textContent = formatDate(ep.date);

    audio.src = ep.mp3_url;
    if (autoplay) {
      audio.play().catch(() => {
        // Autoplay can be blocked by the browser; user can press play manually.
      });
    }

    prevBtn.disabled = index <= 0;
    nextBtn.disabled = index >= episodes.length - 1;

    localStorage.setItem(STORAGE_KEY, String(ep.episode));
    updateActiveListItem();

    const activeLi = episodeListEl.querySelector(`[data-index="${index}"]`);
    if (activeLi) activeLi.scrollIntoView({ block: "nearest" });
  }

  function playNext() {
    playEpisode(currentIndex + 1);
  }

  function playPrevious() {
    playEpisode(currentIndex - 1);
  }

  function findStartIndex() {
    const savedEpisode = Number(localStorage.getItem(STORAGE_KEY));
    if (savedEpisode) {
      const idx = episodes.findIndex((ep) => ep.episode === savedEpisode);
      if (idx !== -1) return idx;
    }
    return 0;
  }

  async function init() {
    const response = await fetch("episodes.json", { cache: "no-store" });
    episodes = await response.json();
    episodes.sort((a, b) => a.episode - b.episode);

    renderList("");

    const startIndex = findStartIndex();
    playEpisode(startIndex, false);

    prevBtn.addEventListener("click", playPrevious);
    nextBtn.addEventListener("click", playNext);
    audio.addEventListener("ended", playNext);
    searchBox.addEventListener("input", () => renderList(searchBox.value));
  }

  init();
})();
