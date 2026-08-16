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
//
// Instead of one long scrolling list, episodes are chunked into fixed-size
// groups (e.g. "#2371-#2395") shown as tiles on a landing grid. Picking a
// tile opens that group's episode list; a "Powrot" button returns to the
// grid. The group containing the currently playing episode is kept open
// automatically, so navigation always lands you back in context. Searching
// works across all episodes regardless of which group is open, and clears
// once an episode is picked so the view settles back into that episode's
// group.
//
// Playback controls (play/pause, +/-10s skip, seek bar, time, download) are
// custom-built rather than the native <audio controls> UI. iOS Safari
// renders native audio controls with its own fixed OS-level widget that
// largely ignores CSS sizing, so it couldn't be made to match the rest of
// the design. The <audio> element itself stays in the DOM (hidden) purely
// as a playback engine, driven entirely through its JS API.
//
// The download button fetches the mp3 into memory and saves it as a blob
// URL rather than linking straight to it, because a plain <a download>
// only gets to rename cross-origin files (this one is served from
// static.prsa.pl, not our own origin) for same-origin/blob/data URLs -
// otherwise browsers ignore the suggested filename. That's the only way to
// reliably get the "w-jezioranach-####.mp3" naming.

(function () {
  "use strict";

  const GROUP_SIZE = 25;
  const STORAGE_KEY = "wjezioranach:lastEpisode";

  const SKIP_SECONDS = 10;

  const audio = document.getElementById("audio-player");
  const playPauseBtn = document.getElementById("play-pause-btn");
  const iconPlay = document.getElementById("icon-play");
  const iconPause = document.getElementById("icon-pause");
  const skipBackBtn = document.getElementById("skip-back-btn");
  const skipForwardBtn = document.getElementById("skip-forward-btn");
  const seekBar = document.getElementById("seek-bar");
  const currentTimeEl = document.getElementById("current-time");
  const durationTimeEl = document.getElementById("duration-time");
  const downloadBtn = document.getElementById("download-btn");
  const downloadLabel = document.getElementById("download-label");
  const nowPlayingTitle = document.getElementById("now-playing-title");
  const nowPlayingDate = document.getElementById("now-playing-date");
  const prevBtn = document.getElementById("prev-btn");
  const nextBtn = document.getElementById("next-btn");
  const groupGridEl = document.getElementById("group-grid");
  const groupDetailEl = document.getElementById("group-detail");
  const backBtn = document.getElementById("back-btn");
  const episodeListEl = document.getElementById("episode-list");
  const episodeCountEl = document.getElementById("episode-count");
  const searchBox = document.getElementById("search-box");

  let episodes = [];
  let groups = []; // [{ startIndex, endIndex, startEpisode, endEpisode }]
  let currentIndex = -1;
  let activeGroupIndex = -1; // -1 means "show the groups grid"
  let isSeeking = false;

  function formatDate(isoDate) {
    if (!isoDate) return "";
    const [year, month, day] = isoDate.split("-");
    return `${day}.${month}.${year}`;
  }

  function formatTime(totalSeconds) {
    if (!isFinite(totalSeconds) || totalSeconds < 0) return "0:00";
    const total = Math.floor(totalSeconds);
    const hours = Math.floor(total / 3600);
    const minutes = Math.floor((total % 3600) / 60);
    const seconds = total % 60;
    const ss = String(seconds).padStart(2, "0");
    if (hours > 0) return `${hours}:${String(minutes).padStart(2, "0")}:${ss}`;
    return `${minutes}:${ss}`;
  }

  function buildGroups() {
    const result = [];
    for (let i = 0; i < episodes.length; i += GROUP_SIZE) {
      const startIndex = i;
      const endIndex = Math.min(i + GROUP_SIZE, episodes.length) - 1;
      result.push({
        startIndex,
        endIndex,
        startEpisode: episodes[startIndex].episode,
        endEpisode: episodes[endIndex].episode,
      });
    }
    return result;
  }

  function groupIndexForEpisodeIndex(index) {
    return groups.findIndex((g) => index >= g.startIndex && index <= g.endIndex);
  }

  function matchesQuery(ep, query) {
    return (
      String(ep.episode).includes(query) ||
      (ep.date || "").includes(query) ||
      formatDate(ep.date).includes(query)
    );
  }

  function currentViewMode(query) {
    if (query) return "search";
    return activeGroupIndex === -1 ? "groups" : "group";
  }

  function renderGroupGrid() {
    groupGridEl.innerHTML = "";
    groups.forEach((g, idx) => {
      const tile = document.createElement("button");
      tile.type = "button";
      tile.className = "group-tile";
      if (idx === activeGroupIndex) tile.classList.add("active");

      const range = document.createElement("span");
      range.className = "group-tile-range";
      range.textContent = `${g.startEpisode}–${g.endEpisode}`;

      const count = document.createElement("span");
      count.className = "group-tile-count";
      count.textContent = `${g.endIndex - g.startIndex + 1} odcinków`;

      tile.appendChild(range);
      tile.appendChild(count);
      tile.addEventListener("click", () => {
        activeGroupIndex = idx;
        render();
      });
      groupGridEl.appendChild(tile);
    });
  }

  function renderEpisodeItems(list) {
    episodeListEl.innerHTML = "";
    for (const ep of list) {
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

  function render() {
    const query = searchBox.value.trim().toLowerCase();
    const view = currentViewMode(query);

    groupGridEl.hidden = view !== "groups";
    groupDetailEl.hidden = view === "groups";
    backBtn.hidden = view !== "group";

    if (view === "groups") {
      renderGroupGrid();
      episodeCountEl.textContent = `${episodes.length} odcinków`;
      return;
    }

    if (view === "search") {
      const results = episodes.filter((ep) => matchesQuery(ep, query));
      renderEpisodeItems(results);
      episodeCountEl.textContent = `${results.length} / ${episodes.length} odcinków`;
      return;
    }

    // view === "group"
    const g = groups[activeGroupIndex];
    const groupEpisodes = episodes.slice(g.startIndex, g.endIndex + 1);
    renderEpisodeItems(groupEpisodes);
    episodeCountEl.textContent = `${groupEpisodes.length} / ${episodes.length} odcinków`;
  }

  function playEpisode(index, autoplay = true) {
    if (index < 0 || index >= episodes.length) return;
    currentIndex = index;
    const ep = episodes[index];

    nowPlayingTitle.textContent = String(ep.episode);
    nowPlayingDate.textContent = formatDate(ep.date);

    seekBar.value = 0;
    seekBar.max = 0;
    currentTimeEl.textContent = "0:00";
    durationTimeEl.textContent = "0:00";

    if ("mediaSession" in navigator) {
      navigator.mediaSession.metadata = new MediaMetadata({
        title: `Odcinek nr ${ep.episode}`,
        artist: "W Jezioranach",
      });
    }

    audio.src = ep.mp3_url;
    if (autoplay) {
      audio.play().catch(() => {
        // Autoplay can be blocked by the browser; user can press play manually.
      });
    }

    prevBtn.disabled = index <= 0;
    nextBtn.disabled = index >= episodes.length - 1;

    localStorage.setItem(STORAGE_KEY, String(ep.episode));

    // Settle the view on the group that contains the newly playing episode.
    activeGroupIndex = groupIndexForEpisodeIndex(index);
    if (searchBox.value) searchBox.value = "";
    render();

    const activeLi = episodeListEl.querySelector(`[data-index="${index}"]`);
    if (activeLi) activeLi.scrollIntoView({ block: "nearest" });
  }

  function playNext() {
    playEpisode(currentIndex + 1);
  }

  function playPrevious() {
    playEpisode(currentIndex - 1);
  }

  function skip(deltaSeconds) {
    if (!isFinite(audio.duration)) return;
    audio.currentTime = Math.min(Math.max(audio.currentTime + deltaSeconds, 0), audio.duration);
  }

  async function downloadCurrentEpisode() {
    if (currentIndex < 0 || downloadBtn.disabled) return;
    const ep = episodes[currentIndex];
    const filename = `w-jezioranach-${ep.episode}.mp3`;

    downloadBtn.disabled = true;
    downloadBtn.classList.add("is-downloading");
    downloadLabel.textContent = "Pobieranie...";

    try {
      // A plain <a download> only gets to name cross-origin files like this
      // one for same-origin/blob/data URLs - browsers ignore the suggested
      // name otherwise. Fetching the file ourselves and downloading it as a
      // blob URL (same-origin by definition) is what actually lets us set
      // the "w-jezioranach-####.mp3" filename.
      const response = await fetch(ep.mp3_url);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const blob = await response.blob();
      const blobUrl = URL.createObjectURL(blob);

      const link = document.createElement("a");
      link.href = blobUrl;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(blobUrl);
    } catch (err) {
      // Fall back to a plain navigation so the user can still save the file
      // manually, just without the custom filename.
      window.open(ep.mp3_url, "_blank", "noopener");
    } finally {
      downloadBtn.disabled = false;
      downloadBtn.classList.remove("is-downloading");
      downloadLabel.textContent = "Pobierz";
    }
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
    groups = buildGroups();

    const startIndex = findStartIndex();
    playEpisode(startIndex, false);

    prevBtn.addEventListener("click", playPrevious);
    nextBtn.addEventListener("click", playNext);
    audio.addEventListener("ended", playNext);
    backBtn.addEventListener("click", () => {
      activeGroupIndex = -1;
      render();
    });
    searchBox.addEventListener("input", () => render());

    playPauseBtn.addEventListener("click", () => {
      if (audio.paused) audio.play().catch(() => {});
      else audio.pause();
    });
    audio.addEventListener("play", () => {
      iconPlay.hidden = true;
      iconPause.hidden = false;
      playPauseBtn.setAttribute("aria-label", "Pauza");
    });
    audio.addEventListener("pause", () => {
      iconPlay.hidden = false;
      iconPause.hidden = true;
      playPauseBtn.setAttribute("aria-label", "Odtwórz");
    });
    audio.addEventListener("loadedmetadata", () => {
      seekBar.max = Math.floor(audio.duration) || 0;
      durationTimeEl.textContent = formatTime(audio.duration);
    });
    audio.addEventListener("timeupdate", () => {
      if (isSeeking) return;
      seekBar.value = Math.floor(audio.currentTime);
      currentTimeEl.textContent = formatTime(audio.currentTime);
    });
    seekBar.addEventListener("pointerdown", () => {
      isSeeking = true;
    });
    seekBar.addEventListener("pointerup", () => {
      isSeeking = false;
    });
    seekBar.addEventListener("input", () => {
      const value = Number(seekBar.value);
      audio.currentTime = value;
      currentTimeEl.textContent = formatTime(value);
    });

    skipBackBtn.addEventListener("click", () => skip(-SKIP_SECONDS));
    skipForwardBtn.addEventListener("click", () => skip(SKIP_SECONDS));
    downloadBtn.addEventListener("click", downloadCurrentEpisode);

    if ("mediaSession" in navigator) {
      navigator.mediaSession.setActionHandler("play", () => audio.play().catch(() => {}));
      navigator.mediaSession.setActionHandler("pause", () => audio.pause());
      navigator.mediaSession.setActionHandler("previoustrack", playPrevious);
      navigator.mediaSession.setActionHandler("nexttrack", playNext);
      navigator.mediaSession.setActionHandler("seekbackward", () => skip(-SKIP_SECONDS));
      navigator.mediaSession.setActionHandler("seekforward", () => skip(SKIP_SECONDS));
    }
  }

  init();
})();
