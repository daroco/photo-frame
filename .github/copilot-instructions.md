# Copilot Instructions for Photo Frame Orchestration System

## Project Overview

This is a Digital Photo Frame Orchestration System that manages multiple WiFi-enabled photo frames through a web interface. The system consists of three main components:

1. **Backend**: Node.js/Express API server with SQLite database
2. **Frontend**: React web UI with TypeScript
3. **Frame Client**: ESP32/Arduino firmware for physical photo frames

## Technology Stack

### Backend (`/backend`)
- **Runtime**: Node.js 18+ (LTS recommended)
- **Framework**: Express.js 5.x
- **Database**: SQLite3 with local file storage
- **Real-time**: WebSocket (ws library)
- **File Uploads**: Multer
- **Security**: express-rate-limit, cors

### Frontend (`/frontend`)
- **Framework**: React 19.x with TypeScript (Note: React 19 is recent; check library compatibility)
- **Build Tool**: Create React App (react-scripts)
- **HTTP Client**: Axios
- **File Uploads**: react-dropzone
- **Testing**: Jest with React Testing Library

### Frame Client (`/frame-client`)
- **Platform**: ESP32/Arduino
- **Display**: TFT_eSPI library for ILI9341/ST7789 displays
- **Communication**: HTTP and WebSocket
- **Data Format**: JSON (ArduinoJson library)

## Code Style Guidelines

### JavaScript/Node.js (Backend)
- Use ES6+ features (const/let, arrow functions, template literals)
- Use async/await for asynchronous operations
- Follow Express.js patterns for route handlers and middleware
- Use meaningful variable and function names
- Add error handling for database operations and API endpoints

### TypeScript/React (Frontend)
- Use TypeScript for type safety
- Use functional components with hooks
- Follow React best practices for state management
- Use meaningful component names that describe their purpose
- Keep components focused and single-purpose
- Use CSS classes consistent with existing App.css styles

### Arduino/C++ (Frame Client)
- Use descriptive constant names for configuration
- Follow Arduino conventions for setup() and loop() functions
- Include Serial debug output for troubleshooting
- Handle network errors gracefully

## Project Structure

```
photo-frame/
├── backend/              # Node.js API server
│   ├── server.js        # Main server file with all routes
│   └── package.json     # Backend dependencies
├── frontend/            # React web UI
│   ├── src/
│   │   ├── App.tsx      # Main application component
│   │   ├── App.css      # Application styles
│   │   └── components/  # React components
│   │       ├── FrameLayoutEditor.tsx  # Visual frame layout editor
│   │       ├── FrameList.tsx          # Frame management list
│   │       └── PhotoGallery.tsx       # Photo upload and management
│   └── package.json     # Frontend dependencies
└── frame-client/        # Arduino/ESP32 client
    └── frame-client.ino # Main Arduino sketch
```

## Development Setup

### Backend
```bash
cd backend
npm install
npm start        # Start production server on port 3001
npm run dev      # Start development server
```

### Frontend
```bash
cd frontend
npm install
npm start        # Start dev server on port 3000
npm run build    # Build for production
npm test         # Run tests
```

## Testing

### Frontend Testing
- Tests use Jest and React Testing Library
- Run tests with `npm test` in the frontend directory
- Test files should be co-located with components or in `__tests__` directories
- Follow existing test patterns when adding new tests

### Backend Testing
- Currently no automated tests (test infrastructure not set up)
- Manual testing via API endpoints

## API Patterns

### RESTful Endpoints
- `GET /api/resource` - List resources
- `GET /api/resource/:id` - Get single resource
- `POST /api/resource` - Create resource
- `PUT /api/resource/:id` - Update resource
- `DELETE /api/resource/:id` - Delete resource

### WebSocket Events
- Real-time updates use WebSocket on port 3001
- Events: `frame_added`, `frame_removed`, `layout_updated`, `photo_updated`, `mode_changed`

## Key Features to Understand

1. **Frame Registration**: Frames auto-register via POST to `/api/frames/register`
2. **Layout Editor**: Drag-and-drop positioning of frames to match physical layout
3. **Display Modes**:
   - Individual: Each frame displays its own photo
   - Overlay: Single photo stretched across multiple frames
4. **Photo Management**: Upload, assign to frames, delete

## Important Considerations

- The system runs on local network - frames connect via WiFi
- SQLite database is file-based at `backend/frames.db`
- Uploaded photos are stored in `backend/photos/` directory
- Frontend proxies API requests to backend (see `proxy` in package.json)
- Frame positions are persisted and used for overlay calculations

## Making Changes

1. For backend changes, restart the server to see updates
2. For frontend changes, hot reload handles most updates automatically
3. For Arduino changes, re-upload to the ESP32
4. Always test both individual and overlay modes when modifying display logic
5. Consider WebSocket broadcast for real-time UI updates
