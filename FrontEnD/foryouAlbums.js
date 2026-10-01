(() => {
  const viewer = document.getElementById("album-viewer");
  if (!viewer) return;

  const stage = document.getElementById("gallery-stage");
  const counter = document.getElementById("photo-counter");
  const title = document.getElementById("album-viewer-title");
  const previous = document.getElementById("previous-photo");
  const next = document.getElementById("next-photo");
  const viewerAdd = document.getElementById("viewer-add");
  const viewerRemove = document.getElementById("viewer-remove");
  const status = document.getElementById("album-status");
  const viewerStatus = document.getElementById("viewer-status");
  const albums = new Map();
  let database = null;
  let activeId = null;
  let mediaIndex = 0;
  let generation = 0;
  let pointerStart = null;
  const photoCache = new WeakMap();

  function announce(message) {
    status.textContent = message;
    viewerStatus.textContent = message;
  }

  function openDatabase() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open("foryou-photo-albums", 1);
      request.onupgradeneeded = () => request.result.createObjectStore("albums", { keyPath: "id" });
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
      request.onblocked = () => reject(new Error("Photo storage is busy."));
    });
  }

  function loadSavedAlbums() {
    return new Promise((resolve, reject) => {
      const request = database.transaction("albums", "readonly").objectStore("albums").getAll();
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  function saveAlbum(album) {
    return new Promise((resolve, reject) => {
      const transaction = database.transaction("albums", "readwrite");
      transaction.objectStore("albums").put({ id: album.id, files: album.items.map((photo) => photo.file) });
      transaction.oncomplete = resolve;
      transaction.onerror = () => reject(transaction.error);
      transaction.onabort = () => reject(transaction.error || new Error("Photo storage was interrupted."));
    });
  }

  function isVideo(item) {
    return item.file.type.startsWith("video/");
  }

  function cachedPhoto(item, priority = "low") {
    if (!photoCache.has(item)) {
      const image = new Image();
      image.fetchPriority = priority;
      image.src = item.url;
      image.draggable = false;
      photoCache.set(item, image);
      // Decode ahead of navigation; display errors are reported only for the active item.
      image.decode().catch(() => {});
    }
    const image = photoCache.get(item);
    if (priority === "high") image.fetchPriority = "high";
    return image;
  }

  function preloadAlbum(album) {
    album.items.forEach((item) => {
      if (!isVideo(item)) cachedPhoto(item);
    });
  }

  function preloadNearby(album, index) {
    album.items.slice(Math.max(0, index - 2), index + 3).forEach((item) => {
      if (!isVideo(item)) cachedPhoto(item, "high");
    });
  }

  function makeMedia(item, index, count) {
    if (isVideo(item)) {
      const video = document.createElement("video");
      video.className = "gallery-image gallery-video";
      video.controls = true;
      video.playsInline = true;
      video.preload = "metadata";
      video.src = item.url;
      video.setAttribute("aria-label", `Video ${index + 1} of ${count}: ${item.file.name}`);
      return video;
    }
    const image = cachedPhoto(item, "high");
    image.className = "gallery-image";
    image.alt = `Photo ${index + 1} of ${count}: ${item.file.name}`;
    return image;
  }

  function readyMedia(media) {
    if (media.tagName !== "VIDEO") return media.decode();
    if (media.readyState >= 1) return Promise.resolve();
    return new Promise((resolve, reject) => {
      const cleanup = () => {
        clearTimeout(timeout);
        media.removeEventListener("loadedmetadata", loaded);
        media.removeEventListener("error", failed);
      };
      const loaded = () => { cleanup(); resolve(); };
      const failed = () => { cleanup(); reject(new Error("Unsupported or unreadable video.")); };
      const timeout = setTimeout(failed, 15000);
      media.addEventListener("loadedmetadata", loaded, { once: true });
      media.addEventListener("error", failed, { once: true });
      media.load();
    });
  }

  function releaseMedia(media) {
    if (media.tagName === "VIDEO") {
      media.pause();
      media.removeAttribute("src");
      media.load();
    }
  }

  function clearStage() {
    stage.querySelectorAll("video").forEach(releaseMedia);
    stage.replaceChildren();
  }

  function updateCover(album) {
    const count = album.items.length;
    const videos = album.items.filter(isVideo).length;
    const photos = count - videos;
    const labels = [];
    if (photos) labels.push(`${photos} ${photos === 1 ? "photo" : "photos"}`);
    if (videos) labels.push(`${videos} ${videos === 1 ? "video" : "videos"}`);
    album.card.querySelector("[data-count]").textContent = labels.join(" · ") || "0 items";
    const cover = album.card.querySelector("[data-cover]");
    cover.querySelectorAll("video").forEach(releaseMedia);
    if (!count) {
      const symbol = document.createElement("span");
      symbol.setAttribute("aria-hidden", "true");
      symbol.textContent = album.id === "1" || album.id === "4" ? "\u2661" : "\u2747";
      const caption = document.createElement("p");
      caption.textContent = "Add your memories";
      cover.className = "photo-placeholder";
      cover.replaceChildren(symbol, caption);
      return;
    }
    const item = album.items[0];
    // Covers use separate elements so a cached gallery photo can stay in the viewer.
    const media = isVideo(item) ? makeMedia(item, 0, count) : new Image();
    if (!isVideo(item)) media.src = item.url;
    media.className = "album-cover-media";
    if (isVideo(item)) {
      media.controls = false;
      media.muted = true;
      media.setAttribute("aria-hidden", "true");
    } else {
      media.alt = `Cover of Album ${album.id}`;
    }
    cover.className = "album-cover";
    cover.replaceChildren(media);
    if (isVideo(item)) {
      const badge = document.createElement("span");
      badge.className = "video-badge";
      badge.textContent = "Video";
      cover.append(badge);
    }
  }

  function updateControls() {
    const album = albums.get(activeId);
    const count = album ? album.items.length : 0;
    previous.disabled = album?.loading || mediaIndex <= 0 || !count;
    next.disabled = album?.loading || mediaIndex >= count - 1 || !count;
    viewerAdd.disabled = !album || album.loading;
    viewerRemove.disabled = !album || album.loading || !count || stage.getAttribute("aria-busy") === "true";
    counter.textContent = count ? `${mediaIndex + 1} / ${count}` : "0 items";
  }

  function renderMedia() {
    const token = ++generation;
    const album = albums.get(activeId);
    if (album && album.items.length) {
      const media = makeMedia(album.items[mediaIndex], mediaIndex, album.items.length);
      stage.querySelectorAll("video").forEach((video) => video.pause());
      stage.setAttribute("aria-busy", "true");
      viewerStatus.textContent = `Loading ${isVideo(album.items[mediaIndex]) ? "video" : "photo"} ${mediaIndex + 1}…`;
      if (!stage.querySelector(".gallery-image")) {
        const loading = document.createElement("p");
        loading.className = "gallery-empty";
        loading.textContent = "Loading your memory…";
        stage.replaceChildren(loading);
      }
      preloadNearby(album, mediaIndex);
      // Preserve the visible photo while loading. Rapid navigation always wins over older requests.
      readyMedia(media).then(() => {
        if (token !== generation || !viewer.open) {
          if (!media.isConnected) releaseMedia(media);
          return;
        }
        clearStage();
        stage.replaceChildren(media);
        stage.setAttribute("aria-busy", "false");
        viewerStatus.textContent = "";
        updateControls();
      }).catch(() => {
        if (!media.isConnected) releaseMedia(media);
        if (token === generation) {
          stage.setAttribute("aria-busy", "false");
          updateControls();
          if (!stage.querySelector(".gallery-image")) {
            stage.firstElementChild.textContent = "This memory could not be loaded. Try another photo.";
          }
          announce("This file cannot be displayed. Try a supported image or an MP4 / WebM video.");
        }
      });
    } else {
      clearStage();
      stage.setAttribute("aria-busy", "false");
      const empty = document.createElement("p");
      empty.className = "gallery-empty";
      empty.textContent = "Your memories belong here. Add photos or videos to get started.";
      stage.replaceChildren(empty);
    }
    updateControls();
  }

  function openAlbum(id) {
    activeId = id;
    mediaIndex = 0;
    title.textContent = `Album ${id}`;
    viewerStatus.textContent = "";
    clearStage();
    renderMedia();
    preloadAlbum(albums.get(id));
    viewer.showModal();
  }

  function moveMedia(direction) {
    const album = albums.get(activeId);
    if (!viewer.open || !album || album.loading) return;
    const destination = mediaIndex + direction;
    if (destination < 0 || destination >= album.items.length) return;

    mediaIndex = destination;
    viewerStatus.textContent = "";
    renderMedia();
  }

  async function addMedia(album) {
    const files = Array.from(album.input.files || []);
    if (!files.length) return;
    album.loading = true;
    album.add.disabled = true;
    album.add.textContent = "Adding…";
    updateControls();
    let added = 0;
    let skipped = 0;

    for (const file of files) {
      if (!file.type.startsWith("image/") && !file.type.startsWith("video/")) { skipped += 1; continue; }
      const url = URL.createObjectURL(file);
      const item = { file, url };
      let media;
      try {
        media = makeMedia(item, 0, 1);
        await readyMedia(media);
        album.items.push(item);
        added += 1;
      } catch {
        URL.revokeObjectURL(url);
        skipped += 1;
      } finally {
        if (media) releaseMedia(media);
      }
    }

    updateCover(album);
    if (viewer.open && activeId === album.id) renderMedia();
    let saved = false;
    if (added && database) {
      try { await saveAlbum(album); saved = true; } catch { /* Keep photos available for this visit. */ }
    }
    let message = added
      ? `${added} ${added === 1 ? "item added" : "items added"} to Album ${album.id}. ${saved ? "Saved in this browser." : "Available for this visit; browser storage could not save them."}`
      : "No files were added. Choose supported photos or videos, such as JPEG, PNG, MP4, or WebM.";
    if (skipped) message += ` ${skipped} unsupported or unreadable ${skipped === 1 ? "file was" : "files were"} skipped.`;
    announce(message);
    album.input.value = "";
    album.loading = false;
    album.add.disabled = false;
    album.add.textContent = "Add photos / videos";
    updateControls();
  }

  async function removeMedia() {
    const album = albums.get(activeId);
    if (!viewer.open || !album || album.loading || !album.items.length) return;

    const removedIndex = mediaIndex;
    const [removed] = album.items.splice(removedIndex, 1);
    album.loading = true;
    album.add.disabled = true;
    viewerRemove.textContent = "Removing...";
    mediaIndex = Math.max(0, Math.min(removedIndex, album.items.length - 1));
    updateCover(album);
    renderMedia();

    try {
      if (database) await saveAlbum(album);
      URL.revokeObjectURL(removed.url);
      announce(`${isVideo(removed) ? "Video" : "Photo"} removed from Album ${album.id}. ${database ? "The updated album is saved in this browser." : "This change is available for this visit only."}`);
    } catch {
      // Restore the photo if storage fails so it does not reappear unexpectedly on refresh.
      album.items.splice(removedIndex, 0, removed);
      updateCover(album);
      if (viewer.open && activeId === album.id) {
        mediaIndex = removedIndex;
        renderMedia();
      }
      announce("The item could not be removed from browser storage. It has been restored; please try again.");
    } finally {
      album.loading = false;
      album.add.disabled = false;
      viewerRemove.textContent = "Remove item";
      updateControls();
      if (viewer.open && activeId === album.id && !album.items.length) viewerAdd.focus();
    }
  }

  document.querySelectorAll("[data-album]").forEach((card) => {
    const album = { id: card.dataset.album, card, items: [], loading: true, input: card.querySelector(".album-input"), add: card.querySelector(".album-add") };
    albums.set(album.id, album);
    const open = card.querySelector(".album-open");
    open.addEventListener("click", () => openAlbum(album.id));
    ["pointerenter", "focus", "pointerdown"].forEach((type) => {
      open.addEventListener(type, () => preloadAlbum(album));
    });
    album.add.addEventListener("click", () => album.input.click());
    album.input.addEventListener("change", () => addMedia(album));
  });

  document.getElementById("close-album").addEventListener("click", () => viewer.close());
  viewer.addEventListener("close", () => { generation += 1; activeId = null; pointerStart = null; clearStage(); stage.setAttribute("aria-busy", "false"); });
  viewerAdd.addEventListener("click", () => albums.get(activeId)?.input.click());
  viewerRemove.addEventListener("click", removeMedia);
  previous.addEventListener("click", () => moveMedia(-1));
  next.addEventListener("click", () => moveMedia(1));
  viewer.addEventListener("keydown", (event) => {
    if (event.target.closest("video")) return;
    if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
      event.preventDefault();
      moveMedia(event.key === "ArrowLeft" ? -1 : 1);
    }
  });

  stage.addEventListener("pointerdown", (event) => {
    if (event.target.closest("video")) return;
    if (!event.isPrimary || event.button !== 0) return;
    pointerStart = { x: event.clientX, y: event.clientY, id: event.pointerId, moved: false };
    stage.setPointerCapture(event.pointerId);
  });
  function advanceSwipe(event) {
    if (!pointerStart || pointerStart.id !== event.pointerId || pointerStart.moved) return;
    const dx = event.clientX - pointerStart.x;
    const dy = event.clientY - pointerStart.y;
    if (Math.abs(dx) >= 24 && Math.abs(dx) > Math.abs(dy) * 1.2) {
      // Respond during the swipe instead of waiting for the finger to lift.
      pointerStart.moved = true;
      moveMedia(dx < 0 ? 1 : -1);
    }
  }
  stage.addEventListener("pointermove", advanceSwipe);
  stage.addEventListener("pointerup", (event) => {
    if (!pointerStart || pointerStart.id !== event.pointerId) return;
    advanceSwipe(event);
    pointerStart = null;
  });
  stage.addEventListener("pointercancel", () => { pointerStart = null; });
  stage.addEventListener("lostpointercapture", () => { pointerStart = null; });

  (async () => {
    // Start with published files even when browser storage is unavailable.
    albums.forEach((album) => {
      album.items = (window.FORYOU_MEDIA.albums[album.id] || []).map(window.foryouMediaItem);
      updateCover(album);
      preloadNearby(album, 0);
    });
    try {
      database = await openDatabase();
      const savedAlbums = await loadSavedAlbums();
      for (const saved of savedAlbums) {
        const album = albums.get(saved.id);
        if (!album) continue;
        album.items.forEach((item) => URL.revokeObjectURL(item.url));
        album.items = saved.files.map(window.foryouMediaItem);
        updateCover(album);
        preloadNearby(album, 0);
      }
      if (viewer.open) renderMedia();
    } catch {
      database = null;
      announce("Our published memories are available. Photos and videos you add will be available for this visit only.");
    } finally {
      albums.forEach((album) => { album.loading = false; album.add.disabled = false; });
      updateControls();
      if (viewer.open) renderMedia();
    }
  })();
})();

