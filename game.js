"use strict";

const GRID_SIZE = 20;
const STARTING_LENGTH = 4;
const BASE_MOVE_INTERVAL = 150;
const MIN_MOVE_INTERVAL = 68;
const LEVEL_STEP = 5;
const BEST_SCORE_KEY = "snake-field-best";

const GAME_STATES = Object.freeze({
  IDLE: "idle",
  RUNNING: "running",
  PAUSED: "paused",
  OVER: "over",
  WON: "won",
});

const DIRECTIONS = Object.freeze({
  up: { x: 0, y: -1 },
  down: { x: 0, y: 1 },
  left: { x: -1, y: 0 },
  right: { x: 1, y: 0 },
});

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
const overlay = document.querySelector("#gameOverlay");
const overlayTag = document.querySelector("#overlayTag");
const overlayTitle = document.querySelector("#overlayTitle");
const overlayMessage = document.querySelector("#overlayMessage");
const hintAction = document.querySelector("#hintAction");
const touchButtons = document.querySelectorAll("[data-direction]");

let gameState = GAME_STATES.IDLE;
let snake = [];
let food = null;
let direction = DIRECTIONS.right;
let directionQueue = [];
let score = 0;
let bestScore = readBestScore();
let level = 1;
let foodCount = 0;
let particles = [];
let impactFlash = 0;
let logicalCanvasSize = 600;
let pixelRatio = 1;
let lastFrameTime = performance.now();
let moveAccumulator = 0;
let swipeStart = null;

const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

function readBestScore() {
  try {
    const storedScore = Number.parseInt(localStorage.getItem(BEST_SCORE_KEY) || "0", 10);
    return Number.isFinite(storedScore) && storedScore > 0 ? storedScore : 0;
  } catch {
    return 0;
  }
}

function saveBestScore() {
  try {
    localStorage.setItem(BEST_SCORE_KEY, String(bestScore));
  } catch {
    // Storage can be unavailable in private browsing or restricted contexts.
  }
}

function formatScore(value) {
  return String(value).padStart(3, "0");
}

function formatLevel(value) {
  return String(value).padStart(2, "0");
}

function initializeSnake(startDirection = DIRECTIONS.right) {
  const center = Math.floor(GRID_SIZE / 2);
  snake = Array.from({ length: STARTING_LENGTH }, (_, index) => ({
    x: center - startDirection.x * index,
    y: center - startDirection.y * index,
  }));
}

function resetGame(startDirectionName = "right") {
  direction = DIRECTIONS[startDirectionName] || DIRECTIONS.right;
  directionQueue = [];
  score = 0;
  level = 1;
  foodCount = 0;
  particles = [];
  impactFlash = 0;
  moveAccumulator = 0;
  initializeSnake(direction);
  placeFood();
  updateScoreboard();
}

function startGame(startDirectionName = "right") {
  resetGame(startDirectionName);
  gameState = GAME_STATES.RUNNING;
  updateInterface();
  canvas.focus({ preventScroll: true });
}

function pauseGame() {
  if (gameState !== GAME_STATES.RUNNING) return;

  gameState = GAME_STATES.PAUSED;
  moveAccumulator = 0;
  updateInterface();
}

function resumeGame() {
  if (gameState !== GAME_STATES.PAUSED) return;

  gameState = GAME_STATES.RUNNING;
  moveAccumulator = 0;
  lastFrameTime = performance.now();
  updateInterface();
  canvas.focus({ preventScroll: true });
}

function togglePause() {
  if (gameState === GAME_STATES.RUNNING) {
    pauseGame();
  } else if (gameState === GAME_STATES.PAUSED) {
    resumeGame();
  }
}

function placeFood() {
  const openCells = [];

  for (let y = 0; y < GRID_SIZE; y += 1) {
    for (let x = 0; x < GRID_SIZE; x += 1) {
      if (!snake.some((segment) => segment.x === x && segment.y === y)) {
        openCells.push({ x, y });
      }
    }
  }

  if (openCells.length === 0) {
    food = null;
    finishGame("won");
    return false;
  }

  food = openCells[Math.floor(Math.random() * openCells.length)];
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
  return Math.max(MIN_MOVE_INTERVAL, BASE_MOVE_INTERVAL - (level - 1) * 10);
}

function moveSnake() {
  if (directionQueue.length > 0) {
    direction = directionQueue.shift();
  }

  const head = snake[0];
  const nextHead = {
    x: head.x + direction.x,
    y: head.y + direction.y,
  };
  const hitWall =
    nextHead.x < 0 ||
    nextHead.x >= GRID_SIZE ||
    nextHead.y < 0 ||
    nextHead.y >= GRID_SIZE;
  const ateFood = food && nextHead.x === food.x && nextHead.y === food.y;
  const bodyToCheck = ateFood ? snake : snake.slice(0, -1);
  const hitSelf = bodyToCheck.some(
    (segment) => segment.x === nextHead.x && segment.y === nextHead.y,
  );

  if (hitWall || hitSelf) {
    impactFlash = 1;
    finishGame(hitWall ? "wall" : "self");
    return;
  }

  snake.unshift(nextHead);

  if (ateFood) {
    createFoodBurst(food);
    score += 10;
    foodCount += 1;
    level = Math.floor(foodCount / LEVEL_STEP) + 1;

    if (score > bestScore) {
      bestScore = score;
      saveBestScore();
    }

    updateScoreboard();
    placeFood();
  } else {
    snake.pop();
  }
}

function finishGame(reason) {
  moveAccumulator = 0;

  if (reason === "won") {
    gameState = GAME_STATES.WON;
  } else {
    gameState = GAME_STATES.OVER;
  }

  updateInterface(reason);
}

function updateScoreboard() {
  scoreElement.textContent = formatScore(score);
  bestScoreElement.textContent = formatScore(bestScore);
  levelElement.textContent = formatLevel(level);
}

function updateInterface(reason) {
  const isActive =
    gameState === GAME_STATES.RUNNING || gameState === GAME_STATES.PAUSED;

  pauseButton.disabled = !isActive;
  pauseButton.textContent = gameState === GAME_STATES.PAUSED ? "Resume" : "Pause";
  overlay.classList.toggle("is-hidden", gameState === GAME_STATES.RUNNING);

  if (gameState === GAME_STATES.IDLE) {
    statusElement.textContent = "Ready";
    actionButton.firstChild.textContent = "Start run ";
    overlayTag.textContent = "Field notes / 001";
    overlayTitle.textContent = "Take the field.";
    overlayMessage.textContent =
      "Grab the orange bites. Avoid the border and your own trail.";
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
    overlayTitle.textContent = reason === "self" ? "Trail tangled." : "Edge found.";
    overlayMessage.textContent = `You banked ${score} points and reached level ${formatLevel(level)}.`;
    hintAction.textContent = "restart";
  }
}

function createFoodBurst(cell) {
  if (reduceMotion) return;

  const centerX = (cell.x + 0.5) / GRID_SIZE;
  const centerY = (cell.y + 0.5) / GRID_SIZE;

  for (let index = 0; index < 12; index += 1) {
    const angle = (Math.PI * 2 * index) / 12 + Math.random() * 0.2;
    const speed = 0.00012 + Math.random() * 0.00015;
    particles.push({
      x: centerX,
      y: centerY,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      life: 1,
      size: 0.0035 + Math.random() * 0.004,
      color: index % 3 === 0 ? "#c9f34a" : "#ff7043",
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

function drawFood(timestamp) {
  if (!food) return;

  const cellSize = logicalCanvasSize / GRID_SIZE;
  const centerX = (food.x + 0.5) * cellSize;
  const centerY = (food.y + 0.5) * cellSize;
  const pulse = reduceMotion ? 0 : Math.sin(timestamp / 180) * cellSize * 0.025;
  const radius = cellSize * 0.265 + pulse;

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
    if (gameState === GAME_STATES.RUNNING || gameState === GAME_STATES.PAUSED) {
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

actionButton.addEventListener("click", () => startGame());
pauseButton.addEventListener("click", togglePause);

overlay.addEventListener("click", () => {
  if (gameState === GAME_STATES.PAUSED) {
    resumeGame();
  } else if (gameState !== GAME_STATES.RUNNING) {
    startGame();
  }
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

initializeSnake();
placeFood();
updateScoreboard();
updateInterface();
resizeCanvas();
requestAnimationFrame(gameLoop);
