# Setup Guide - Digital Photo Frame Orchestration System

This guide walks you through setting up the complete photo frame system from scratch.

## Prerequisites

### Required Software
- **Node.js** 16 or higher ([Download](https://nodejs.org/))
- **npm** (comes with Node.js)
- **Arduino IDE** 2.x or higher (for hardware frames) ([Download](https://www.arduino.cc/en/software))

### Optional Hardware (for physical frames)
- ESP32 development board
- TFT Display (ILI9341, ST7789, etc.)
- USB cable for programming
- 5V power supply

## Step 1: Clone the Repository

```bash
git clone https://github.com/daroco/photo-frame.git
cd photo-frame
```

## Step 2: Backend Setup

### Install Dependencies

```bash
cd backend
npm install
```

This will install:
- express (Web framework)
- sqlite3 (Database)
- ws (WebSocket server)
- multer (File uploads)
- cors (Cross-origin support)
- express-rate-limit (Security)
- body-parser (Request parsing)
- uuid (Unique IDs)

### Configure Environment (Optional)

Create a `.env` file in the `backend` directory:

```env
PORT=3001
```

### Start the Backend Server

```bash
npm start
```

You should see:
```
Photo Frame server running on port 3001
API: http://localhost:3001/api
WebSocket: ws://localhost:3001
Connected to SQLite database
```

The server will create:
- `frames.db` - SQLite database file
- `photos/` - Directory for uploaded photos

### Verify Backend

Open a new terminal and test the API:

```bash
curl http://localhost:3001/api/health
```

Expected response:
```json
{"status":"ok","timestamp":"2025-11-23T..."}
```

## Step 3: Frontend Setup

Open a new terminal window:

```bash
cd frontend
npm install
```

This will install:
- react & react-dom
- typescript
- axios (HTTP client)
- react-dropzone (File uploads)
- All build tools

### Start the Development Server

```bash
npm start
```

The browser should automatically open to `http://localhost:3000`

You should see:
- Header: "📷 Photo Frame Orchestrator"
- Three tabs: Layout Editor, Frames, Photos
- Empty canvas (no frames registered yet)

### Build for Production

To create an optimized production build:

```bash
npm run build
```

The build output will be in `frontend/build/` directory.

## Step 4: Test the System

### Register a Test Frame

With both backend and frontend running, you can register test frames:

**Option A: Using the API directly**

```bash
curl -X POST http://localhost:3001/api/frames/register \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Living Room Frame",
    "ip_address": "192.168.1.100",
    "width": 800,
    "height": 600
  }'
```

**Option B: The frame client will auto-register (see Step 5)**

### Verify in Web UI

1. Go to http://localhost:3000
2. Click "Frames" tab
3. You should see your registered frame(s)
4. Click "Layout Editor" to see frames on canvas

### Upload a Photo

1. Click "Photos" tab
2. Drag and drop an image or click to browse
3. Supported formats: PNG, JPG, JPEG, GIF, BMP, WebP

### Assign Photo to Frame (Individual Mode)

1. In "Photos" tab
2. Select a frame from the dropdown under a photo
3. Click "Assign"

### Test Overlay Mode

1. Go to "Photos" tab
2. Click "Set as Overlay" on any photo
3. Go to "Layout Editor" tab
4. Check "Enable Overlay Mode"
5. The photo will stretch across all frames

## Step 5: Hardware Frame Setup (Optional)

### Install Arduino IDE and Libraries

1. **Install ESP32 Board Support**
   - Open Arduino IDE
   - File → Preferences
   - Add to "Additional Board Manager URLs":
     ```
     https://raw.githubusercontent.com/espressif/arduino-esp32/gh-pages/package_esp32_index.json
     ```
   - Tools → Board → Boards Manager
   - Search "esp32" and install

2. **Install Required Libraries**
   - Tools → Manage Libraries
   - Install:
     - ArduinoJson (by Benoit Blanchon)
     - WebSockets (by Markus Sattler)
     - TFT_eSPI (by Bodmer) - if using TFT display

### Configure the Frame Client

1. Open `frame-client/frame-client.ino` in Arduino IDE

2. Update WiFi settings:
   ```cpp
   const char* WIFI_SSID = "YourWiFiName";
   const char* WIFI_PASSWORD = "YourWiFiPassword";
   ```

3. Update server settings:
   ```cpp
   const char* SERVER_HOST = "192.168.1.50";  // Your computer's IP
   ```

   To find your computer's IP:
   - **Windows**: `ipconfig` (look for IPv4 Address)
   - **Mac/Linux**: `ifconfig` or `ip addr` (look for inet)

4. Customize frame settings:
   ```cpp
   const char* FRAME_NAME = "Bedroom Frame";
   const int FRAME_WIDTH = 320;   // Your display width
   const int FRAME_HEIGHT = 240;  // Your display height
   ```

### Configure TFT_eSPI (if using TFT display)

1. Locate TFT_eSPI library folder
2. Edit `User_Setup.h` for your display type
3. See `frame-client/README.md` for detailed wiring

### Upload to ESP32

1. Connect ESP32 via USB
2. Select: Tools → Board → ESP32 Dev Module
3. Select: Tools → Port → (your COM port)
4. Click Upload button
5. Open Serial Monitor (115200 baud) to view logs

### Verify Frame Registration

In the Serial Monitor, you should see:
```
WiFi connected!
IP address: 192.168.1.150
Registering with server...
Frame ID: abc-123-def-456
WebSocket connected
```

The frame should now appear in the web UI!

## Step 6: Configure Multiple Frames

### Register Additional Frames

Repeat Step 5 for each physical frame with:
- Unique frame names
- Same SERVER_HOST
- Same WiFi credentials

### Position Frames in Layout

1. Go to "Layout Editor"
2. Drag each frame to match physical wall layout
3. Positions auto-save

Example layouts:

**2x2 Grid:**
```
Frame 1: (0, 0)      Frame 2: (810, 0)
Frame 3: (0, 610)    Frame 4: (810, 610)
```

**Horizontal Row:**
```
Frame 1: (0, 0)  Frame 2: (810, 0)  Frame 3: (1620, 0)
```

## Troubleshooting

### Backend Issues

**Port already in use:**
```bash
# Find and kill process on port 3001
lsof -ti:3001 | xargs kill -9  # Mac/Linux
netstat -ano | findstr :3001    # Windows (note PID and kill it)
```

**Database locked:**
```bash
# Stop server and delete database
rm backend/frames.db
npm start  # Will recreate database
```

### Frontend Issues

**Port 3000 already in use:**
```bash
# Use different port
PORT=3002 npm start
```

**Build errors:**
```bash
# Clear cache and reinstall
rm -rf node_modules package-lock.json
npm install
```

### Frame Client Issues

**WiFi won't connect:**
- Check SSID and password
- Ensure 2.4GHz network (ESP32 doesn't support 5GHz)
- Move closer to router

**Can't register with server:**
- Verify SERVER_HOST is correct (use IP, not localhost)
- Check firewall allows port 3001
- Ensure backend is running
- Verify same network

**Display shows nothing:**
- Check TFT_eSPI configuration
- Verify wiring connections
- Test with example sketches first

## Production Deployment

### Backend

**Using PM2 (recommended):**
```bash
npm install -g pm2
cd backend
pm2 start server.js --name photo-frame-api
pm2 save
pm2 startup  # Follow instructions
```

**Using systemd:**
Create `/etc/systemd/system/photo-frame.service`

### Frontend

**Build and serve:**
```bash
cd frontend
npm run build
npm install -g serve
serve -s build -l 80
```

**Or use Nginx:**
```nginx
server {
    listen 80;
    server_name your-domain.com;
    root /path/to/frontend/build;
    index index.html;
    
    location / {
        try_files $uri $uri/ /index.html;
    }
    
    location /api {
        proxy_pass http://localhost:3001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }
}
```

## Environment Variables

### Backend (.env)
```env
PORT=3001
NODE_ENV=production
```

### Frontend (.env.production)
```env
REACT_APP_API_URL=http://your-server-ip:3001/api
REACT_APP_WS_URL=ws://your-server-ip:3001
```

## Security Checklist for Production

- [ ] Change default ports
- [ ] Enable HTTPS (use Let's Encrypt)
- [ ] Configure proper CORS origins
- [ ] Set up authentication (not included in basic version)
- [ ] Regular backups of frames.db
- [ ] Configure firewall rules
- [ ] Use environment variables for secrets
- [ ] Monitor rate limiting logs
- [ ] Keep dependencies updated

## Next Steps

1. ✅ Backend running
2. ✅ Frontend accessible
3. ✅ Test frames registered
4. ✅ Photos uploaded
5. ✅ Layout configured
6. ⬜ Physical frames connected
7. ⬜ Production deployment

## Need Help?

- Check the main [README.md](README.md) for feature documentation
- See [frame-client/README.md](frame-client/README.md) for hardware details
- Review API endpoints for integration
- Check Serial Monitor for frame debug info

## Updates and Maintenance

**Update dependencies:**
```bash
# Backend
cd backend && npm update

# Frontend
cd frontend && npm update
```

**Backup data:**
```bash
# Backup database
cp backend/frames.db backend/frames.db.backup

# Backup photos
tar -czf photos-backup.tar.gz backend/photos/
```

**Monitor logs:**
```bash
# Backend logs (if using PM2)
pm2 logs photo-frame-api

# Frame logs
# Open Arduino Serial Monitor at 115200 baud
```

---

**Congratulations! Your photo frame orchestration system is ready! 🎉**
