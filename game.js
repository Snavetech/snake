"use strict";

const GRID_SIZE = 20;
const STARTING_LENGTH = 4;
const MIN_MOVE_INTERVAL = 68;
const LEVEL_SPEED_INCREASE = 12;
const LEVEL_STEP = 5;
const BONUS_TRIGGER = 7;
const LEGACY_BEST_SCORE_KEY = "snake-field-best";
const BEST_SCORES_KEY = "snake-field-best-scores";
const MODE_KEY = "snake-field-mode";
const SOUND_KEY = "snake-field-sound";
const SPEED_KEY = "snake-field-starting-speed";

const GAME_STATES = Object.freeze({
  IDLE: "idle",
  RUNNING: "running",
  PAUSED: "paused",
  LEVEL_UP: "level-up",
  OVER: "over",
  WON: "won",
});

const GAME_MODES = Object.freeze({
  CLASSIC: "classic",
  WALLED: "walled",
  CHALLENGE: "challenge",
});

const MODE_DETAILS = Object.freeze({
  [GAME_MODES.CLASSIC]: {
    label: "Classic",
    description: "Edges wrap around. After seven bites, a 50-point fruit appears.",
  },
  [GAME_MODES.WALLED]: {
    label: "Walled",
    description: "Hard borders. After seven bites, a 50-point fruit appears.",
  },
  [GAME_MODES.CHALLENGE]: {
    label: "Challenge",
    description: "Fill each bite target to unlock a new obstacle course.",
  },
});

const FOOD_TYPES = Object.freeze({
  REGULAR: "regular",
  BONUS: "bonus",
});

const STARTING_SPEEDS = Object.freeze({
  1: { label: "Slowest", interval: 250 },
  2: { label: "Easy", interval: 220 },
  3: { label: "Normal", interval: 190 },
  4: { label: "Quick", interval: 160 },
  5: { label: "Fastest", interval: 135 },
});

const DIRECTIONS = Object.freeze({
  up: { x: 0, y: -1 },
  down: { x: 0, y: 1 },
  left: { x: -1, y: 0 },
  right: { x: 1, y: 0 },
});

const CHALLENGE_LEVELS = Object.freeze([
  {
    name: "Twin Gates",
    target: 4,
    build: () => [
      ...verticalCells(5, 3, 16, [8, 9, 10, 11]),
      ...verticalCells(14, 3, 16, [8, 9, 10, 11]),
    ],
  },
  {
    name: "Crosswind",
    target: 5,
    build: () => [
      ...horizontalCells(5, 3, 16, [8, 9, 10, 11]),
      ...horizontalCells(14, 3, 16, [8, 9, 10, 11]),
      ...verticalCells(3, 7, 12, [9, 10]),
      ...verticalCells(16, 7, 12, [9, 10]),
    ],
  },
  {
    name: "Switchbacks",
    target: 6,
    build: () => [
      ...verticalCells(4, 2, 13, [6, 7]),
      ...verticalCells(8, 6, 17, [9, 10, 11]),
      ...verticalCells(12, 2, 13, [9, 10, 11]),
      ...verticalCells(16, 6, 17, [13, 14]),
    ],
  },
  {
    name: "Four Corners",
    target: 7,
    build: () => [
      ...blockCells(3, 3, 4, 3),
      ...blockCells(13, 3, 4, 3),
      ...blockCells(3, 14, 4, 3),
      ...blockCells(13, 14, 4, 3),
    ],
  },
  {
    name: "The Diamond",
    target: 8,
    build: () => diamondCells(10, 10, 6),
  },
]);

const KEY_DIRECTIONS = Object.freeze({
  ArrowUp: "up",
  ArrowDown: "down",
  ArrowLeft: "left",
  ArrowRight: "right",
  w: "up",
  W: "up",
  s: "down",
  S: "down",
  a: "left",
  A: "left",
  d: "right",
  D: "right",
});

const canvas = document.querySelector("#gameCanvas");
const canvasWrap = document.querySelector("#canvasWrap");
const context = canvas.getContext("2d");
const scoreElement = document.querySelector("#score");
const bestScoreElement = document.querySelector("#bestScore");
const levelElement = document.querySelector("#level");
const statusElement = document.querySelector("#statusText");
const actionButton = document.querySelector("#actionButton");
const pauseButton = document.querySelector("#pauseButton");
const soundButton = document.querySelector("#soundButton");
const soundLabel = document.querySelector("#soundLabel");
const mobileSoundButton = document.querySelector("#mobileSoundButton");
const mobileSoundLabel = document.querySelector("#mobileSoundLabel");
const overlay = document.querySelector("#gameOverlay");
const overlayTag = document.querySelector("#overlayTag");
const overlayTitle = document.querySelector("#overlayTitle");
const overlayMessage = document.querySelector("#overlayMessage");
const hintAction = document.querySelector("#hintAction");
const touchButtons = document.querySelectorAll("[data-direction]");
const modeButtons = document.querySelectorAll("[data-mode]");
const modeDescription = document.querySelector("#modeDescription");
const boardMode = document.querySelector("#boardMode");
const speedButtons = document.querySelectorAll("[data-speed]");
const speedLabel = document.querySelector("#speedLabel");
const levelProgress = document.querySelector("#levelProgress");
const challengeLevelName = document.querySelector("#challengeLevelName");
const progressText = document.querySelector("#progressText");
const progressTrack = document.querySelector("#progressTrack");
const progressFill = document.querySelector("#progressFill");

let gameState = GAME_STATES.IDLE;
let snake = [];
let food = null;
let direction = DIRECTIONS.right;
let directionQueue = [];
let score = 0;
let currentMode = readGameMode();
let bestScores = readBestScores();
let soundEnabled = readSoundPreference();
let startingSpeedLevel = readStartingSpeed();
let audioContext = null;
let level = 1;
let foodCount = 0;
let regularBiteStreak = 0;
let obstacles = [];
let challengeProgress = 0;
let challengeTarget = 0;
let particles = [];
let impactFlash = 0;
let logicalCanvasSize = 600;
let pixelRatio = 1;
let lastFrameTime = performance.now();
let moveAccumulator = 0;
let swipeStart = null;

const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

function readBestScores() {
  try {
    const legacyScore = Number.parseInt(
      localStorage.getItem(LEGACY_BEST_SCORE_KEY) || "0",
      10,
    );
    const scores = {
      [GAME_MODES.CLASSIC]: 0,
      [GAME_MODES.WALLED]: Number.isFinite(legacyScore) ? legacyScore : 0,
      [GAME_MODES.CHALLENGE]: 0,
    };
    const storedScores = JSON.parse(localStorage.getItem(BEST_SCORES_KEY) || "null");

    if (storedScores && typeof storedScores === "object") {
      Object.values(GAME_MODES).forEach((mode) => {
        const value = Number.parseInt(storedScores[mode], 10);
        if (Number.isFinite(value) && value >= 0) scores[mode] = value;
      });
    }

    return scores;
  } catch {
    return {
      [GAME_MODES.CLASSIC]: 0,
      [GAME_MODES.WALLED]: 0,
      [GAME_MODES.CHALLENGE]: 0,
    };
  }
}

function saveBestScores() {
  try {
    localStorage.setItem(BEST_SCORES_KEY, JSON.stringify(bestScores));
  } catch {
    // Storage can be unavailable in private browsing or restricted contexts.
  }
}

function readGameMode() {
  try {
    const storedMode = localStorage.getItem(MODE_KEY);
    return Object.values(GAME_MODES).includes(storedMode)
      ? storedMode
      : GAME_MODES.WALLED;
  } catch {
    return GAME_MODES.WALLED;
  }
}

function saveGameMode() {
  try {
    localStorage.setItem(MODE_KEY, currentMode);
  } catch {
    // The game still works when persistent storage is unavailable.
  }
}

function readSoundPreference() {
  try {
    const storedPreference = localStorage.getItem(SOUND_KEY);
    return storedPreference === null ? true : storedPreference === "true";
  } catch {
    return true;
  }
}

function saveSoundPreference() {
  try {
    localStorage.setItem(SOUND_KEY, String(soundEnabled));
  } catch {
    // Sound remains available for the current session without storage.
  }
}

function readStartingSpeed() {
  try {
    const storedLevel = Number.parseInt(localStorage.getItem(SPEED_KEY) || "1", 10);
    return STARTING_SPEEDS[storedLevel] ? storedLevel : 1;
  } catch {
    return 1;
  }
}

function saveStartingSpeed() {
  try {
    localStorage.setItem(SPEED_KEY, String(startingSpeedLevel));
  } catch {
    // The selected speed remains active for the current session.
  }
}

function ensureAudioContext() {
  if (!soundEnabled) return null;

  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextClass) return null;

  try {
    if (!audioContext) audioContext = new AudioContextClass();
    if (audioContext.state === "suspended") audioContext.resume().catch(() => {});
    return audioContext;
  } catch {
    return null;
  }
}

function playTone(frequency, duration, delay = 0, type = "square", volume = 0.035) {
  const audio = ensureAudioContext();
  if (!audio) return;

  const startTime = audio.currentTime + delay;
  const oscillator = audio.createOscillator();
  const gain = audio.createGain();

  oscillator.type = type;
  oscillator.frequency.setValueAtTime(frequency, startTime);
  gain.gain.setValueAtTime(0.0001, startTime);
  gain.gain.exponentialRampToValueAtTime(volume, startTime + 0.01);
  gain.gain.exponentialRampToValueAtTime(0.0001, startTime + duration);
  oscillator.connect(gain);
  gain.connect(audio.destination);
  oscillator.start(startTime);
  oscillator.stop(startTime + duration + 0.02);
}

function playGameSound(cue) {
  if (!soundEnabled) return;

  const cues = {
    start: [
      [220, 0.07, 0, "triangle"],
      [330, 0.09, 0.06, "triangle"],
    ],
    bite: [[520, 0.07, 0, "square"]],
    "bonus-ready": [
      [660, 0.08, 0.08, "triangle"],
      [880, 0.12, 0.16, "triangle"],
    ],
    bonus: [
      [660, 0.09, 0, "triangle"],
      [880, 0.1, 0.07, "triangle"],
      [1100, 0.14, 0.14, "triangle"],
    ],
    pause: [[280, 0.09, 0, "sine"]],
    level: [
      [440, 0.11, 0, "triangle"],
      [660, 0.12, 0.09, "triangle"],
      [880, 0.16, 0.18, "triangle"],
    ],
    "game-over": [
      [260, 0.16, 0, "sawtooth", 0.025],
      [180, 0.24, 0.13, "sawtooth", 0.025],
    ],
    mode: [[390, 0.07, 0, "triangle"]],
    toggle: [[560, 0.08, 0, "sine"]],
  };

  (cues[cue] || []).forEach(([frequency, duration, delay, type, volume]) => {
    playTone(frequency, duration, delay, type, volume);
  });
}

function updateSoundControl() {
  soundButton.setAttribute("aria-pressed", String(soundEnabled));
  soundButton.setAttribute("aria-label", soundEnabled ? "Turn sound off" : "Turn sound on");
  soundLabel.textContent = soundEnabled ? "SFX on" : "SFX off";
  mobileSoundButton.setAttribute("aria-pressed", String(soundEnabled));
  mobileSoundButton.setAttribute(
    "aria-label",
    soundEnabled ? "Turn sound off" : "Turn sound on",
  );
  mobileSoundLabel.textContent = soundEnabled ? "Sound on" : "Sound off";
}

function toggleSound() {
  soundEnabled = !soundEnabled;
  saveSoundPreference();
  updateSoundControl();
  if (soundEnabled) playGameSound("toggle");
}

function formatScore(value) {
  return String(value).padStart(3, "0");
}

function formatLevel(value) {
  return String(value).padStart(2, "0");
}

function verticalCells(x, startY, endY, gaps = []) {
  const cells = [];
  for (let y = startY; y <= endY; y += 1) {
    if (!gaps.includes(y)) cells.push({ x, y });
  }
  return cells;
}

function horizontalCells(y, startX, endX, gaps = []) {
  const cells = [];
  for (let x = startX; x <= endX; x += 1) {
    if (!gaps.includes(x)) cells.push({ x, y });
  }
  return cells;
}

function blockCells(startX, startY, width, height) {
  const cells = [];
  for (let y = startY; y < startY + height; y += 1) {
    for (let x = startX; x < startX + width; x += 1) {
      cells.push({ x, y });
    }
  }
  return cells;
}

function diamondCells(centerX, centerY, radius) {
  const cells = [];
  for (let offsetX = -radius; offsetX <= radius; offsetX += 1) {
    const offsetY = radius - Math.abs(offsetX);
    const points = [
      { x: centerX + offsetX, y: centerY - offsetY },
      { x: centerX + offsetX, y: centerY + offsetY },
    ];

    points.forEach((point) => {
      const isOpening =
        (point.x === centerX && Math.abs(point.y - centerY) === radius) ||
        (point.y === centerY && Math.abs(point.x - centerX) === radius);
      const isDuplicate = cells.some(
        (cell) => cell.x === point.x && cell.y === point.y,
      );
      if (!isOpening && !isDuplicate) cells.push(point);
    });
  }
  return cells;
}

function getChallengeLevel(levelNumber = level) {
  const index = (levelNumber - 1) % CHALLENGE_LEVELS.length;
  const cycle = Math.floor((levelNumber - 1) / CHALLENGE_LEVELS.length);
  const definition = CHALLENGE_LEVELS[index];

  return {
    ...definition,
    name: cycle > 0 ? `${definition.name} · Loop ${cycle + 1}` : definition.name,
    target: definition.target + cycle * 2,
  };
}

function initializeSnake(startDirection = DIRECTIONS.right) {
  const center = Math.floor(GRID_SIZE / 2);
  snake = Array.from({ length: STARTING_LENGTH }, (_, index) => ({
    x: center - startDirection.x * index,
    y: center - startDirection.y * index,
  }));
}

function configureObstacleCourse() {
  if (currentMode !== GAME_MODES.CHALLENGE) {
    obstacles = [];
    challengeTarget = 0;
    return;
  }

  const definition = getChallengeLevel();
  const snakeCells = new Set(snake.map((segment) => `${segment.x},${segment.y}`));
  const uniqueCells = new Map();

  definition.build().forEach((cell) => {
    const key = `${cell.x},${cell.y}`;
    const isOnBoard =
      cell.x >= 0 && cell.x < GRID_SIZE && cell.y >= 0 && cell.y < GRID_SIZE;
    if (isOnBoard && !snakeCells.has(key)) uniqueCells.set(key, cell);
  });

  obstacles = [...uniqueCells.values()];
  challengeTarget = definition.target;
}

function resetGame(startDirectionName = "right") {
  direction = DIRECTIONS[startDirectionName] || DIRECTIONS.right;
  directionQueue = [];
  score = 0;
  level = 1;
  foodCount = 0;
  regularBiteStreak = 0;
  challengeProgress = 0;
  particles = [];
  impactFlash = 0;
  moveAccumulator = 0;
  initializeSnake(direction);
  configureObstacleCourse();
  placeFood();
  updateScoreboard();
  updateChallengeProgress();
}

function startGame(startDirectionName = "right") {
  resetGame(startDirectionName);
  gameState = GAME_STATES.RUNNING;
  updateInterface();
  canvas.focus({ preventScroll: true });
  playGameSound("start");
}

function startNextChallengeLevel(startDirectionName = "right") {
  if (currentMode !== GAME_MODES.CHALLENGE) {
    startGame(startDirectionName);
    return;
  }

  level += 1;
  direction = DIRECTIONS[startDirectionName] || DIRECTIONS.right;
  directionQueue = [];
  regularBiteStreak = 0;
  challengeProgress = 0;
  particles = [];
  impactFlash = 0;
  moveAccumulator = 0;
  initializeSnake(direction);
  configureObstacleCourse();
  placeFood();
  gameState = GAME_STATES.RUNNING;
  updateScoreboard();
  updateChallengeProgress();
  updateInterface();
  canvas.focus({ preventScroll: true });
  playGameSound("start");
}

function completeChallengeLevel() {
  food = null;
  moveAccumulator = 0;
  gameState = GAME_STATES.LEVEL_UP;
  updateInterface();
  playGameSound("level");
}

function selectGameMode(mode) {
  if (!MODE_DETAILS[mode] || mode === currentMode) return;

  currentMode = mode;
  saveGameMode();
  gameState = GAME_STATES.IDLE;
  resetGame();
  updateInterface();
  playGameSound("mode");
}

function selectStartingSpeed(value) {
  const nextLevel = Number.parseInt(value, 10);
  const isRunActive =
    gameState === GAME_STATES.RUNNING || gameState === GAME_STATES.PAUSED;

  if (!STARTING_SPEEDS[nextLevel] || nextLevel === startingSpeedLevel || isRunActive) {
    return;
  }

  startingSpeedLevel = nextLevel;
  saveStartingSpeed();
  updateSpeedInterface();
  playGameSound("mode");
}

function handlePrimaryAction() {
  if (gameState === GAME_STATES.LEVEL_UP) {
    startNextChallengeLevel();
  } else {
    startGame();
  }
}

function pauseGame() {
  if (gameState !== GAME_STATES.RUNNING) return;

  gameState = GAME_STATES.PAUSED;
  moveAccumulator = 0;
  updateInterface();
  playGameSound("pause");
}

function resumeGame() {
  if (gameState !== GAME_STATES.PAUSED) return;

  gameState = GAME_STATES.RUNNING;
  moveAccumulator = 0;
  lastFrameTime = performance.now();
  updateInterface();
  canvas.focus({ preventScroll: true });
  playGameSound("start");
}

function togglePause() {
  if (gameState === GAME_STATES.RUNNING) {
    pauseGame();
  } else if (gameState === GAME_STATES.PAUSED) {
    resumeGame();
  }
}

function placeFood(foodType = FOOD_TYPES.REGULAR) {
  const openCells = [];

  for (let y = 0; y < GRID_SIZE; y += 1) {
    for (let x = 0; x < GRID_SIZE; x += 1) {
      const isSnake = snake.some((segment) => segment.x === x && segment.y === y);
      const isObstacle = obstacles.some(
        (obstacle) => obstacle.x === x && obstacle.y === y,
      );
      if (!isSnake && !isObstacle) {
        openCells.push({ x, y });
      }
    }
  }

  if (openCells.length === 0) {
    food = null;
    finishGame("won");
    return false;
  }

  const cell = openCells[Math.floor(Math.random() * openCells.length)];
  food = {
    ...cell,
    type:
      currentMode === GAME_MODES.CHALLENGE ? FOOD_TYPES.REGULAR : foodType,
  };

  if (gameState === GAME_STATES.RUNNING) {
    statusElement.textContent =
      food.type === FOOD_TYPES.BONUS ? "50-point fruit" : "Running";
  }

  return true;
}

function queueDirection(directionName) {
  const nextDirection = DIRECTIONS[directionName];
  if (!nextDirection) return;

  if (
    gameState === GAME_STATES.IDLE ||
    gameState === GAME_STATES.OVER ||
    gameState === GAME_STATES.WON
  ) {
    startGame(directionName);
    return;
  }

  if (gameState === GAME_STATES.LEVEL_UP) {
    startNextChallengeLevel(directionName);
    return;
  }

  const lastDirection = directionQueue.at(-1) || direction;
  const isSameDirection =
    nextDirection.x === lastDirection.x && nextDirection.y === lastDirection.y;
  const isReverseDirection =
    nextDirection.x + lastDirection.x === 0 &&
    nextDirection.y + lastDirection.y === 0;

  if (isSameDirection || isReverseDirection || directionQueue.length >= 2) return;
  directionQueue.push(nextDirection);
}

function getMoveInterval() {
  const startingInterval = STARTING_SPEEDS[startingSpeedLevel].interval;
  return Math.max(
    MIN_MOVE_INTERVAL,
    startingInterval - (level - 1) * LEVEL_SPEED_INCREASE,
  );
}

function moveSnake() {
  if (directionQueue.length > 0) {
    direction = directionQueue.shift();
  }

  const head = snake[0];
  const rawNextHead = {
    x: head.x + direction.x,
    y: head.y + direction.y,
  };
  const crossedEdge =
    rawNextHead.x < 0 ||
    rawNextHead.x >= GRID_SIZE ||
    rawNextHead.y < 0 ||
    rawNextHead.y >= GRID_SIZE;
  const nextHead =
    currentMode === GAME_MODES.CLASSIC
      ? {
          x: (rawNextHead.x + GRID_SIZE) % GRID_SIZE,
          y: (rawNextHead.y + GRID_SIZE) % GRID_SIZE,
        }
      : rawNextHead;
  const hitWall = currentMode !== GAME_MODES.CLASSIC && crossedEdge;
  const ateFood = food && nextHead.x === food.x && nextHead.y === food.y;
  const bodyToCheck = ateFood ? snake : snake.slice(0, -1);
  const hitSelf = bodyToCheck.some(
    (segment) => segment.x === nextHead.x && segment.y === nextHead.y,
  );
  const hitObstacle = obstacles.some(
    (obstacle) => obstacle.x === nextHead.x && obstacle.y === nextHead.y,
  );

  if (hitWall || hitSelf || hitObstacle) {
    impactFlash = 1;
    const reason = hitWall ? "wall" : hitObstacle ? "obstacle" : "self";
    finishGame(reason);
    return;
  }

  snake.unshift(nextHead);

  if (ateFood) {
    const ateBonus = food.type === FOOD_TYPES.BONUS;
    createFoodBurst(food, ateBonus);
    score += ateBonus ? 50 : 10;
    foodCount += 1;
    playGameSound(ateBonus ? "bonus" : "bite");

    if (currentMode === GAME_MODES.CHALLENGE) {
      challengeProgress += 1;
    } else {
      regularBiteStreak = ateBonus ? 0 : regularBiteStreak + 1;
      level = Math.floor(foodCount / LEVEL_STEP) + 1;
    }

    if (score > bestScores[currentMode]) {
      bestScores[currentMode] = score;
      saveBestScores();
    }

    updateScoreboard();
    updateChallengeProgress();

    if (
      currentMode === GAME_MODES.CHALLENGE &&
      challengeProgress >= challengeTarget
    ) {
      completeChallengeLevel();
    } else {
      const nextFoodType =
        currentMode !== GAME_MODES.CHALLENGE &&
        regularBiteStreak >= BONUS_TRIGGER
          ? FOOD_TYPES.BONUS
          : FOOD_TYPES.REGULAR;
      placeFood(nextFoodType);
      if (nextFoodType === FOOD_TYPES.BONUS) playGameSound("bonus-ready");
    }
  } else {
    snake.pop();
  }
}

function finishGame(reason) {
  moveAccumulator = 0;

  if (reason === "won") {
    gameState = GAME_STATES.WON;
    playGameSound("level");
  } else {
    gameState = GAME_STATES.OVER;
    playGameSound("game-over");
  }

  updateInterface(reason);
}

function updateScoreboard() {
  scoreElement.textContent = formatScore(score);
  bestScoreElement.textContent = formatScore(bestScores[currentMode]);
  levelElement.textContent = formatLevel(level);
}

function updateChallengeProgress() {
  const isChallenge = currentMode === GAME_MODES.CHALLENGE;
  levelProgress.hidden = !isChallenge;

  if (!isChallenge) return;

  const definition = getChallengeLevel();
  const visibleProgress = Math.min(challengeProgress, challengeTarget);
  const ratio = challengeTarget > 0 ? visibleProgress / challengeTarget : 0;

  challengeLevelName.textContent = `Level ${formatLevel(level)} · ${definition.name}`;
  progressText.textContent = `${visibleProgress} / ${challengeTarget} bites`;
  progressTrack.setAttribute("aria-valuemax", String(challengeTarget));
  progressTrack.setAttribute("aria-valuenow", String(visibleProgress));
  progressFill.style.setProperty("--progress", String(ratio));
}

function updateModeInterface() {
  const details = MODE_DETAILS[currentMode];
  document.body.dataset.mode = currentMode;
  modeDescription.textContent = details.description;
  boardMode.textContent = details.label;

  modeButtons.forEach((button) => {
    const isActive = button.dataset.mode === currentMode;
    button.classList.toggle("is-active", isActive);
    button.setAttribute("aria-pressed", String(isActive));
  });

  updateChallengeProgress();
}

function updateSpeedInterface() {
  const details = STARTING_SPEEDS[startingSpeedLevel];
  const isRunActive =
    gameState === GAME_STATES.RUNNING || gameState === GAME_STATES.PAUSED;

  document.body.dataset.speed = String(startingSpeedLevel);
  speedLabel.textContent = `Level ${startingSpeedLevel} / ${details.label}`;

  speedButtons.forEach((button) => {
    const isActive = Number.parseInt(button.dataset.speed, 10) === startingSpeedLevel;
    button.classList.toggle("is-active", isActive);
    button.setAttribute("aria-pressed", String(isActive));
    button.disabled = isRunActive;
  });
}

function updateInterface(reason) {
  const isActive =
    gameState === GAME_STATES.RUNNING || gameState === GAME_STATES.PAUSED;

  document.body.dataset.state = gameState;
  updateModeInterface();
  updateSpeedInterface();
  pauseButton.disabled = !isActive;
  pauseButton.textContent = gameState === GAME_STATES.PAUSED ? "Resume" : "Pause";
  overlay.classList.toggle("is-hidden", gameState === GAME_STATES.RUNNING);

  if (gameState === GAME_STATES.IDLE) {
    statusElement.textContent = "Ready";
    actionButton.firstChild.textContent = "Start run ";

    if (currentMode === GAME_MODES.CLASSIC) {
      overlayTag.textContent = "Classic run / wrap";
      overlayTitle.textContent = "No edge is final.";
      overlayMessage.textContent =
        "Leave through any border and return from the opposite side.";
    } else if (currentMode === GAME_MODES.CHALLENGE) {
      const definition = getChallengeLevel();
      overlayTag.textContent = `Level ${formatLevel(level)} / ${definition.name}`;
      overlayTitle.textContent = "Enter the gauntlet.";
      overlayMessage.textContent = `Collect ${challengeTarget} bites without touching the obstacles.`;
    } else {
      overlayTag.textContent = "Walled run / 001";
      overlayTitle.textContent = "Take the field.";
      overlayMessage.textContent =
        "Grab the orange bites. Avoid the border and your own trail.";
    }

    hintAction.textContent = "start";
  } else if (gameState === GAME_STATES.RUNNING) {
    statusElement.textContent = "Running";
    actionButton.firstChild.textContent = "Restart run ";
  } else if (gameState === GAME_STATES.PAUSED) {
    statusElement.textContent = "Paused";
    actionButton.firstChild.textContent = "Restart run ";
    overlayTag.textContent = "Run status / held";
    overlayTitle.textContent = "Run held.";
    overlayMessage.textContent = "The field is frozen. Pick up exactly where you left off.";
    hintAction.textContent = "resume";
  } else if (gameState === GAME_STATES.LEVEL_UP) {
    const currentDefinition = getChallengeLevel();
    const nextDefinition = getChallengeLevel(level + 1);
    statusElement.textContent = "Level cleared";
    actionButton.firstChild.textContent = "Next level ";
    overlayTag.textContent = `Level ${formatLevel(level)} / complete`;
    overlayTitle.textContent = `${currentDefinition.name} cleared.`;
    overlayMessage.textContent = `Next: ${nextDefinition.name}. Fill ${nextDefinition.target} bites to advance.`;
    hintAction.textContent = "continue";
  } else if (gameState === GAME_STATES.WON) {
    statusElement.textContent = "Field cleared";
    actionButton.firstChild.textContent = "Play again ";
    overlayTag.textContent = "Field report / complete";
    overlayTitle.textContent = "Field cleared.";
    overlayMessage.textContent = `Every cell is yours. Final score: ${formatScore(score)}.`;
    hintAction.textContent = "restart";
  } else {
    statusElement.textContent = "Run ended";
    actionButton.firstChild.textContent = "Run again ";
    overlayTag.textContent = `Field report / ${formatScore(score)}`;
    overlayTitle.textContent =
      reason === "self"
        ? "Trail tangled."
        : reason === "obstacle"
          ? "Route blocked."
          : "Edge found.";
    overlayMessage.textContent = `You banked ${score} points and reached level ${formatLevel(level)}.`;
    hintAction.textContent = "restart";
  }
}

function createFoodBurst(cell, isBonus = false) {
  if (reduceMotion) return;

  const centerX = (cell.x + 0.5) / GRID_SIZE;
  const centerY = (cell.y + 0.5) / GRID_SIZE;

  const particleCount = isBonus ? 20 : 12;
  for (let index = 0; index < particleCount; index += 1) {
    const angle = (Math.PI * 2 * index) / particleCount + Math.random() * 0.2;
    const speed =
      (isBonus ? 0.00018 : 0.00012) + Math.random() * 0.00015;
    particles.push({
      x: centerX,
      y: centerY,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      life: 1,
      size: (isBonus ? 0.005 : 0.0035) + Math.random() * 0.004,
      color: isBonus
        ? index % 2 === 0
          ? "#ffe66d"
          : "#c9f34a"
        : index % 3 === 0
          ? "#c9f34a"
          : "#ff7043",
    });
  }
}

function updateParticles(deltaTime) {
  particles.forEach((particle) => {
    particle.x += particle.vx * deltaTime;
    particle.y += particle.vy * deltaTime;
    particle.vy += 0.00000035 * deltaTime;
    particle.life -= deltaTime / 430;
  });

  particles = particles.filter((particle) => particle.life > 0);
  impactFlash = Math.max(0, impactFlash - deltaTime / 360);
}

function roundedRectangle(x, y, width, height, radius) {
  const safeRadius = Math.min(radius, width / 2, height / 2);
  context.beginPath();
  context.moveTo(x + safeRadius, y);
  context.lineTo(x + width - safeRadius, y);
  context.quadraticCurveTo(x + width, y, x + width, y + safeRadius);
  context.lineTo(x + width, y + height - safeRadius);
  context.quadraticCurveTo(
    x + width,
    y + height,
    x + width - safeRadius,
    y + height,
  );
  context.lineTo(x + safeRadius, y + height);
  context.quadraticCurveTo(x, y + height, x, y + height - safeRadius);
  context.lineTo(x, y + safeRadius);
  context.quadraticCurveTo(x, y, x + safeRadius, y);
  context.closePath();
}

function drawBoard() {
  context.fillStyle = "#101914";
  context.fillRect(0, 0, logicalCanvasSize, logicalCanvasSize);

  const cellSize = logicalCanvasSize / GRID_SIZE;
  context.lineWidth = Math.max(0.65, logicalCanvasSize / 900);
  context.strokeStyle = "rgba(238, 241, 230, 0.055)";
  context.beginPath();

  for (let index = 1; index < GRID_SIZE; index += 1) {
    const position = index * cellSize;
    context.moveTo(position, 0);
    context.lineTo(position, logicalCanvasSize);
    context.moveTo(0, position);
    context.lineTo(logicalCanvasSize, position);
  }

  context.stroke();

  context.fillStyle = "rgba(238, 241, 230, 0.13)";
  for (let y = 0; y < GRID_SIZE; y += 1) {
    for (let x = 0; x < GRID_SIZE; x += 1) {
      if ((x + y) % 2 === 0) {
        const dotSize = Math.max(1, cellSize * 0.035);
        context.fillRect(
          x * cellSize + cellSize / 2 - dotSize / 2,
          y * cellSize + cellSize / 2 - dotSize / 2,
          dotSize,
          dotSize,
        );
      }
    }
  }
}

function drawObstacles() {
  if (obstacles.length === 0) return;

  const cellSize = logicalCanvasSize / GRID_SIZE;
  const inset = cellSize * 0.09;
  const size = cellSize - inset * 2;

  obstacles.forEach((obstacle, index) => {
    const x = obstacle.x * cellSize + inset;
    const y = obstacle.y * cellSize + inset;

    context.fillStyle = index % 2 === 0 ? "#46594d" : "#3d5045";
    context.strokeStyle = "#718277";
    context.lineWidth = Math.max(1, cellSize * 0.055);
    roundedRectangle(x, y, size, size, cellSize * 0.13);
    context.fill();
    context.stroke();

    context.strokeStyle = "rgba(201, 243, 74, 0.22)";
    context.lineWidth = Math.max(1, cellSize * 0.045);
    context.beginPath();
    context.moveTo(x + size * 0.28, y + size * 0.7);
    context.lineTo(x + size * 0.7, y + size * 0.28);
    context.stroke();
  });
}

function drawFood(timestamp) {
  if (!food) return;

  const cellSize = logicalCanvasSize / GRID_SIZE;
  const centerX = (food.x + 0.5) * cellSize;
  const centerY = (food.y + 0.5) * cellSize;
  const isBonus = food.type === FOOD_TYPES.BONUS;
  const pulse =
    reduceMotion ? 0 : Math.sin(timestamp / (isBonus ? 120 : 180)) * cellSize * 0.025;
  const radius = cellSize * (isBonus ? 0.38 : 0.265) + pulse;

  if (isBonus) {
    context.save();
    context.shadowColor = "rgba(255, 230, 109, 0.82)";
    context.shadowBlur = cellSize * 0.82;
    context.fillStyle = "#ffe66d";
    context.beginPath();
    context.arc(centerX, centerY, radius, 0, Math.PI * 2);
    context.fill();
    context.restore();

    context.strokeStyle = "#ff7043";
    context.lineWidth = Math.max(1.5, cellSize * 0.09);
    context.beginPath();
    context.arc(centerX, centerY, radius * 0.68, 0, Math.PI * 2);
    context.stroke();

    context.fillStyle = "rgba(255, 255, 255, 0.78)";
    context.beginPath();
    context.arc(
      centerX - radius * 0.3,
      centerY - radius * 0.32,
      radius * 0.16,
      0,
      Math.PI * 2,
    );
    context.fill();
  } else {
    context.save();
    context.shadowColor = "rgba(255, 112, 67, 0.58)";
    context.shadowBlur = cellSize * 0.55;
    context.fillStyle = "#ff7043";
    roundedRectangle(
      centerX - radius,
      centerY - radius,
      radius * 2,
      radius * 2,
      radius * 0.62,
    );
    context.fill();
    context.restore();
  }

  context.fillStyle = "#c9f34a";
  roundedRectangle(
    centerX + radius * 0.1,
    centerY - radius * 1.05,
    radius * 0.55,
    radius * 0.25,
    radius * 0.12,
  );
  context.fill();
}

function drawSnake() {
  const cellSize = logicalCanvasSize / GRID_SIZE;

  for (let index = snake.length - 1; index >= 0; index -= 1) {
    const segment = snake[index];
    const isHead = index === 0;
    const inset = cellSize * (isHead ? 0.07 : 0.105);
    const size = cellSize - inset * 2;

    context.fillStyle = isHead
      ? "#ddff77"
      : index % 2 === 0
        ? "#c9f34a"
        : "#b8df39";
    roundedRectangle(
      segment.x * cellSize + inset,
      segment.y * cellSize + inset,
      size,
      size,
      cellSize * (isHead ? 0.22 : 0.17),
    );
    context.fill();

    if (!isHead) {
      context.fillStyle = "rgba(255, 255, 255, 0.13)";
      roundedRectangle(
        segment.x * cellSize + inset + size * 0.13,
        segment.y * cellSize + inset + size * 0.12,
        size * 0.18,
        size * 0.12,
        size * 0.05,
      );
      context.fill();
    }
  }

  drawSnakeEyes(cellSize);
}

function drawSnakeEyes(cellSize) {
  const head = snake[0];
  if (!head) return;

  const centerX = (head.x + 0.5) * cellSize;
  const centerY = (head.y + 0.5) * cellSize;
  const forward = cellSize * 0.21;
  const spread = cellSize * 0.18;
  const eyeRadius = Math.max(1.4, cellSize * 0.065);
  const perpendicular = { x: -direction.y, y: direction.x };

  context.fillStyle = "#152019";
  [-1, 1].forEach((side) => {
    const eyeX =
      centerX + direction.x * forward + perpendicular.x * spread * side;
    const eyeY =
      centerY + direction.y * forward + perpendicular.y * spread * side;
    context.beginPath();
    context.arc(eyeX, eyeY, eyeRadius, 0, Math.PI * 2);
    context.fill();
  });
}

function drawParticles() {
  particles.forEach((particle) => {
    const size = particle.size * logicalCanvasSize;
    context.globalAlpha = Math.max(0, particle.life);
    context.fillStyle = particle.color;
    context.fillRect(
      particle.x * logicalCanvasSize - size / 2,
      particle.y * logicalCanvasSize - size / 2,
      size,
      size,
    );
  });
  context.globalAlpha = 1;
}

function draw(timestamp = 0) {
  context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
  context.clearRect(0, 0, logicalCanvasSize, logicalCanvasSize);
  drawBoard();
  drawObstacles();
  drawFood(timestamp);
  drawSnake();
  drawParticles();

  if (impactFlash > 0) {
    context.fillStyle = `rgba(255, 112, 67, ${impactFlash * 0.24})`;
    context.fillRect(0, 0, logicalCanvasSize, logicalCanvasSize);
  }
}

function resizeCanvas() {
  const displaySize = canvas.getBoundingClientRect().width;
  if (displaySize <= 0) return;

  pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
  const bitmapSize = Math.max(1, Math.round(displaySize * pixelRatio));

  if (canvas.width !== bitmapSize || canvas.height !== bitmapSize) {
    canvas.width = bitmapSize;
    canvas.height = bitmapSize;
  }

  logicalCanvasSize = bitmapSize / pixelRatio;
  draw(performance.now());
}

function gameLoop(timestamp) {
  const deltaTime = Math.min(timestamp - lastFrameTime, 100);
  lastFrameTime = timestamp;
  updateParticles(deltaTime);

  if (gameState === GAME_STATES.RUNNING) {
    moveAccumulator += deltaTime;
    let moveInterval = getMoveInterval();

    while (moveAccumulator >= moveInterval && gameState === GAME_STATES.RUNNING) {
      moveSnake();
      moveAccumulator -= moveInterval;
      moveInterval = getMoveInterval();
    }
  }

  draw(timestamp);
  requestAnimationFrame(gameLoop);
}

function handleKeydown(event) {
  const directionName = KEY_DIRECTIONS[event.key];

  if (directionName) {
    event.preventDefault();
    queueDirection(directionName);
    return;
  }

  if (event.target instanceof HTMLButtonElement && (event.key === " " || event.key === "Enter")) {
    return;
  }

  if (event.key === " ") {
    event.preventDefault();
    if (gameState === GAME_STATES.LEVEL_UP) {
      startNextChallengeLevel();
    } else if (
      gameState === GAME_STATES.RUNNING ||
      gameState === GAME_STATES.PAUSED
    ) {
      togglePause();
    } else {
      startGame();
    }
  } else if (event.key === "p" || event.key === "P") {
    event.preventDefault();
    togglePause();
  } else if (event.key === "r" || event.key === "R") {
    event.preventDefault();
    startGame();
  }
}

function handleSwipeEnd(event) {
  if (!swipeStart || event.pointerId !== swipeStart.pointerId) return;

  const deltaX = event.clientX - swipeStart.x;
  const deltaY = event.clientY - swipeStart.y;
  const distance = Math.max(Math.abs(deltaX), Math.abs(deltaY));
  swipeStart = null;

  if (distance < 22) return;

  if (Math.abs(deltaX) > Math.abs(deltaY)) {
    queueDirection(deltaX > 0 ? "right" : "left");
  } else {
    queueDirection(deltaY > 0 ? "down" : "up");
  }
}

actionButton.addEventListener("click", handlePrimaryAction);
pauseButton.addEventListener("click", togglePause);
soundButton.addEventListener("click", toggleSound);
mobileSoundButton.addEventListener("click", toggleSound);

overlay.addEventListener("click", () => {
  if (gameState === GAME_STATES.PAUSED) {
    resumeGame();
  } else if (gameState === GAME_STATES.LEVEL_UP) {
    startNextChallengeLevel();
  } else if (gameState !== GAME_STATES.RUNNING) {
    startGame();
  }
});

modeButtons.forEach((button) => {
  button.addEventListener("click", () => selectGameMode(button.dataset.mode));
});

speedButtons.forEach((button) => {
  button.addEventListener("click", () => selectStartingSpeed(button.dataset.speed));
});

touchButtons.forEach((button) => {
  button.addEventListener("pointerdown", (event) => {
    event.preventDefault();
    queueDirection(button.dataset.direction);
  });
});

canvasWrap.addEventListener("pointerdown", (event) => {
  swipeStart = { x: event.clientX, y: event.clientY, pointerId: event.pointerId };
  canvasWrap.setPointerCapture(event.pointerId);
});
canvasWrap.addEventListener("pointerup", handleSwipeEnd);
canvasWrap.addEventListener("pointercancel", () => {
  swipeStart = null;
});

document.addEventListener("keydown", handleKeydown);
document.addEventListener("visibilitychange", () => {
  if (document.hidden && gameState === GAME_STATES.RUNNING) {
    pauseGame();
  }
});

const resizeObserver = new ResizeObserver(resizeCanvas);
resizeObserver.observe(canvasWrap);

saveBestScores();
resetGame();
updateSoundControl();
updateInterface();
resizeCanvas();
requestAnimationFrame(gameLoop);
