# 📷 Digital Photo Frame Orchestration System

A complete solution for managing digital photo frames with a web UI, automatic frame registration, layout management, and both individual and overlay display modes.

## Features

- 🖼️ **Web-based Management UI** - Control all your photo frames from a modern web interface
- 🔄 **Auto-registration** - Frames automatically register themselves when powered on
- 📐 **Visual Layout Editor** - Drag and drop frames to match your physical wall layout
- 🎨 **Dual Display Modes**:
  - **Individual Mode**: Assign different photos to each frame
  - **Overlay Mode**: Stretch a single photo across multiple frames
- 📡 **Real-time Updates** - Changes sync instantly via WebSocket
- 🌐 **WiFi-enabled** - Works with ESP32 or similar WiFi-capable microcontrollers
- 📊 **Frame Status Monitoring** - Track online/offline status and last seen timestamps
- 📷 **Google Photos Integration** - Connect to Google Photos albums for automatic slideshow with panoramic display

## Architecture

```
┌─────────────────┐
│   Web UI        │ (React)
│   (Frontend)    │
└────────┬────────┘
         │
         │ HTTP/WebSocket
         │
┌────────▼────────┐
│   Backend       │ (Node.js/Express)
│   API Server    │
└────────┬────────┘
         │
         │ HTTP/WebSocket
         │
┌────────▼────────┐
│  Photo Frames   │ (ESP32/Arduino)
│  (Hardware)     │
└─────────────────┘
```

## Quick Start

### Prerequisites

- Node.js 16+ and npm
- ESP32 or compatible WiFi microcontroller (for hardware frames)
- TFT Display (ILI9341, ST7789, or similar)

### 1. Backend Setup

```bash
cd backend
npm install
npm start
```

The server will start on port 3001.

### 2. Frontend Setup

```bash
cd frontend
npm install
npm start
```

The web UI will open at http://localhost:3000

### 3. Hardware Frame Setup

1. Install required Arduino libraries:
   - ArduinoJson
   - WebSockets by Markus Sattler
   - TFT_eSPI (configured for your display)

2. Open `frame-client/frame-client.ino` in Arduino IDE

3. Configure WiFi and server settings:
   ```cpp
   const char* WIFI_SSID = "YOUR_WIFI_SSID";
   const char* WIFI_PASSWORD = "YOUR_WIFI_PASSWORD";
   const char* SERVER_HOST = "192.168.1.100";  // Your server IP
   ```

4. Upload to your ESP32

5. The frame will automatically register with the server

## Usage Guide

### Managing Frames

1. **View Registered Frames**: Navigate to the "Frames" tab to see all connected frames
2. **Layout Editor**: Use the "Layout Editor" tab to drag frames and position them as they are on your wall
3. **Frame Status**: Monitor online/offline status and connection health

### Managing Photos

1. **Upload Photos**: 
   - Go to the "Photos" tab
   - Drag and drop images or click to browse
   - Supports PNG, JPG, JPEG, GIF, BMP, WebP

2. **Individual Mode**:
   - Select a frame from the dropdown under each photo
   - Click "Assign" to set that photo on the selected frame

3. **Overlay Mode**:
   - Click "Set as Overlay" on any photo
   - Enable "Overlay Mode" in the Layout Editor
   - The photo will be stretched across all frames based on their positions

### Display Modes

#### Individual Mode
Each frame displays its own assigned photo independently. Perfect for creating a gallery wall with different images.

#### Overlay Mode
A single large image is stretched across all frames, with each frame displaying its portion based on physical position. Creates a panoramic multi-screen display.

## API Documentation

### Frame Endpoints

- `POST /api/frames/register` - Register a new frame
- `GET /api/frames` - List all frames
- `GET /api/frames/:id` - Get frame details
- `PUT /api/frames/:id` - Update frame position/settings
- `DELETE /api/frames/:id` - Remove frame

### Photo Endpoints

- `POST /api/photos/upload` - Upload a photo
- `GET /api/photos` - List all photos
- `DELETE /api/photos/:id` - Delete a photo
- `POST /api/frames/:frameId/photos` - Assign photo to frame
- `GET /api/frames/:frameId/photo` - Get photo for frame (handles both modes)

### Overlay Endpoints

- `GET /api/overlay` - Get overlay configuration
- `POST /api/overlay` - Set overlay mode and photo

### Google Photos Endpoints

- `GET /api/google/status` - Get Google authentication status
- `GET /api/google/auth-url` - Get Google OAuth URL to initiate authentication
- `GET /api/google/callback` - OAuth callback endpoint (redirects to frontend)
- `POST /api/google/disconnect` - Disconnect Google account
- `GET /api/google/albums` - List Google Photos albums

### Slideshow Endpoints

- `GET /api/slideshow` - Get slideshow configuration
- `POST /api/slideshow` - Update slideshow settings
- `GET /api/slideshow/current` - Get current slideshow photo
- `POST /api/slideshow/next` - Advance to next photo
- `POST /api/slideshow/refresh` - Clear photo cache

### WebSocket Events

Clients can connect to `ws://server:3001` and receive:
- `frame_added` - New frame registered
- `frame_removed` - Frame deleted
- `layout_updated` - Frame positions changed
- `photo_updated` - Photo assigned to frame
- `mode_changed` - Switched between individual/overlay
- `slideshow_updated` - Slideshow settings changed
- `slideshow_photo` - New photo from Google Photos slideshow

## Hardware Setup

### Recommended Components

- **ESP32-DevKit** or **NodeMCU-32S** ($5-10)
- **2.8" ILI9341 TFT Display** ($10-15)
- **SD Card Module** (optional, for caching) ($2-5)
- **Power Supply** (5V USB or dedicated) ($5)

### Wiring Example (ESP32 + ILI9341)

```
ESP32          ILI9341
------         -------
3.3V    ---->  VCC
GND     ---->  GND
GPIO 18 ---->  SCK
GPIO 23 ---->  MOSI
GPIO 5  ---->  CS
GPIO 4  ---->  DC
GPIO 2  ---->  RST
```

### Display Library Configuration

Edit your TFT_eSPI User_Setup.h:

```cpp
#define ILI9341_DRIVER
#define TFT_MISO 19
#define TFT_MOSI 23
#define TFT_SCLK 18
#define TFT_CS   5
#define TFT_DC   4
#define TFT_RST  2
```

## Configuration

### Environment Variables

Backend (.env):
```
PORT=3001
GOOGLE_CLIENT_ID=your-google-client-id
GOOGLE_CLIENT_SECRET=your-google-client-secret
GOOGLE_REDIRECT_URI=http://localhost:3001/api/google/callback
```

Frontend (.env):
```
REACT_APP_API_URL=http://localhost:3001/api
REACT_APP_WS_URL=ws://localhost:3001
```

### Google Photos Setup

To enable Google Photos integration:

1. Go to the [Google Cloud Console](https://console.developers.google.com/)
2. Create a new project or select an existing one
3. Enable the **Photos Library API**
4. Go to Credentials and create OAuth 2.0 credentials (Web application type)
5. Add the redirect URI: `http://localhost:3001/api/google/callback` (or your production URL)
6. Set the environment variables `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`
7. Restart the backend server
8. In the web UI, go to the "Google Photos" tab and connect your account

## Project Structure

```
photo-frame/
├── backend/              # Node.js API server
│   ├── server.js        # Main server file
│   ├── frames.db        # SQLite database
│   ├── photos/          # Uploaded photos
│   └── package.json
├── frontend/            # React web UI
│   ├── src/
│   │   ├── App.tsx
│   │   ├── App.css
│   │   └── components/
│   │       ├── FrameLayoutEditor.tsx
│   │       ├── FrameList.tsx
│   │       ├── PhotoGallery.tsx
│   │       └── GooglePhotos.tsx
│   └── package.json
└── frame-client/        # Arduino/ESP32 client
    └── frame-client.ino
```

## Development

### Backend Development
```bash
cd backend
npm run dev
```

### Frontend Development
```bash
cd frontend
npm start
```

### Building for Production

Frontend:
```bash
cd frontend
npm run build
```

Serve the built files with the backend or any static hosting service.

## Troubleshooting

### Frame Won't Register
- Check WiFi credentials
- Verify server IP address is correct
- Ensure firewall allows port 3001
- Check serial monitor for error messages

### Photos Not Displaying
- Verify photo URL is accessible from frame
- Check network connectivity
- Ensure image format is supported
- Monitor serial output for download errors

### WebSocket Connection Issues
- Confirm WebSocket port (3001) is open
- Check for proxy/firewall blocking WebSocket connections
- Verify server is running and accessible

## License

MIT

## Contributing

Contributions welcome! Please open an issue or PR.

## Future Enhancements

- [x] Photo rotation/slideshow mode (via Google Photos integration)
- [ ] Scheduling (different photos at different times)
- [ ] Weather/clock widgets
- [ ] Mobile app (React Native)
- [ ] Support for video/GIF animations
- [ ] Cloud sync and remote access
- [ ] Multiple user accounts
- [ ] Photo albums and collections