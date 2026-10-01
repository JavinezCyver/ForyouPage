// Published media loads on every device. Add filenames here when publishing new files.
window.FORYOU_MEDIA = {
  "albums": {
    "1": [
      "photo_2026-09-30_21-55-11.jpg",
      "photo_2026-09-30_21-55-29.jpg",
      "photo_2026-09-30_21-55-33.jpg",
      "photo_2026-09-30_21-55-57.jpg",
      "photo_2026-09-30_21-56-02.jpg",
      "photo_2026-09-30_22-00-08.jpg",
      "photo_2026-09-30_22-00-11.jpg",
      "photo_2026-09-30_22-00-15.jpg",
      "photo_2026-09-30_22-00-18.jpg",
      "photo_2026-09-30_22-00-21.jpg",
      "photo_2026-09-30_22-01-01.jpg",
      "photo_2026-09-30_22-01-04.jpg"
    ],
    "2": [
      "photo_2026-09-30_22-01-07.jpg",
      "photo_2026-09-30_22-01-26.jpg",
      "photo_2026-09-30_22-01-28.jpg",
      "photo_2026-09-30_22-01-31.jpg",
      "photo_2026-09-30_22-01-34.jpg",
      "photo_2026-09-30_22-01-37.jpg",
      "photo_2026-09-30_22-02-15.jpg",
      "photo_2026-09-30_22-02-18.jpg",
      "photo_2026-09-30_22-02-22.jpg",
      "photo_2026-09-30_22-02-27.jpg",
      "photo_2026-09-30_22-02-30.jpg",
      "photo_2026-09-30_22-02-34.jpg"
    ],
    "3": [
      "photo_2026-09-30_22-03-17.jpg",
      "photo_2026-09-30_22-03-21.jpg",
      "photo_2026-09-30_22-03-24.jpg",
      "photo_2026-09-30_22-03-28.jpg",
      "photo_2026-09-30_22-03-31.jpg",
      "photo_2026-09-30_22-03-37.jpg",
      "photo_2026-09-30_22-04-06.jpg",
      "photo_2026-09-30_22-04-09.jpg",
      "photo_2026-09-30_22-07-10.jpg",
      "photo_2026-09-30_22-07-17.jpg",
      "photo_2026-09-30_22-07-21.jpg",
      "photo_2026-09-30_22-07-27.jpg"
    ],
    "4": [
      "photo_2026-09-30_22-07-31.jpg",
      "photo_2026-09-30_22-07-38.jpg",
      "photo_2026-09-30_22-07-42.jpg",
      "photo_2026-09-30_22-14-35.jpg",
      "photo_2026-09-30_22-14-39.jpg",
      "photo_2026-09-30_22-14-55.jpg",
      "photo_2026-09-30_22-19-03.jpg",
      "photo_2026-09-30_22-19-06.jpg",
      "photo_2026-09-30_22-19-09.jpg",
      "photo_2026-09-30_22-19-12.jpg",
      "photo_2026-09-30_22-19-14.jpg",
      "photo_2026-09-30_22-19-17.jpg",
      "video_2026-09-30_22-15-21.mp4"
    ]
  },
  "tracks": [
    "Daniel_Padilla_-_Can_t_Help_Falling_In_Love_(mp3.pm).mp3",
    "Mitski_-_My_Love_Mine_All_Mine_(mp3.pm).mp3",
    "wave_to_earth_-_love._(mp3.pm) (1).mp3"
  ]
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
