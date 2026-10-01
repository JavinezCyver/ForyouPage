(() => {
  const audio = document.getElementById("letter-music");
  if (!audio) return;

  const choose = document.getElementById("choose-music");
  const input = document.getElementById("music-file");
  const name = document.getElementById("music-name");
  const status = document.getElementById("music-status");
  const list = document.getElementById("music-playlist");
  const preload = document.createElement("audio");
  preload.preload = "auto";
  let database = null;
  const tracks = [];
  let currentIndex = 0;
  let playingVideo = null;
  let resumeAfterVideo = false;
  let editingPlaylist = false;
  audio.volume = 0.3;
  audio.loop = false;

  function openStorage() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open("foryou-letter-music", 1);
      request.onupgradeneeded = () => request.result.createObjectStore("tracks", { keyPath: "id" });
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
      request.onblocked = () => reject(new Error("Music storage is busy."));
    });
  }

  function readPlaylist() {
    return new Promise((resolve, reject) => {
      const request = database.transaction("tracks", "readonly").objectStore("tracks").get("letter");
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  function savePlaylist(playlist = tracks) {
    return new Promise((resolve, reject) => {
      const transaction = database.transaction("tracks", "readwrite");
      transaction.objectStore("tracks").put({ id: "letter", files: playlist.map((track) => track.file) });
      transaction.oncomplete = resolve;
      transaction.onerror = () => reject(transaction.error);
      transaction.onabort = () => reject(transaction.error || new Error("Music could not be saved."));
    });
  }

  function validateAudio(url) {
    const probe = document.createElement("audio");
    return new Promise((resolve, reject) => {
      const cleanup = () => {
        clearTimeout(timeout);
        probe.removeEventListener("loadedmetadata", loaded);
        probe.removeEventListener("error", failed);
        probe.removeAttribute("src");
        probe.load();
      };
      const loaded = () => { cleanup(); resolve(); };
      const failed = () => { cleanup(); reject(new Error("Unsupported audio.")); };
      const timeout = setTimeout(failed, 15000);
      probe.addEventListener("loadedmetadata", loaded, { once: true });
      probe.addEventListener("error", failed, { once: true });
      probe.preload = "metadata";
      probe.src = url;
      probe.load();
    });
  }

  function updatePlaylist() {
    list.replaceChildren();
    tracks.forEach((track, index) => {
      const item = document.createElement("li");
      const row = document.createElement("div");
      row.className = "music-track";
      const button = document.createElement("button");
      button.type = "button";
      button.className = "music-track-play";
      button.textContent = track.file.name;
      button.setAttribute("aria-current", String(index === currentIndex));
      button.addEventListener("click", () => playTrack(index));
      const remove = document.createElement("button");
      remove.type = "button";
      remove.className = "music-remove";
      remove.textContent = "Remove";
      remove.setAttribute("aria-label", `Remove ${track.file.name}`);
      remove.disabled = editingPlaylist;
      remove.addEventListener("click", () => removeTrack(track));
      row.append(button, remove);
      item.append(row);
      list.append(item);
    });
    list.hidden = !tracks.length;
    if (tracks.length) name.textContent = `Song ${currentIndex + 1} of ${tracks.length}: ${tracks[currentIndex].file.name}`;
    else name.textContent = "Add three or more songs to set the mood.";
  }

  function preloadNextTrack() {
    const next = tracks[(currentIndex + 1) % tracks.length];
    const nextUrl = tracks.length > 1 ? next.url : null;
    if (nextUrl === preload.getAttribute("src")) return;
    preload.removeAttribute("src");
    if (nextUrl) preload.src = nextUrl;
    preload.load();
  }

  function attachTrack(index) {
    audio.pause();
    currentIndex = index;
    audio.src = tracks[index].url;
    audio.hidden = false;
    audio.load();
    updatePlaylist();
    preloadNextTrack();
  }

  async function tryPlaying() {
    if (playingVideo) { resumeAfterVideo = true; return false; }
    try { await audio.play(); return true; } catch { return false; }
  }

  async function playTrack(index) {
    if (!tracks.length) return;
    attachTrack(index);
    const playing = await tryPlaying();
    status.textContent = playing
      ? "Songs play in order automatically, then the playlist repeats."
      : playingVideo ? "Music will resume after your video." : "Press play to start the playlist. The following songs will play automatically.";
  }

  async function removeTrack(track) {
    if (editingPlaylist || !tracks.includes(track)) return;
    editingPlaylist = true;
    choose.disabled = true;
    updatePlaylist();
    status.textContent = "Removing song...";
    let removedIndex = -1;
    try {
      const remaining = tracks.filter((entry) => entry !== track);
      // Save first so a failed write leaves both the playlist and current playback intact.
      if (database) await savePlaylist(remaining);
      const currentTrack = tracks[currentIndex];
      const shouldResume = !audio.paused || resumeAfterVideo;
      removedIndex = tracks.indexOf(track);
      tracks.splice(removedIndex, 1);
      if (!tracks.length) {
        audio.pause();
        audio.removeAttribute("src");
        audio.load();
        audio.hidden = true;
        preload.removeAttribute("src");
        preload.load();
        resumeAfterVideo = false;
        currentIndex = 0;
        updatePlaylist();
      } else if (currentTrack === track) {
        attachTrack(removedIndex % tracks.length);
        if (shouldResume) await tryPlaying();
      } else {
        currentIndex = tracks.indexOf(currentTrack);
        updatePlaylist();
        preloadNextTrack();
      }
      URL.revokeObjectURL(track.url);
      status.textContent = `Song removed. ${database ? "Playlist saved in this browser." : "This change is available for this visit only."}${tracks.length ? "" : " Add songs to start a new playlist."}`;
    } catch {
      status.textContent = "The song could not be removed from browser storage. Your playlist is unchanged; please try again.";
    } finally {
      editingPlaylist = false;
      choose.disabled = false;
      updatePlaylist();
      if (removedIndex >= 0) {
        const nextRemove = list.querySelectorAll(".music-remove")[Math.min(removedIndex, tracks.length - 1)];
        (nextRemove || choose).focus();
      }
    }
  }

  audio.addEventListener("ended", () => {
    if (tracks.length) playTrack((currentIndex + 1) % tracks.length);
  });
  audio.addEventListener("error", () => {
    status.textContent = "This song could not be played. Choose another song in the playlist or add a supported audio file.";
  });

  choose.addEventListener("click", () => input.click());
  input.addEventListener("change", async () => {
    if (editingPlaylist) return;
    const files = Array.from(input.files || []);
    if (!files.length) return;
    input.value = "";
    choose.disabled = true;
    editingPlaylist = true;
    updatePlaylist();
    status.textContent = "Preparing your songs...";
    const wasEmpty = !tracks.length;
    let added = 0;
    let skipped = 0;
    for (const file of files) {
      if (!file.type.startsWith("audio/")) { skipped += 1; continue; }
      const url = URL.createObjectURL(file);
      try {
        await validateAudio(url);
        tracks.push({ file, url });
        added += 1;
      } catch {
        URL.revokeObjectURL(url);
        skipped += 1;
      }
    }
    if (added) {
      let playing = !audio.paused;
      if (wasEmpty) {
        attachTrack(0);
        playing = await tryPlaying();
      } else {
        updatePlaylist();
        preloadNextTrack();
      }
      let saved = false;
      if (database) {
        try { await savePlaylist(); saved = true; } catch { /* Keep the playlist for this visit. */ }
      }
      status.textContent = `${added} ${added === 1 ? "song added" : "songs added"}. ${saved ? "Playlist saved in this browser." : "Available for this visit; browser storage could not save it."} ${playing ? "The next song plays automatically." : "Press play to start, then songs advance automatically."}`;
    } else {
      status.textContent = "No songs were added. Choose playable audio files such as MP3, M4A, or WAV.";
    }
    if (skipped) status.textContent += ` ${skipped} unsupported or unreadable ${skipped === 1 ? "file was" : "files were"} skipped.`;
    choose.disabled = false;
    editingPlaylist = false;
    updatePlaylist();
  });

  // Keep the letter music from competing with album video sound.
  const viewer = document.getElementById("album-viewer");
  if (viewer) {
    viewer.addEventListener("play", (event) => {
      if (event.target.tagName !== "VIDEO") return;
      resumeAfterVideo = resumeAfterVideo || !audio.paused;
      playingVideo = event.target;
      audio.pause();
    }, true);
    const resumeMusic = (event) => {
      if (event.target !== playingVideo) return;
      playingVideo = null;
      if (resumeAfterVideo) { resumeAfterVideo = false; tryPlaying(); }
    };
    viewer.addEventListener("pause", resumeMusic, true);
    viewer.addEventListener("ended", resumeMusic, true);
    viewer.addEventListener("close", () => {
      playingVideo = null;
      if (resumeAfterVideo) { resumeAfterVideo = false; tryPlaying(); }
    });
  }

  (async () => {
    try {
      database = await openStorage();
      const saved = await readPlaylist();
      // Preserve the single song saved by the previous music player.
      const files = saved?.files || (saved?.file ? [saved.file] : []);
      files.forEach((file) => tracks.push({ file, url: URL.createObjectURL(file) }));
      if (tracks.length) await playTrack(0);
    } catch {
      database = null;
      status.textContent = "You can add songs for this visit. Browser storage is unavailable.";
    } finally {
      choose.disabled = false;
    }
  })();
})();
