/*============================================================
  Matrix digital-rain background — shared by every page.
  Looks for a <canvas id="matrixRain"> and runs its own
  self-contained animation loop behind the rest of the page.
============================================================*/
(function () {
  const canvas = document.getElementById('matrixRain');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');

  const FONT_SIZE = 16;
  const CHARS = 'アカサタナハマヤラワ0123456789NEODEFENDER'.split('');
  let drops = [];

  function resize() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    const columns = Math.floor(canvas.width / FONT_SIZE);
    drops = new Array(columns).fill(0).map(() => Math.random() * -50);
  }

  function draw() {
    // Translucent black fill leaves fading trails behind each glyph.
    ctx.fillStyle = 'rgba(0, 0, 0, 0.07)';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#00ff41';
    ctx.font = FONT_SIZE + 'px monospace';

    for (let i = 0; i < drops.length; i++) {
      const char = CHARS[Math.floor(Math.random() * CHARS.length)];
      ctx.fillText(char, i * FONT_SIZE, drops[i] * FONT_SIZE);
      if (drops[i] * FONT_SIZE > canvas.height && Math.random() > 0.975) drops[i] = 0;
      drops[i]++;
    }
    requestAnimationFrame(draw);
  }

  window.addEventListener('resize', resize);
  resize();
  draw();
})();
