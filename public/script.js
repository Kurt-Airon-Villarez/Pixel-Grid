const canvas = document.getElementById('pixelCanvas');
const ctx = canvas.getContext('2d');
const clearBtn = document.getElementById('clearBtn');
const status = document.getElementById('status');

const GRID_SIZE = 32;
const CELL_SIZE = canvas.width / GRID_SIZE;
const socket = io();

let currentColor = { r: 0, g: 0, b: 0, a: 255 };
let pixelGrid = createDefaultGrid();
let isDrawing = false;

canvas.addEventListener('mousedown', startDrawing);
canvas.addEventListener('mousemove', handlePointerDraw);
canvas.addEventListener('mouseup', stopDrawing);
canvas.addEventListener('mouseleave', stopDrawing);
canvas.addEventListener('touchstart', handleTouchStart, { passive: false });
canvas.addEventListener('touchmove', handleTouchMove, { passive: false });
canvas.addEventListener('touchend', stopDrawing);

clearBtn.addEventListener('click', () => {
  const clearedGrid = createDefaultGrid();
  renderGrid(clearedGrid);
  socket.emit('clear');
});

function cloneColor(color) {
  return {
    r: color.r,
    g: color.g,
    b: color.b,
    a: color.a
  };
}

function createDefaultGrid() {
  return Array.from({ length: GRID_SIZE }, () =>
    Array.from({ length: GRID_SIZE }, () => ({ r: 255, g: 255, b: 255, a: 255 }))
  );
}

function hexToRgba(hex) {
  return {
    r: parseInt(hex.slice(1, 3), 16),
    g: parseInt(hex.slice(3, 5), 16),
    b: parseInt(hex.slice(5, 7), 16),
    a: 255
  };
}

function getGridPosition(clientX, clientY) {
  const rect = canvas.getBoundingClientRect();
  const x = Math.floor(((clientX - rect.left) / rect.width) * GRID_SIZE);
  const y = Math.floor(((clientY - rect.top) / rect.height) * GRID_SIZE);

  if (x < 0 || x >= GRID_SIZE || y < 0 || y >= GRID_SIZE) {
    return null;
  }

  return { x, y };
}

function drawPixel(x, y, color) {
  pixelGrid[y][x] = cloneColor(color);
  ctx.fillStyle = `rgba(${color.r}, ${color.g}, ${color.b}, ${color.a / 255})`;
  ctx.fillRect(x * CELL_SIZE, y * CELL_SIZE, CELL_SIZE, CELL_SIZE);
  ctx.strokeStyle = '#eee';
  ctx.lineWidth = 0.5;
  ctx.strokeRect(x * CELL_SIZE, y * CELL_SIZE, CELL_SIZE, CELL_SIZE);
}

function renderGrid(grid) {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  pixelGrid = grid.map((row) => row.map((pixel) => cloneColor(pixel)));

  for (let y = 0; y < GRID_SIZE; y += 1) {
    for (let x = 0; x < GRID_SIZE; x += 1) {
      drawPixel(x, y, pixelGrid[y][x]);
    }
  }
}

function emitDraw(position) {
  if (!position) {
    return;
  }

  drawPixel(position.x, position.y, currentColor);
  socket.emit('draw', {
    x: position.x,
    y: position.y,
    color: currentColor
  });
}

function startDrawing(event) {
  isDrawing = true;
  emitDraw(getGridPosition(event.clientX, event.clientY));
}

function handlePointerDraw(event) {
  if (!isDrawing) {
    return;
  }

  emitDraw(getGridPosition(event.clientX, event.clientY));
}

function stopDrawing() {
  isDrawing = false;
}

function handleTouchStart(event) {
  event.preventDefault();
  isDrawing = true;
  handleTouchMove(event);
}

function handleTouchMove(event) {
  event.preventDefault();

  Array.from(event.touches).forEach((touch) => {
    emitDraw(getGridPosition(touch.clientX, touch.clientY));
  });
}

document.addEventListener('DOMContentLoaded', () => {
  const colorButtons = document.querySelectorAll('.color-btn');

  colorButtons.forEach((button) => {
    button.addEventListener('click', () => {
      currentColor = hexToRgba(button.dataset.color);
      colorButtons.forEach((item) => item.classList.remove('active'));
      button.classList.add('active');
    });
  });

  if (colorButtons[0]) {
    colorButtons[0].classList.add('active');
  }

  renderGrid(pixelGrid);
});

socket.on('connect', () => {
  status.textContent = `Connected (${socket.id.slice(0, 8)}...)`;
});

socket.on('disconnect', () => {
  status.textContent = 'Disconnected';
});

socket.on('grid:init', (grid) => {
  renderGrid(grid);
});

socket.on('pixel:update', ({ x, y, color }) => {
  if (Number.isInteger(x) && Number.isInteger(y) && color) {
    drawPixel(x, y, color);
  }
});

socket.on('grid:clear', (grid) => {
  renderGrid(grid);
});
