/*============================================================
  NeoDefender — game logic
  Catch BLUE pills (data) to score, avoid RED pills (the virus),
  and grab the rare SHIELD power-up. Survive 60s or lose your
  shields. Difficulty ramps up with levels.
============================================================*/

/*-------------- Canvas setup -------------*/
const gameZone = document.getElementById('gameZoneDisplay');
const gameZoneContext = gameZone.getContext('2d');

// The Matrix-rain background is drawn by the shared js/matrixRain.js on its
// own canvas behind this one. Here we only size the (transparent) game canvas.
function resizeCanvases() {
  gameZone.width = window.innerWidth;
  gameZone.height = window.innerHeight;
}
window.addEventListener('resize', resizeCanvases);

/*-------------- Preloaded images -------------*/
// Load each image ONCE instead of per-pill (fixes the old performance leak).
const images = {
  'red-pill': new Image(),
  'blue-pill': new Image(),
  'shield': new Image(),
};
images['red-pill'].src = './image/red-pill.png';
images['blue-pill'].src = './image/blue-pill.png';
images['shield'].src = './image/shield.png';

/*-------------- Tunable constants -------------*/
const GAME_DURATION = 60;          // seconds
const START_SHIELDS = 5;
const MAX_SHIELDS = 5;
const BASE_SPAWN_CHANCE = 0.025;   // per-frame chance to spawn a pill at level 1
const SPAWN_PER_LEVEL = 0.012;     // extra spawn chance per level
const SPEED_PER_LEVEL = 0.6;       // extra fall speed per level
const SECONDS_PER_LEVEL = 12;      // level up every N seconds
const SHIELD_PILL_CHANCE = 0.06;   // chance a spawned pill is a shield power-up

/*---------- Game state ---------*/
let pills = [];
let particles = [];
let floatTexts = [];
let score = 0;
let combo = 0;
let bestCombo = 0;
let shieldCount = START_SHIELDS;
let timer = GAME_DURATION;
let level = 1;
let timeElapsed = 0;
let running = false;
let gameLoop;
let countdownTimer;

/*----- Cached element references -----*/
const scoreDisplay = document.getElementById('score');
const timerDisplay = document.getElementById('timer');
const levelDisplay = document.getElementById('level');
const comboDisplay = document.getElementById('combo');
const scoreAndTimeDisplay = document.querySelector('.scoreAndTimeDisplay');
const shieldContainer = document.querySelector('.shieldsDisplay');
const shields = document.querySelectorAll('.shield');
const playAgainButton = document.getElementById('playAgainButton');
const result = document.getElementById('result');
const finalScore = document.getElementById('finalScore');
const highScoreText = document.getElementById('highScore');
const endGameDisplay = document.querySelector('.endGameDisplay');
const music = document.getElementById('background-music');

/*-------------- Background music -------------*/
// Browsers block autoplay until the user interacts, so we both try on start
// and retry on the first tap/click/keypress as a fallback.
function startMusic() {
  if (!music) return;
  music.volume = 0.5;
  const attempt = music.play();
  if (attempt && attempt.catch) attempt.catch(() => {});
}
function enableMusicOnFirstGesture() {
  const resume = () => {
    startMusic();
    window.removeEventListener('pointerdown', resume);
    window.removeEventListener('keydown', resume);
  };
  window.addEventListener('pointerdown', resume);
  window.addEventListener('keydown', resume);
}

/*-------------- Helpers -------------*/
const rand = (min, max) => Math.floor(Math.random() * (max - min + 1) + min);

/*============================================================
  SOUND — generated with the Web Audio API (no asset files).
============================================================*/
let audioCtx;
function getAudio() {
  if (!audioCtx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (AC) audioCtx = new AC();
  }
  if (audioCtx && audioCtx.state === 'suspended') audioCtx.resume();
  return audioCtx;
}

function playTone(freq, duration, type = 'sine', volume = 0.15) {
  const ctx = getAudio();
  if (!ctx) return;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = type;
  osc.frequency.value = freq;
  gain.gain.setValueAtTime(volume, ctx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + duration);
  osc.connect(gain).connect(ctx.destination);
  osc.start();
  osc.stop(ctx.currentTime + duration);
}

const sounds = {
  catch: () => playTone(660 + Math.min(combo, 12) * 30, 0.12, 'triangle', 0.12),
  miss: () => playTone(110, 0.25, 'sawtooth', 0.18),
  power: () => { playTone(523, 0.1, 'sine', 0.15); setTimeout(() => playTone(784, 0.18, 'sine', 0.15), 90); },
  over: () => { playTone(330, 0.2, 'sine', 0.15); setTimeout(() => playTone(220, 0.3, 'sine', 0.15), 160); },
  win: () => { playTone(523, 0.15); setTimeout(() => playTone(659, 0.15), 130); setTimeout(() => playTone(880, 0.3), 260); },
};

/*============================================================
  FALLING PILLS
============================================================*/
class FallingPill {
  constructor(type, x, y, size) {
    this.type = type;            // 'red-pill' | 'blue-pill' | 'shield'
    this.x = x;
    this.y = y;
    this.size = size;
    this.baseSpeed = rand(1, 4);
    this.speed = this.baseSpeed;
    this.clicked = false;
    this.wobble = Math.random() * Math.PI * 2;
  }

  update() {
    // Speed scales with both elapsed time and current level.
    this.speed = this.baseSpeed + timeElapsed * 0.04 + (level - 1) * SPEED_PER_LEVEL;
    this.y += this.speed;
    this.wobble += 0.05;
    this.x += Math.sin(this.wobble) * 0.6; // gentle drift so it feels alive
  }

  draw() {
    const img = images[this.type];
    // Glow for the rare shield power-up so players notice it.
    if (this.type === 'shield') {
      gameZoneContext.save();
      gameZoneContext.shadowColor = '#00ff41';
      gameZoneContext.shadowBlur = 25;
      gameZoneContext.drawImage(img, this.x - this.size / 2, this.y - this.size / 2, this.size, this.size);
      gameZoneContext.restore();
    } else {
      gameZoneContext.drawImage(img, this.x - this.size / 2, this.y - this.size / 2, this.size, this.size);
    }
  }
}

function createPill() {
  const size = rand(55, 80);
  const x = rand(size, gameZone.width - size);
  const y = -size;

  let type;
  if (Math.random() < SHIELD_PILL_CHANCE && shieldCount < MAX_SHIELDS) {
    type = 'shield';
  } else {
    type = Math.random() < 0.5 ? 'red-pill' : 'blue-pill';
  }
  pills.push(new FallingPill(type, x, y, size));
}

/*============================================================
  PARTICLES + FLOATING SCORE TEXT (click feedback)
============================================================*/
function spawnParticles(x, y, color) {
  for (let i = 0; i < 14; i++) {
    const angle = Math.random() * Math.PI * 2;
    const speed = Math.random() * 5 + 1;
    particles.push({
      x, y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      life: 1,
      color,
    });
  }
}

function spawnFloatText(x, y, text, color) {
  floatTexts.push({ x, y, text, color, life: 1 });
}

function updateEffects() {
  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i];
    p.x += p.vx;
    p.y += p.vy;
    p.vy += 0.15; // gravity
    p.life -= 0.03;
    if (p.life <= 0) {
      particles.splice(i, 1);
      continue;
    }
    gameZoneContext.globalAlpha = Math.max(p.life, 0);
    gameZoneContext.fillStyle = p.color;
    gameZoneContext.fillRect(p.x, p.y, 4, 4);
  }
  gameZoneContext.globalAlpha = 1;

  for (let i = floatTexts.length - 1; i >= 0; i--) {
    const f = floatTexts[i];
    f.y -= 1.2;
    f.life -= 0.02;
    if (f.life <= 0) {
      floatTexts.splice(i, 1);
      continue;
    }
    gameZoneContext.globalAlpha = Math.max(f.life, 0);
    gameZoneContext.fillStyle = f.color;
    gameZoneContext.font = 'bold 24px "Courier New", monospace';
    gameZoneContext.textAlign = 'center';
    gameZoneContext.fillText(f.text, f.x, f.y);
  }
  gameZoneContext.globalAlpha = 1;
}

/*============================================================
  HUD / SHIELDS / LEVEL
============================================================*/
function updateHUD() {
  scoreDisplay.textContent = score;
  timerDisplay.textContent = timer;
  levelDisplay.textContent = level;
  comboDisplay.textContent = combo;
}

function updateShields() {
  for (let i = 0; i < shields.length; i++) {
    shields[i].style.display = i < shieldCount ? 'inline-block' : 'none';
  }
  if (shieldCount <= 0 && running) {
    endGame('You lost all shields! The Matrix has collapsed...', false);
  }
}

function loseShield() {
  shieldCount = Math.max(0, shieldCount - 1);
  combo = 0; // any mistake breaks the combo
  updateShields();
  updateHUD();
}

function gainShield() {
  if (shieldCount < MAX_SHIELDS) shieldCount++;
  updateShields();
}

function checkLevelUp() {
  const newLevel = Math.floor(timeElapsed / SECONDS_PER_LEVEL) + 1;
  if (newLevel > level) {
    level = newLevel;
    spawnFloatText(gameZone.width / 2, gameZone.height / 2, `LEVEL ${level}!`, '#00ff41');
    playTone(880, 0.2, 'square', 0.1);
  }
}

/*============================================================
  MAIN LOOP
============================================================*/
function updateGame() {
  // Clear the foreground canvas (transparent so the rain shows through).
  gameZoneContext.clearRect(0, 0, gameZone.width, gameZone.height);

  // Iterate backwards so splicing doesn't skip elements.
  for (let i = pills.length - 1; i >= 0; i--) {
    const pill = pills[i];
    pill.update();
    pill.draw();

    if (pill.y - pill.size / 2 > gameZone.height) {
      // A blue (data) pill that escapes off the bottom costs a shield.
      if (pill.type === 'blue-pill') {
        loseShield();
        sounds.miss();
      }
      // Red and shield pills that fall off are simply removed (no penalty),
      // which also fixes the old leak where reds piled up forever.
      pills.splice(i, 1);
    }
  }

  updateEffects();

  // Spawn rate scales with level.
  const spawnChance = BASE_SPAWN_CHANCE + (level - 1) * SPAWN_PER_LEVEL;
  if (Math.random() < spawnChance) createPill();
}

function countDown() {
  countdownTimer = setInterval(() => {
    timer--;
    timeElapsed++;
    checkLevelUp();
    updateHUD();
    if (timer <= 0) endGame('Congrats! You saved The Matrix', true);
  }, 1000);
}

/*============================================================
  HIT DETECTION (mouse + touch)
============================================================*/
function handleHit(px, py) {
  getAudio(); // ensure the audio context is unlocked by this gesture
  for (let i = pills.length - 1; i >= 0; i--) {
    const pill = pills[i];
    const dist = Math.hypot(px - pill.x, py - pill.y);
    // A generous radius makes clicking far easier on a trackpad/touch.
    if (dist < pill.size / 2 + 12 && !pill.clicked) {
      pill.clicked = true;

      if (pill.type === 'red-pill') {
        loseShield();
        sounds.miss();
        spawnParticles(pill.x, pill.y, '#ff2b2b');
        spawnFloatText(pill.x, pill.y, '-1 shield', '#ff2b2b');
      } else if (pill.type === 'shield') {
        gainShield();
        sounds.power();
        spawnParticles(pill.x, pill.y, '#00ff41');
        spawnFloatText(pill.x, pill.y, '+SHIELD', '#00ff41');
      } else {
        combo++;
        bestCombo = Math.max(bestCombo, combo);
        const points = 1 + Math.floor(combo / 5); // combos boost points
        score += points;
        sounds.catch();
        spawnParticles(pill.x, pill.y, '#2b8bff');
        spawnFloatText(pill.x, pill.y, `+${points}`, '#2b8bff');
        updateHUD();
      }

      pills.splice(i, 1);
      return; // one pill per tap
    }
  }
}

// Map a pointer/touch event to canvas coordinates.
function eventPos(e) {
  const rect = gameZone.getBoundingClientRect();
  const point = e.touches && e.touches[0] ? e.touches[0] : e;
  return { x: point.clientX - rect.left, y: point.clientY - rect.top };
}

gameZone.addEventListener('click', (e) => {
  if (!running) return;
  const { x, y } = eventPos(e);
  handleHit(x, y);
});

gameZone.addEventListener('touchstart', (e) => {
  if (!running) return;
  e.preventDefault();
  const { x, y } = eventPos(e);
  handleHit(x, y);
}, { passive: false });

/*============================================================
  START / END
============================================================*/
function startGame() {
  resizeCanvases();
  score = 0;
  combo = 0;
  bestCombo = 0;
  shieldCount = START_SHIELDS;
  timer = GAME_DURATION;
  level = 1;
  timeElapsed = 0;
  pills = [];
  particles = [];
  floatTexts = [];
  running = true;

  updateHUD();
  updateShields();

  endGameDisplay.classList.add('hide');
  scoreAndTimeDisplay.classList.remove('hide');
  shieldContainer.classList.remove('hide');

  startMusic();

  clearInterval(gameLoop);
  clearInterval(countdownTimer);
  gameLoop = setInterval(updateGame, 1000 / 60);
  countDown();
}

function endGame(message, won) {
  if (!running) return;
  running = false;
  clearInterval(gameLoop);
  clearInterval(countdownTimer);
  won ? sounds.win() : sounds.over();

  // Persist the high score across sessions.
  const prevHigh = parseInt(localStorage.getItem('neoHighScore') || '0', 10);
  const isNewHigh = score > prevHigh;
  if (isNewHigh) localStorage.setItem('neoHighScore', String(score));
  const high = Math.max(prevHigh, score);

  setTimeout(() => {
    scoreAndTimeDisplay.classList.add('hide');
    shieldContainer.classList.add('hide');
    endGameDisplay.classList.remove('hide');

    result.textContent = message;
    finalScore.textContent = `Score: ${score}  •  Best Combo: ${bestCombo}x  •  Level: ${level}`;
    highScoreText.textContent = isNewHigh ? `★ New High Score: ${high}! ★` : `High Score: ${high}`;
  }, 300);
}

playAgainButton.addEventListener('click', startGame);

/*-------------- Boot -------------*/
window.onload = () => {
  resizeCanvases();
  enableMusicOnFirstGesture();
  startGame();
};
