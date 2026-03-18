const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const fs = require('fs');
const cors = require('cors');

const GRID_SIZE = 32;
const DEFAULT_PIXEL = { r: 255, g: 255, b: 255, a: 255 };
const PORT = Number.parseInt(process.env.PORT || '3000', 10);
const STORAGE_FILE = process.env.STORAGE_FILE
  ? path.resolve(process.env.STORAGE_FILE)
  : path.join(__dirname, 'data', 'canvas.json');

function clonePixel(pixel) {
  return {
    r: pixel.r,
    g: pixel.g,
    b: pixel.b,
    a: pixel.a
  };
}

function createDefaultGrid() {
  return Array.from({ length: GRID_SIZE }, () =>
    Array.from({ length: GRID_SIZE }, () => clonePixel(DEFAULT_PIXEL))
  );
}

function isByte(value) {
  return Number.isInteger(value) && value >= 0 && value <= 255;
}

function sanitizeColor(color) {
  if (!color || typeof color !== 'object') {
    return null;
  }

  const candidate = {
    r: Number(color.r),
    g: Number(color.g),
    b: Number(color.b),
    a: color.a === undefined ? 255 : Number(color.a)
  };

  if (!isByte(candidate.r) || !isByte(candidate.g) || !isByte(candidate.b) || !isByte(candidate.a)) {
    return null;
  }

  return candidate;
}

function sanitizeGrid(grid) {
  if (!Array.isArray(grid) || grid.length !== GRID_SIZE) {
    return createDefaultGrid();
  }

  return Array.from({ length: GRID_SIZE }, (_, y) => {
    const row = Array.isArray(grid[y]) ? grid[y] : [];
    return Array.from({ length: GRID_SIZE }, (_, x) => {
      const color = sanitizeColor(row[x]);
      return color || clonePixel(DEFAULT_PIXEL);
    });
  });
}

function ensureStorageDirectory(filePath) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
}

function saveGrid(filePath, grid) {
  ensureStorageDirectory(filePath);
  const tempPath = `${filePath}.tmp`;
  fs.writeFileSync(tempPath, JSON.stringify(grid));
  fs.renameSync(tempPath, filePath);
}

function loadGrid(filePath) {
  try {
    if (!fs.existsSync(filePath)) {
      const freshGrid = createDefaultGrid();
      saveGrid(filePath, freshGrid);
      return freshGrid;
    }

    const savedGrid = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    const sanitizedGrid = sanitizeGrid(savedGrid);
    saveGrid(filePath, sanitizedGrid);
    return sanitizedGrid;
  } catch (error) {
    console.warn('Falling back to a fresh canvas:', error.message);
    const freshGrid = createDefaultGrid();
    saveGrid(filePath, freshGrid);
    return freshGrid;
  }
}

function isValidCoordinate(value) {
  return Number.isInteger(value) && value >= 0 && value < GRID_SIZE;
}

function applyPixelUpdate(grid, update) {
  grid[update.y][update.x] = clonePixel(update.color);
}

function createApp() {
  const app = express();
  app.use(cors());
  app.use(express.static(path.join(__dirname, 'public')));
  return app;
}

function createServer(storageFile = STORAGE_FILE) {
  const app = createApp();
  const server = http.createServer(app);
  const io = new Server(server, {
    cors: {
      origin: '*',
      methods: ['GET', 'POST']
    }
  });

  let pixelGrid = loadGrid(storageFile);

  app.get('/api/health', (_req, res) => {
    res.json({
      status: 'ok',
      gridSize: GRID_SIZE,
      storageFile
    });
  });

  io.on('connection', (socket) => {
    console.log('User connected:', socket.id);
    socket.emit('grid:init', pixelGrid);

    socket.on('draw', (payload) => {
      const x = Number(payload?.x);
      const y = Number(payload?.y);
      const color = sanitizeColor(payload?.color);

      if (!isValidCoordinate(x) || !isValidCoordinate(y) || !color) {
        return;
      }

      const update = { x, y, color };
      applyPixelUpdate(pixelGrid, update);
      saveGrid(storageFile, pixelGrid);
      io.emit('pixel:update', update);
    });

    socket.on('clear', () => {
      pixelGrid = createDefaultGrid();
      saveGrid(storageFile, pixelGrid);
      io.emit('grid:clear', pixelGrid);
    });

    socket.on('disconnect', () => {
      console.log('User disconnected:', socket.id);
    });
  });

  return { app, server, io, getGrid: () => pixelGrid };
}

function startServer(port = PORT, storageFile = STORAGE_FILE) {
  const { server } = createServer(storageFile);
  server.listen(port, () => {
    console.log(`Server running on http://localhost:${port}`);
  });
  return server;
}

if (require.main === module) {
  startServer();
}

module.exports = {
  GRID_SIZE,
  STORAGE_FILE,
  PORT,
  createApp,
  createDefaultGrid,
  createServer,
  loadGrid,
  sanitizeColor,
  sanitizeGrid,
  saveGrid,
  startServer
};
