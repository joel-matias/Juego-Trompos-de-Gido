(function (g) {
  let ac, musicGain, sfxGain, bgGain, musicInterval;
  let bgBuffer = null, bgSource = null;

  function init() {
    if (ac) return;
    ac = new (window.AudioContext || window.webkitAudioContext)();

    musicGain = ac.createGain();
    sfxGain   = ac.createGain();
    bgGain    = ac.createGain();

    musicGain.gain.value = 0.01;
    sfxGain.gain.value   = 0.15;
    bgGain.gain.value    = 0.09;

    musicGain.connect(ac.destination);
    sfxGain.connect(ac.destination);
    bgGain.connect(ac.destination);
  }

  function beepAt(freq, dur, vol, type, startTime) {
    if (!ac) return;
    const o = ac.createOscillator();
    const g = ac.createGain();
    o.type            = type || 'square';
    o.frequency.value = freq;
    o.connect(g);
    g.connect(sfxGain);
    const t = startTime != null ? startTime : ac.currentTime;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol || 0.4, t + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.start(t);
    o.stop(t + dur + 0.01);
  }

  function hit() {
    if (!ac) return;
    const t = ac.currentTime;
    beepAt(110, 0.18, 0.5, 'sawtooth', t);
    beepAt(280, 0.07, 0.3, 'square',   t + 0.02);
  }

  function pickup(isBonus) {
    if (!ac) return;
    const t = ac.currentTime;
    beepAt(720,  0.09, 0.35, 'square',   t);
    if (isBonus) {
      beepAt(1047, 0.10, 0.35, 'square', t + 0.09);
      beepAt(1397, 0.12, 0.30, 'sine',   t + 0.18);
    }
  }

  function levelUp() {
    if (!ac) return;
    const notes = [523, 659, 784, 1047];
    notes.forEach((freq, i) => {
      beepAt(freq, 0.18, 0.28, 'triangle', ac.currentTime + i * 0.09);
    });
  }

  function startMusic() {
    if (!ac) return;
    stopMusic();
    musicInterval = setInterval(() => {
      const o = ac.createOscillator();
      const g = ac.createGain();
      const baseNotes = [220, 247, 262, 294, 330, 349, 392];
      const base = baseNotes[Math.floor(Math.random() * baseNotes.length)];
      o.frequency.value = base * (Math.random() < 0.3 ? 1.5 : 1);
      o.type = 'sine';
      o.connect(g);
      g.connect(musicGain);
      const t = ac.currentTime;
      g.gain.setValueAtTime(0.0001, t);
      g.gain.linearRampToValueAtTime(0.12, t + 0.2);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.8);
      o.start();
      o.stop(t + 0.85);
    }, 900);
  }

  function stopMusic() {
    if (musicInterval) clearInterval(musicInterval);
    musicInterval = null;
  }

  async function loadBackground(url) {
    init();
    const res = await fetch(url);
    const buf = await res.arrayBuffer();
    bgBuffer  = await ac.decodeAudioData(buf);
  }

  function startBackground() {
    if (!ac || !bgBuffer) return;
    stopBackground();
    bgSource        = ac.createBufferSource();
    bgSource.buffer = bgBuffer;
    bgSource.loop   = true;
    bgSource.connect(bgGain);
    bgSource.start(0);
  }

  function stopBackground() {
    if (bgSource) {
      try { bgSource.stop(); } catch (_) {}
      bgSource.disconnect();
      bgSource = null;
    }
  }

  function setBgVolume(v)    { if (bgGain)    bgGain.gain.value    = v; }
  function setMusicVolume(v) { if (musicGain) musicGain.gain.value = v; }
  function setSfxVolume(v)   { if (sfxGain)   sfxGain.gain.value   = v; }

  g.AudioSys = {
    init,
    hit,
    pickup,
    levelUp,
    startMusic,
    stopMusic,
    loadBackground,
    startBackground,
    stopBackground,
    setBgVolume,
    setMusicVolume,
    setSfxVolume,
  };
})(window);
