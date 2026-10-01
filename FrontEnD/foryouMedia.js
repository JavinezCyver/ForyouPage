// Read shared media references directly from the HTML.
const publishedMedia = document.getElementById("published-media").content;
function publishedFile(element) {
  const assetPath = element.getAttribute("src");
  const types = { IMG: "image/jpeg", VIDEO: "video/mp4", AUDIO: "audio/mpeg" };
  return { name: decodeURIComponent(assetPath.split("/").pop()), type: types[element.tagName], assetPath, replaces: element.getAttribute("data-replaces") };
}
window.FORYOU_MEDIA = {
  albums: Object.fromEntries(Array.from(publishedMedia.querySelectorAll("[data-published-album]"), (album) => [
    album.dataset.publishedAlbum,
    Array.from(album.querySelectorAll("img, video"), publishedFile)
  ])),
  tracks: Array.from(publishedMedia.querySelectorAll("[data-published-tracks] audio"), publishedFile)
};

// Store published filenames, rather than downloading media into browser storage.
window.foryouMediaItem = function (file) {
  if (typeof file === "string") {
    const extension = file.split(".").pop().toLowerCase();
    const types = { jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", mp4: "video/mp4", mp3: "audio/mpeg" };
    file = { name: file, type: types[extension] || "application/octet-stream", assetPath: "../assets/" + encodeURIComponent(file) };
  }
  return {
    file,
    url: file.assetPath ? new URL(file.assetPath, document.baseURI).href : URL.createObjectURL(file)
  };
};
