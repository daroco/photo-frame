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
const rateLimit = require('express-rate-limit');
const { google } = require('googleapis');

const app = express();
const PORT = process.env.PORT || 3001;

// Rate limiting middleware
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // Limit each IP to 100 requests per windowMs
  message: 'Too many requests from this IP, please try again later.',
  standardHeaders: true,
  legacyHeaders: false,
});

const uploadLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 20, // Limit uploads
  message: 'Too many uploads from this IP, please try again later.',
});

// Middleware
app.use(cors());
app.use(bodyParser.json());
app.use('/api', apiLimiter); // Apply rate limiting to API routes
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

  // Google Photos OAuth tokens table
  db.run(`CREATE TABLE IF NOT EXISTS google_auth (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    access_token TEXT,
    refresh_token TEXT,
    expiry_date INTEGER,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`, (err) => {
    if (err) console.error('Error creating google_auth table:', err);
  });

  // Google Photos slideshow configuration table
  db.run(`CREATE TABLE IF NOT EXISTS slideshow_config (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    enabled INTEGER DEFAULT 0,
    album_id TEXT,
    album_title TEXT,
    rotation_interval INTEGER DEFAULT 30,
    panoramic_frequency INTEGER DEFAULT 5,
    current_index INTEGER DEFAULT 0,
    last_rotation DATETIME,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`, (err) => {
    if (err) console.error('Error creating slideshow_config table:', err);
    else {
      // Insert default slideshow config if doesn't exist
      db.run(`INSERT OR IGNORE INTO slideshow_config (id, enabled, rotation_interval, panoramic_frequency) VALUES (1, 0, 30, 5)`, (err) => {
        if (err) console.error('Error inserting default slideshow config:', err);
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
app.post('/api/photos/upload', uploadLimiter, upload.single('photo'), (req, res) => {
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

// =====================
// Google Photos Integration
// =====================

// Google OAuth2 configuration
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;
const GOOGLE_REDIRECT_URI = process.env.GOOGLE_REDIRECT_URI || 'http://localhost:3001/api/google/callback';

function getOAuth2Client() {
  return new google.auth.OAuth2(
    GOOGLE_CLIENT_ID,
    GOOGLE_CLIENT_SECRET,
    GOOGLE_REDIRECT_URI
  );
}

// Helper to get authenticated OAuth2 client from stored tokens
function getAuthenticatedClient() {
  return new Promise((resolve, reject) => {
    db.get('SELECT * FROM google_auth WHERE id = 1', [], (err, row) => {
      if (err) {
        return reject(new Error('Database error'));
      }
      if (!row || !row.refresh_token) {
        return reject(new Error('Not authenticated with Google'));
      }
      
      const oauth2Client = getOAuth2Client();
      oauth2Client.setCredentials({
        access_token: row.access_token,
        refresh_token: row.refresh_token,
        expiry_date: row.expiry_date
      });
      
      // Handle token refresh
      oauth2Client.on('tokens', (tokens) => {
        const updateFields = ['access_token = ?'];
        const updateValues = [tokens.access_token];
        
        if (tokens.refresh_token) {
          updateFields.push('refresh_token = ?');
          updateValues.push(tokens.refresh_token);
        }
        if (tokens.expiry_date) {
          updateFields.push('expiry_date = ?');
          updateValues.push(tokens.expiry_date);
        }
        updateFields.push('updated_at = CURRENT_TIMESTAMP');
        
        db.run(
          `UPDATE google_auth SET ${updateFields.join(', ')} WHERE id = 1`,
          updateValues
        );
      });
      
      resolve(oauth2Client);
    });
  });
}

// Get Google auth status
app.get('/api/google/status', (req, res) => {
  db.get('SELECT * FROM google_auth WHERE id = 1', [], (err, row) => {
    if (err) {
      return res.status(500).json({ error: 'Database error' });
    }
    
    const isConfigured = !!(GOOGLE_CLIENT_ID && GOOGLE_CLIENT_SECRET);
    const isAuthenticated = !!(row && row.refresh_token);
    
    res.json({
      configured: isConfigured,
      authenticated: isAuthenticated
    });
  });
});

// Get Google OAuth URL
app.get('/api/google/auth-url', (req, res) => {
  if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET) {
    return res.status(400).json({ 
      error: 'Google OAuth is not configured. Please set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET environment variables.' 
    });
  }
  
  const oauth2Client = getOAuth2Client();
  const scopes = [
    'https://www.googleapis.com/auth/photoslibrary.readonly'
  ];
  
  const authUrl = oauth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: scopes,
    prompt: 'consent'
  });
  
  res.json({ url: authUrl });
});

// Google OAuth callback
app.get('/api/google/callback', async (req, res) => {
  const { code, error } = req.query;
  
  if (error) {
    return res.redirect('/?google_auth=error&message=' + encodeURIComponent(error));
  }
  
  if (!code) {
    return res.redirect('/?google_auth=error&message=No+authorization+code');
  }
  
  try {
    const oauth2Client = getOAuth2Client();
    const { tokens } = await oauth2Client.getToken(code);
    
    // Store tokens in database
    db.run(
      `INSERT OR REPLACE INTO google_auth (id, access_token, refresh_token, expiry_date, updated_at) 
       VALUES (1, ?, ?, ?, CURRENT_TIMESTAMP)`,
      [tokens.access_token, tokens.refresh_token, tokens.expiry_date],
      (err) => {
        if (err) {
          console.error('Error storing Google tokens:', err);
          return res.redirect('/?google_auth=error&message=Failed+to+store+credentials');
        }
        
        // Redirect to frontend with success message
        res.redirect('/?google_auth=success');
      }
    );
  } catch (err) {
    console.error('Error exchanging Google auth code:', err);
    res.redirect('/?google_auth=error&message=' + encodeURIComponent(err.message));
  }
});

// Disconnect Google account
app.post('/api/google/disconnect', (req, res) => {
  db.run('DELETE FROM google_auth WHERE id = 1', [], (err) => {
    if (err) {
      return res.status(500).json({ error: 'Failed to disconnect Google account' });
    }
    
    // Also disable slideshow if it was using Google Photos
    db.run('UPDATE slideshow_config SET enabled = 0, album_id = NULL, album_title = NULL WHERE id = 1', [], (err) => {
      if (err) {
        console.error('Error disabling slideshow:', err);
      }
    });
    
    res.json({ success: true });
  });
});

// List Google Photos albums
app.get('/api/google/albums', async (req, res) => {
  try {
    const oauth2Client = await getAuthenticatedClient();
    
    // Use the Photos Library API directly since googleapis doesn't have a built-in library
    const response = await oauth2Client.request({
      url: 'https://photoslibrary.googleapis.com/v1/albums',
      method: 'GET',
      params: {
        pageSize: 50
      }
    });
    
    const albums = (response.data.albums || []).map(album => ({
      id: album.id,
      title: album.title,
      mediaItemsCount: album.mediaItemsCount || 0,
      coverPhotoBaseUrl: album.coverPhotoBaseUrl
    }));
    
    res.json({ albums });
  } catch (err) {
    console.error('Error fetching Google Photos albums:', err);
    if (err.message === 'Not authenticated with Google') {
      return res.status(401).json({ error: 'Not authenticated with Google' });
    }
    res.status(500).json({ error: 'Failed to fetch albums' });
  }
});

// Get photos from a specific album
app.get('/api/google/albums/:albumId/photos', async (req, res) => {
  try {
    const oauth2Client = await getAuthenticatedClient();
    const { albumId } = req.params;
    const pageToken = req.query.pageToken;
    
    const requestBody = {
      albumId,
      pageSize: 100
    };
    
    if (pageToken) {
      requestBody.pageToken = pageToken;
    }
    
    const response = await oauth2Client.request({
      url: 'https://photoslibrary.googleapis.com/v1/mediaItems:search',
      method: 'POST',
      data: requestBody
    });
    
    const photos = (response.data.mediaItems || [])
      .filter(item => item.mimeType && item.mimeType.startsWith('image/'))
      .map(item => ({
        id: item.id,
        baseUrl: item.baseUrl,
        filename: item.filename,
        mimeType: item.mimeType,
        width: item.mediaMetadata?.width,
        height: item.mediaMetadata?.height
      }));
    
    res.json({ 
      photos,
      nextPageToken: response.data.nextPageToken 
    });
  } catch (err) {
    console.error('Error fetching album photos:', err);
    if (err.message === 'Not authenticated with Google') {
      return res.status(401).json({ error: 'Not authenticated with Google' });
    }
    res.status(500).json({ error: 'Failed to fetch photos' });
  }
});

// =====================
// Slideshow Configuration
// =====================

// Get slideshow configuration
app.get('/api/slideshow', (req, res) => {
  db.get('SELECT * FROM slideshow_config WHERE id = 1', [], (err, config) => {
    if (err) {
      return res.status(500).json({ error: 'Failed to fetch slideshow config' });
    }
    
    res.json({
      enabled: config ? config.enabled === 1 : false,
      albumId: config?.album_id || null,
      albumTitle: config?.album_title || null,
      rotationInterval: config?.rotation_interval || 30,
      panoramicFrequency: config?.panoramic_frequency || 5,
      currentIndex: config?.current_index || 0,
      lastRotation: config?.last_rotation || null
    });
  });
});

// Update slideshow configuration
app.post('/api/slideshow', async (req, res) => {
  const { enabled, albumId, albumTitle, rotationInterval, panoramicFrequency } = req.body;
  
  // Validate inputs
  if (enabled && !albumId) {
    return res.status(400).json({ error: 'Album ID is required when enabling slideshow' });
  }
  
  const interval = Math.max(10, Math.min(3600, rotationInterval || 30)); // 10 seconds to 1 hour
  const frequency = Math.max(1, Math.min(20, panoramicFrequency || 5)); // Every 1-20 photos
  
  db.run(
    `UPDATE slideshow_config SET 
      enabled = ?, 
      album_id = ?, 
      album_title = ?,
      rotation_interval = ?, 
      panoramic_frequency = ?,
      current_index = 0,
      updated_at = CURRENT_TIMESTAMP
    WHERE id = 1`,
    [enabled ? 1 : 0, albumId || null, albumTitle || null, interval, frequency],
    (err) => {
      if (err) {
        console.error('Error updating slideshow config:', err);
        return res.status(500).json({ error: 'Failed to update slideshow config' });
      }
      
      res.json({ success: true });
      
      // Broadcast slideshow update to all connected clients
      broadcastToFrames({
        type: 'slideshow_updated',
        enabled: enabled,
        albumId: albumId
      });
      
      // If enabled, trigger an immediate rotation
      if (enabled) {
        triggerSlideshowRotation();
      }
    }
  );
});

// Store cached album photos for the slideshow
let cachedAlbumPhotos = [];
let cachedAlbumId = null;

// Function to fetch all photos from the selected album
async function fetchAlbumPhotos(albumId) {
  if (cachedAlbumId === albumId && cachedAlbumPhotos.length > 0) {
    return cachedAlbumPhotos;
  }
  
  try {
    const oauth2Client = await getAuthenticatedClient();
    let allPhotos = [];
    let pageToken = null;
    
    do {
      const requestBody = {
        albumId,
        pageSize: 100
      };
      
      if (pageToken) {
        requestBody.pageToken = pageToken;
      }
      
      const response = await oauth2Client.request({
        url: 'https://photoslibrary.googleapis.com/v1/mediaItems:search',
        method: 'POST',
        data: requestBody
      });
      
      const photos = (response.data.mediaItems || [])
        .filter(item => item.mimeType && item.mimeType.startsWith('image/'))
        .map(item => ({
          id: item.id,
          baseUrl: item.baseUrl,
          filename: item.filename,
          mimeType: item.mimeType,
          width: parseInt(item.mediaMetadata?.width) || 0,
          height: parseInt(item.mediaMetadata?.height) || 0
        }));
      
      allPhotos = allPhotos.concat(photos);
      pageToken = response.data.nextPageToken;
    } while (pageToken);
    
    // Shuffle the photos for variety
    allPhotos = shuffleArray(allPhotos);
    
    cachedAlbumPhotos = allPhotos;
    cachedAlbumId = albumId;
    
    return allPhotos;
  } catch (err) {
    console.error('Error fetching album photos for slideshow:', err);
    return [];
  }
}

// Helper function to shuffle array
function shuffleArray(array) {
  const shuffled = [...array];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

// Function to determine if a photo should be displayed as panoramic/overlay
function isPanoramicPhoto(photo) {
  // Consider a photo panoramic if its aspect ratio is > 2:1 (width is more than twice the height)
  if (photo.width && photo.height) {
    return photo.width / photo.height > 2;
  }
  return false;
}

// Function to trigger slideshow rotation
async function triggerSlideshowRotation() {
  return new Promise((resolve, reject) => {
    db.get('SELECT * FROM slideshow_config WHERE id = 1', [], async (err, config) => {
      if (err || !config || !config.enabled || !config.album_id) {
        return resolve();
      }
      
      try {
        const photos = await fetchAlbumPhotos(config.album_id);
        if (photos.length === 0) {
          console.log('No photos found in album');
          return resolve();
        }
        
        let currentIndex = config.current_index || 0;
        if (currentIndex >= photos.length) {
          currentIndex = 0;
          // Reshuffle when we've gone through all photos
          cachedAlbumPhotos = shuffleArray(cachedAlbumPhotos);
        }
        
        const photo = photos[currentIndex];
        
        // Determine if this should be panoramic/overlay mode
        // Either if the photo is naturally panoramic, or if it's time for a forced panoramic display
        const isPanoramic = isPanoramicPhoto(photo);
        const forcePanoramic = (currentIndex + 1) % config.panoramic_frequency === 0;
        const useOverlayMode = isPanoramic || forcePanoramic;
        
        // Update current index
        const nextIndex = currentIndex + 1;
        db.run(
          'UPDATE slideshow_config SET current_index = ?, last_rotation = CURRENT_TIMESTAMP WHERE id = 1',
          [nextIndex]
        );
        
        // Create a Google Photos URL with appropriate size parameters
        // Google Photos API allows appending =w{width}-h{height} for sizing
        const photoUrl = `${photo.baseUrl}=w1920-h1080`;
        
        // Update overlay configuration
        if (useOverlayMode) {
          db.run(
            'UPDATE overlay_config SET enabled = 1, photo_id = NULL WHERE id = 1'
          );
        } else {
          db.run(
            'UPDATE overlay_config SET enabled = 0, photo_id = NULL WHERE id = 1'
          );
        }
        
        // Broadcast the new photo to all frames
        broadcastToFrames({
          type: 'slideshow_photo',
          photo: {
            id: photo.id,
            url: photoUrl,
            filename: photo.filename,
            width: photo.width,
            height: photo.height,
            isExternal: true
          },
          mode: useOverlayMode ? 'overlay' : 'individual',
          isPanoramic: isPanoramic,
          forcedPanoramic: forcePanoramic && !isPanoramic
        });
        
        console.log(`Slideshow: Displaying photo ${currentIndex + 1}/${photos.length} (${useOverlayMode ? 'overlay' : 'individual'} mode)`);
        resolve();
      } catch (err) {
        console.error('Error in slideshow rotation:', err);
        resolve();
      }
    });
  });
}

// Slideshow rotation interval
let slideshowInterval = null;

function startSlideshowInterval() {
  if (slideshowInterval) {
    clearInterval(slideshowInterval);
  }
  
  db.get('SELECT * FROM slideshow_config WHERE id = 1', [], (err, config) => {
    if (err || !config || !config.enabled) {
      return;
    }
    
    const intervalMs = (config.rotation_interval || 30) * 1000;
    
    slideshowInterval = setInterval(() => {
      db.get('SELECT enabled FROM slideshow_config WHERE id = 1', [], (err, row) => {
        if (err || !row || !row.enabled) {
          if (slideshowInterval) {
            clearInterval(slideshowInterval);
            slideshowInterval = null;
          }
          return;
        }
        triggerSlideshowRotation();
      });
    }, intervalMs);
    
    console.log(`Slideshow interval started: ${config.rotation_interval} seconds`);
  });
}

// Get current slideshow photo (for frames to fetch on connect)
app.get('/api/slideshow/current', async (req, res) => {
  try {
    const config = await new Promise((resolve, reject) => {
      db.get('SELECT * FROM slideshow_config WHERE id = 1', [], (err, row) => {
        if (err) reject(err);
        else resolve(row);
      });
    });
    
    if (!config || !config.enabled || !config.album_id) {
      return res.json({ active: false });
    }
    
    const photos = await fetchAlbumPhotos(config.album_id);
    if (photos.length === 0) {
      return res.json({ active: false });
    }
    
    let currentIndex = config.current_index || 0;
    if (currentIndex >= photos.length) {
      currentIndex = 0;
    }
    
    const photo = photos[currentIndex];
    const isPanoramic = isPanoramicPhoto(photo);
    const forcePanoramic = (currentIndex + 1) % config.panoramic_frequency === 0;
    const useOverlayMode = isPanoramic || forcePanoramic;
    
    const photoUrl = `${photo.baseUrl}=w1920-h1080`;
    
    res.json({
      active: true,
      photo: {
        id: photo.id,
        url: photoUrl,
        filename: photo.filename,
        width: photo.width,
        height: photo.height,
        isExternal: true
      },
      mode: useOverlayMode ? 'overlay' : 'individual',
      isPanoramic: isPanoramic,
      forcedPanoramic: forcePanoramic && !isPanoramic,
      currentIndex: currentIndex,
      totalPhotos: photos.length
    });
  } catch (err) {
    console.error('Error getting current slideshow photo:', err);
    res.status(500).json({ error: 'Failed to get current photo' });
  }
});

// Manual trigger for next photo
app.post('/api/slideshow/next', async (req, res) => {
  try {
    await triggerSlideshowRotation();
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to advance slideshow' });
  }
});

// Clear photo cache (useful when album contents change)
app.post('/api/slideshow/refresh', (req, res) => {
  cachedAlbumPhotos = [];
  cachedAlbumId = null;
  res.json({ success: true });
});

// Start slideshow interval on server startup
setTimeout(() => {
  startSlideshowInterval();
}, 1000);

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
