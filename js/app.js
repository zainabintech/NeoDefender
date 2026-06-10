/*-------------- Cached elements -------------*/
const startGameBtn = document.getElementById('startgame-btn');
const music = document.getElementById('background-music');
const startGamePage = document.getElementById('startgame-page');
const story = document.getElementById('story-page');
const stories = Array.from(document.querySelectorAll('.story'));
const storyButtons = document.querySelectorAll('.story-btn');
const skipBtn = document.getElementById('skip-intro');
const progressDots = document.querySelectorAll('.story-progress .dot');
const typedLine = document.getElementById('typed-line');
const cursor = document.querySelector('.cursor');

/*---------- State ---------*/
let currentIndex = 0;

/*-------------- Typewriter (step 1) -------------*/
let typeTimer;
function runTypewriter() {
  if (!typedLine) return;
  const full = typedLine.getAttribute('data-text') || '';
  typedLine.textContent = '';
  if (cursor) cursor.style.display = 'inline';
  let i = 0;
  clearInterval(typeTimer);
  typeTimer = setInterval(() => {
    typedLine.textContent = full.slice(0, ++i);
    if (i >= full.length) {
      clearInterval(typeTimer);
      if (cursor) cursor.style.display = 'none';
    }
  }, 32);
}

/*-------------- Step navigation -------------*/
function showStep(index) {
  index = Math.max(0, Math.min(index, stories.length - 1));
  stories.forEach((s, i) => { s.style.display = i === index ? 'block' : 'none'; });
  progressDots.forEach((d, i) => d.classList.toggle('active', i <= index));
  currentIndex = index;

  // Hide "skip" once you're on the final step.
  if (skipBtn) skipBtn.style.display = index === stories.length - 1 ? 'none' : 'block';

  if (index === 0) runTypewriter();
}

/*-------------- Flow control -------------*/
const startGame = () => {
  startGamePage.style.display = 'none';
  story.style.display = 'flex';
  showStep(0);
  if (music) {
    music.volume = 0.5;
    const p = music.play();
    if (p && p.catch) p.catch(() => {});
  }
};

const handleStoryProgression = (event) => {
  const nextId = event.target.getAttribute('data-next');
  const nextIndex = stories.findIndex((s) => s.id === nextId);
  if (nextIndex !== -1) showStep(nextIndex);
};

/*----------- Event Listeners ----------*/
startGameBtn.addEventListener('click', startGame);

storyButtons.forEach((button) => {
  button.addEventListener('click', handleStoryProgression);
});

if (skipBtn) {
  skipBtn.addEventListener('click', () => showStep(stories.length - 1));
}

document.querySelector('.startButton').addEventListener('click', () => {
  window.location.href = './game.html';
});
