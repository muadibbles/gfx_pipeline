const board = document.getElementById("soundboard");
let activeAudio = null;

SOUNDS.forEach(({ label, file }) => {
  const btn = document.createElement("button");
  btn.className = "sound-btn";
  btn.textContent = label;

  btn.addEventListener("click", () => {
    if (activeAudio) {
      activeAudio.pause();
      activeAudio.currentTime = 0;
    }
    const audio = new Audio(file);
    activeAudio = audio;
    audio.play().catch(() => {
      btn.classList.add("error");
      btn.title = "Audio file not found";
    });

    btn.classList.add("playing");
    audio.addEventListener("ended", () => btn.classList.remove("playing"));
  });

  board.appendChild(btn);
});
