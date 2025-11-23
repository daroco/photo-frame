const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');
const WebSocket = require('ws');
const http = require('http');
const sqlite3 = require('sqlite3').verbose();

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors());
app.use(bodyParser.json());
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));
app.use('/photos', express.static(path.join(__dirname, 'photos')));

// Create necessary directories
const uploadDir = path.join(__dirname, 'uploads');
const photosDir = path.join(__dirname, 'photos');
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });
if (!fs.existsSync(photosDir)) fs.mkdirSync(photosDir, { recursive: true });

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, photosDir);
  },
  filename: (req, file, cb) => {
    const uniqueName = `${uuidv4()}${path.extname(file.originalname)}`;
    cb(null, uniqueName);
  }
});
const upload = multer({ storage });

// Initialize SQLite database
const db = new sqlite3.Database('./frames.db', (err) => {
  if (err) {
    console.error('Error opening database:', err);
  } else {
    console.log('Connected to SQLite database');
    initDatabase();
  }
});

function initDatabase() {
  // Frames table
  db.run(`CREATE TABLE IF NOT EXISTS frames (
    id TEXT PRIMARY KEY,
    name TEXT,
    ip_address TEXT,
    width INTEGER DEFAULT 800,
    height INTEGER DEFAULT 600,
    position_x INTEGER DEFAULT 0,
    position_y INTEGER DEFAULT 0,
    status TEXT DEFAULT 'online',
    last_seen DATETIME DEFAULT CURRENT_TIMESTAMP,
    registered_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`, (err) => {
    if (err) console.error('Error creating frames table:', err);
  });

  // Photos table
  db.run(`CREATE TABLE IF NOT EXISTS photos (
    id TEXT PRIMARY KEY,
    filename TEXT,
    original_name TEXT,
    uploaded_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`, (err) => {
    if (err) console.error('Error creating photos table:', err);
  });

  // Frame photos mapping (for individual mode)
  db.run(`CREATE TABLE IF NOT EXISTS frame_photos (
    frame_id TEXT,
    photo_id TEXT,
    FOREIGN KEY(frame_id) REFERENCES frames(id),
    FOREIGN KEY(photo_id) REFERENCES photos(id),
    PRIMARY KEY(frame_id, photo_id)
  )`, (err) => {
    if (err) console.error('Error creating frame_photos table:', err);
  });

  // Overlay configuration
  db.run(`CREATE TABLE IF NOT EXISTS overlay_config (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    photo_id TEXT,
    enabled INTEGER DEFAULT 0,
    FOREIGN KEY(photo_id) REFERENCES photos(id)
  )`, (err) => {
    if (err) console.error('Error creating overlay_config table:', err);
    else {
      // Insert default overlay config if doesn't exist
      db.run(`INSERT OR IGNORE INTO overlay_config (id, enabled) VALUES (1, 0)`, (err) => {
        if (err) console.error('Error inserting default overlay config:', err);
      });
    }
  });
}

// WebSocket server for real-time updates
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

const connectedFrames = new Map(); // frameId -> WebSocket connection

wss.on('connection', (ws, req) => {
  console.log('WebSocket connection established');
  
  ws.on('message', (message) => {
    try {
      const data = JSON.parse(message);
      
      if (data.type === 'register') {
        connectedFrames.set(data.frameId, ws);
        console.log(`Frame ${data.frameId} connected via WebSocket`);
        
        // Update frame status
        updateFrameStatus(data.frameId, 'online');
      } else if (data.type === 'heartbeat') {
        updateFrameStatus(data.frameId, 'online');
      }
    } catch (error) {
      console.error('Error processing WebSocket message:', error);
    }
  });

  ws.on('close', () => {
    // Remove from connected frames
    for (const [frameId, socket] of connectedFrames.entries()) {
      if (socket === ws) {
        connectedFrames.delete(frameId);
        updateFrameStatus(frameId, 'offline');
        console.log(`Frame ${frameId} disconnected`);
        break;
      }
    }
  });
});

function updateFrameStatus(frameId, status) {
  db.run(
    'UPDATE frames SET status = ?, last_seen = CURRENT_TIMESTAMP WHERE id = ?',
    [status, frameId]
  );
}

function broadcastToFrames(message) {
  connectedFrames.forEach((ws, frameId) => {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(message));
    }
  });
}

function sendToFrame(frameId, message) {
  const ws = connectedFrames.get(frameId);
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(message));
  }
}

// API Endpoints

// Frame registration
app.post('/api/frames/register', (req, res) => {
  const { name, ip_address, width, height } = req.body;
  const id = uuidv4();

  db.run(
    `INSERT INTO frames (id, name, ip_address, width, height) VALUES (?, ?, ?, ?, ?)`,
    [id, name || `Frame-${id.substring(0, 8)}`, ip_address, width || 800, height || 600],
    (err) => {
      if (err) {
        console.error('Error registering frame:', err);
        return res.status(500).json({ error: 'Failed to register frame' });
      }
      
      res.json({
        id,
        name: name || `Frame-${id.substring(0, 8)}`,
        ip_address,
        width: width || 800,
        height: height || 600,
        status: 'online'
      });
      
      // Notify all clients about new frame
      broadcastToFrames({ type: 'frame_added', frameId: id });
    }
  );
});

// Get all frames
app.get('/api/frames', (req, res) => {
  db.all('SELECT * FROM frames ORDER BY registered_at DESC', [], (err, rows) => {
    if (err) {
      console.error('Error fetching frames:', err);
      return res.status(500).json({ error: 'Failed to fetch frames' });
    }
    res.json(rows);
  });
});

// Get single frame
app.get('/api/frames/:id', (req, res) => {
  db.get('SELECT * FROM frames WHERE id = ?', [req.params.id], (err, row) => {
    if (err) {
      console.error('Error fetching frame:', err);
      return res.status(500).json({ error: 'Failed to fetch frame' });
    }
    if (!row) {
      return res.status(404).json({ error: 'Frame not found' });
    }
    res.json(row);
  });
});

// Update frame
app.put('/api/frames/:id', (req, res) => {
  const { name, position_x, position_y, width, height } = req.body;
  const updates = [];
  const values = [];

  if (name !== undefined) {
    updates.push('name = ?');
    values.push(name);
  }
  if (position_x !== undefined) {
    updates.push('position_x = ?');
    values.push(position_x);
  }
  if (position_y !== undefined) {
    updates.push('position_y = ?');
    values.push(position_y);
  }
  if (width !== undefined) {
    updates.push('width = ?');
    values.push(width);
  }
  if (height !== undefined) {
    updates.push('height = ?');
    values.push(height);
  }

  values.push(req.params.id);

  db.run(
    `UPDATE frames SET ${updates.join(', ')} WHERE id = ?`,
    values,
    (err) => {
      if (err) {
        console.error('Error updating frame:', err);
        return res.status(500).json({ error: 'Failed to update frame' });
      }
      res.json({ success: true });
      
      // Notify frames about layout change
      broadcastToFrames({ type: 'layout_updated' });
    }
  );
});

// Delete frame
app.delete('/api/frames/:id', (req, res) => {
  db.run('DELETE FROM frames WHERE id = ?', [req.params.id], (err) => {
    if (err) {
      console.error('Error deleting frame:', err);
      return res.status(500).json({ error: 'Failed to delete frame' });
    }
    
    // Also delete frame photo mappings
    db.run('DELETE FROM frame_photos WHERE frame_id = ?', [req.params.id]);
    
    res.json({ success: true });
    
    // Notify all clients
    broadcastToFrames({ type: 'frame_removed', frameId: req.params.id });
  });
});

// Upload photo
app.post('/api/photos/upload', upload.single('photo'), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No file uploaded' });
  }

  const id = uuidv4();
  db.run(
    'INSERT INTO photos (id, filename, original_name) VALUES (?, ?, ?)',
    [id, req.file.filename, req.file.originalname],
    (err) => {
      if (err) {
        console.error('Error saving photo:', err);
        return res.status(500).json({ error: 'Failed to save photo' });
      }
      
      res.json({
        id,
        filename: req.file.filename,
        original_name: req.file.originalname,
        url: `/photos/${req.file.filename}`
      });
    }
  );
});

// Get all photos
app.get('/api/photos', (req, res) => {
  db.all('SELECT * FROM photos ORDER BY uploaded_at DESC', [], (err, rows) => {
    if (err) {
      console.error('Error fetching photos:', err);
      return res.status(500).json({ error: 'Failed to fetch photos' });
    }
    
    const photos = rows.map(photo => ({
      ...photo,
      url: `/photos/${photo.filename}`
    }));
    
    res.json(photos);
  });
});

// Delete photo
app.delete('/api/photos/:id', (req, res) => {
  db.get('SELECT filename FROM photos WHERE id = ?', [req.params.id], (err, photo) => {
    if (err || !photo) {
      return res.status(404).json({ error: 'Photo not found' });
    }

    // Delete file
    const filePath = path.join(photosDir, photo.filename);
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }

    // Delete from database
    db.run('DELETE FROM photos WHERE id = ?', [req.params.id], (err) => {
      if (err) {
        return res.status(500).json({ error: 'Failed to delete photo' });
      }
      
      // Delete mappings
      db.run('DELETE FROM frame_photos WHERE photo_id = ?', [req.params.id]);
      
      res.json({ success: true });
    });
  });
});

// Assign photo to frame
app.post('/api/frames/:frameId/photos', (req, res) => {
  const { photoId } = req.body;
  
  // First, clear existing photos for this frame
  db.run('DELETE FROM frame_photos WHERE frame_id = ?', [req.params.frameId], (err) => {
    if (err) {
      return res.status(500).json({ error: 'Failed to assign photo' });
    }
    
    // Then add new mapping
    db.run(
      'INSERT INTO frame_photos (frame_id, photo_id) VALUES (?, ?)',
      [req.params.frameId, photoId],
      (err) => {
        if (err) {
          return res.status(500).json({ error: 'Failed to assign photo' });
        }
        
        res.json({ success: true });
        
        // Notify frame about new photo
        sendToFrame(req.params.frameId, {
          type: 'photo_updated',
          photoId
        });
      }
    );
  });
});

// Get photo for frame
app.get('/api/frames/:frameId/photo', (req, res) => {
  // First check if overlay mode is enabled
  db.get('SELECT * FROM overlay_config WHERE id = 1', [], (err, overlayConfig) => {
    if (err) {
      return res.status(500).json({ error: 'Failed to fetch configuration' });
    }

    if (overlayConfig && overlayConfig.enabled && overlayConfig.photo_id) {
      // Overlay mode - calculate which portion of the image this frame should display
      db.get('SELECT * FROM frames WHERE id = ?', [req.params.frameId], (err, frame) => {
        if (err || !frame) {
          return res.status(404).json({ error: 'Frame not found' });
        }

        db.get('SELECT * FROM photos WHERE id = ?', [overlayConfig.photo_id], (err, photo) => {
          if (err || !photo) {
            return res.status(404).json({ error: 'Photo not found' });
          }

          // Get all frames to calculate total layout bounds
          db.all('SELECT * FROM frames', [], (err, allFrames) => {
            if (err) {
              return res.status(500).json({ error: 'Failed to fetch frames' });
            }

            // Calculate bounding box of all frames
            const minX = Math.min(...allFrames.map(f => f.position_x));
            const minY = Math.min(...allFrames.map(f => f.position_y));
            const maxX = Math.max(...allFrames.map(f => f.position_x + f.width));
            const maxY = Math.max(...allFrames.map(f => f.position_y + f.height));
            
            const totalWidth = maxX - minX;
            const totalHeight = maxY - minY;

            // Calculate this frame's position relative to the layout
            const relativeX = frame.position_x - minX;
            const relativeY = frame.position_y - minY;

            res.json({
              mode: 'overlay',
              photo: {
                id: photo.id,
                url: `/photos/${photo.filename}`,
                filename: photo.filename
              },
              viewport: {
                x: relativeX / totalWidth,
                y: relativeY / totalHeight,
                width: frame.width / totalWidth,
                height: frame.height / totalHeight
              }
            });
          });
        });
      });
    } else {
      // Individual mode - get assigned photo
      db.get(
        `SELECT p.* FROM photos p 
         INNER JOIN frame_photos fp ON p.id = fp.photo_id 
         WHERE fp.frame_id = ?`,
        [req.params.frameId],
        (err, photo) => {
          if (err) {
            return res.status(500).json({ error: 'Failed to fetch photo' });
          }
          
          if (!photo) {
            return res.json({ mode: 'individual', photo: null });
          }
          
          res.json({
            mode: 'individual',
            photo: {
              id: photo.id,
              url: `/photos/${photo.filename}`,
              filename: photo.filename
            }
          });
        }
      );
    }
  });
});

// Get overlay configuration
app.get('/api/overlay', (req, res) => {
  db.get('SELECT * FROM overlay_config WHERE id = 1', [], (err, config) => {
    if (err) {
      return res.status(500).json({ error: 'Failed to fetch overlay config' });
    }
    
    if (!config || !config.photo_id) {
      return res.json({ enabled: false, photo: null });
    }
    
    db.get('SELECT * FROM photos WHERE id = ?', [config.photo_id], (err, photo) => {
      if (err || !photo) {
        return res.json({ enabled: config.enabled === 1, photo: null });
      }
      
      res.json({
        enabled: config.enabled === 1,
        photo: {
          id: photo.id,
          url: `/photos/${photo.filename}`,
          filename: photo.filename,
          original_name: photo.original_name
        }
      });
    });
  });
});

// Set overlay configuration
app.post('/api/overlay', (req, res) => {
  const { enabled, photoId } = req.body;
  
  db.run(
    'UPDATE overlay_config SET enabled = ?, photo_id = ? WHERE id = 1',
    [enabled ? 1 : 0, photoId || null],
    (err) => {
      if (err) {
        console.error('Error updating overlay config:', err);
        return res.status(500).json({ error: 'Failed to update overlay config' });
      }
      
      res.json({ success: true });
      
      // Notify all frames about mode change
      broadcastToFrames({
        type: 'mode_changed',
        mode: enabled ? 'overlay' : 'individual'
      });
    }
  );
});

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Start server
server.listen(PORT, () => {
  console.log(`Photo Frame server running on port ${PORT}`);
  console.log(`API: http://localhost:${PORT}/api`);
  console.log(`WebSocket: ws://localhost:${PORT}`);
});

// Cleanup on exit
process.on('SIGINT', () => {
  db.close((err) => {
    if (err) {
      console.error('Error closing database:', err);
    }
    console.log('Database connection closed');
    process.exit(0);
  });
});
