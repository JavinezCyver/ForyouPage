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
  let changingMedia = false;
  let generation = 0;
  let pointerStart = null;

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
    const image = new Image();
    image.className = "gallery-image";
    image.src = item.url;
    image.alt = `Photo ${index + 1} of ${count}: ${item.file.name}`;
    image.draggable = false;
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
    const media = makeMedia(item, 0, count);
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
    previous.disabled = changingMedia || album?.loading || mediaIndex <= 0 || !count;
    next.disabled = changingMedia || album?.loading || mediaIndex >= count - 1 || !count;
    viewerAdd.disabled = !album || album.loading;
    viewerRemove.disabled = !album || album.loading || changingMedia || !count;
    counter.textContent = count ? `${mediaIndex + 1} / ${count}` : "0 items";
  }

  function renderMedia() {
    generation += 1;
    changingMedia = false;
    delete stage.dataset.direction;
    clearStage();
    const album = albums.get(activeId);
    if (album && album.items.length) {
      stage.replaceChildren(makeMedia(album.items[mediaIndex], mediaIndex, album.items.length));
    } else {
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
    renderMedia();
    viewer.showModal();
  }

  async function moveMedia(direction) {
    const album = albums.get(activeId);
    if (!viewer.open || !album || album.loading || changingMedia) return;
    const destination = mediaIndex + direction;
    if (destination < 0 || destination >= album.items.length) return;

    changingMedia = true;
    const token = ++generation;
    updateControls();
    const incoming = makeMedia(album.items[destination], destination, album.items.length);
    try {
      await readyMedia(incoming);
      if (token !== generation || !viewer.open) return;
      const outgoing = stage.querySelector(".gallery-image");
      if (outgoing.tagName === "VIDEO") outgoing.pause();
      incoming.classList.add("incoming");
      outgoing.classList.add("outgoing");
      stage.dataset.direction = direction > 0 ? "next" : "previous";
      stage.append(incoming);
      mediaIndex = destination;
      updateControls();
      const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      await new Promise((resolve) => setTimeout(resolve, reducedMotion ? 0 : 360));
      if (token !== generation) return;
      releaseMedia(outgoing);
      outgoing.remove();
      incoming.classList.remove("incoming");
      delete stage.dataset.direction;
    } catch {
      announce("This file cannot be displayed. Try a supported image or an MP4 / WebM video.");
    } finally {
      if (!incoming.isConnected) releaseMedia(incoming);
      if (token === generation) {
        changingMedia = false;
        updateControls();
      }
    }
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
    if (!viewer.open || !album || album.loading || changingMedia || !album.items.length) return;

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
    card.querySelector(".album-open").addEventListener("click", () => openAlbum(album.id));
    album.add.addEventListener("click", () => album.input.click());
    album.input.addEventListener("change", () => addMedia(album));
  });

  document.getElementById("close-album").addEventListener("click", () => viewer.close());
  viewer.addEventListener("close", () => { generation += 1; changingMedia = false; activeId = null; pointerStart = null; clearStage(); });
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
    pointerStart = { x: event.clientX, y: event.clientY, id: event.pointerId };
    stage.setPointerCapture(event.pointerId);
  });
  stage.addEventListener("pointerup", (event) => {
    if (!pointerStart || pointerStart.id !== event.pointerId) return;
    const dx = event.clientX - pointerStart.x;
    const dy = event.clientY - pointerStart.y;
    pointerStart = null;
    if (Math.abs(dx) > 45 && Math.abs(dx) > Math.abs(dy) * 1.2) moveMedia(dx < 0 ? 1 : -1);
  });
  stage.addEventListener("pointercancel", () => { pointerStart = null; });

  (async () => {
    try {
      database = await openDatabase();
      const savedAlbums = await loadSavedAlbums();
      for (const saved of savedAlbums) {
        const album = albums.get(saved.id);
        if (!album) continue;
        album.items = saved.files.map((file) => ({ file, url: URL.createObjectURL(file) }));
        updateCover(album);
      }
      if (viewer.open) renderMedia();
    } catch {
      database = null;
      announce("Browser storage is unavailable. You can add photos and videos for this visit.");
    } finally {
      albums.forEach((album) => { album.loading = false; album.add.disabled = false; });
      updateControls();
    }
  })();
})();

