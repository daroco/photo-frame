import React, { useState, useEffect } from 'react';
import axios from 'axios';
import './App.css';
import FrameLayoutEditor from './components/FrameLayoutEditor';
import PhotoGallery from './components/PhotoGallery';
import FrameList from './components/FrameList';

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:3001/api';
const WS_URL = process.env.REACT_APP_WS_URL || 'ws://localhost:3001';

export interface Frame {
  id: string;
  name: string;
  ip_address: string;
  width: number;
  height: number;
  position_x: number;
  position_y: number;
  status: string;
  last_seen: string;
}

export interface Photo {
  id: string;
  filename: string;
  original_name: string;
  url: string;
  uploaded_at?: string;
}

function App() {
  const [frames, setFrames] = useState<Frame[]>([]);
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [selectedFrame, setSelectedFrame] = useState<Frame | null>(null);
  const [overlayMode, setOverlayMode] = useState(false);
  const [overlayPhoto, setOverlayPhoto] = useState<Photo | null>(null);
  const [activeTab, setActiveTab] = useState<'layout' | 'frames' | 'photos'>('layout');
  const [, setWs] = useState<WebSocket | null>(null);

  // Load data on mount
  useEffect(() => {
    loadFrames();
    loadPhotos();
    loadOverlayConfig();
    
    const websocket = new WebSocket(WS_URL);
    
    websocket.onopen = () => {
      console.log('WebSocket connected');
    };
    
    websocket.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        console.log('WebSocket message:', data);
        
        if (data.type === 'frame_added' || data.type === 'frame_removed' || data.type === 'layout_updated') {
          loadFrames();
        }
      } catch (error) {
        console.error('Error processing WebSocket message:', error);
      }
    };
    
    websocket.onerror = (error) => {
      console.error('WebSocket error:', error);
    };
    
    websocket.onclose = () => {
      console.log('WebSocket disconnected');
    };
    
    setWs(websocket);

    return () => {
      websocket.close();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loadFrames = async () => {
    try {
      const response = await axios.get(`${API_URL}/frames`);
      setFrames(response.data);
    } catch (error) {
      console.error('Error loading frames:', error);
    }
  };

  const loadPhotos = async () => {
    try {
      const response = await axios.get(`${API_URL}/photos`);
      setPhotos(response.data);
    } catch (error) {
      console.error('Error loading photos:', error);
    }
  };

  const loadOverlayConfig = async () => {
    try {
      const response = await axios.get(`${API_URL}/overlay`);
      setOverlayMode(response.data.enabled);
      setOverlayPhoto(response.data.photo);
    } catch (error) {
      console.error('Error loading overlay config:', error);
    }
  };

  const handleUpdateFrame = async (frameId: string, updates: Partial<Frame>) => {
    try {
      await axios.put(`${API_URL}/frames/${frameId}`, updates);
      loadFrames();
    } catch (error) {
      console.error('Error updating frame:', error);
    }
  };

  const handleDeleteFrame = async (frameId: string) => {
    if (window.confirm('Are you sure you want to delete this frame?')) {
      try {
        await axios.delete(`${API_URL}/frames/${frameId}`);
        loadFrames();
        if (selectedFrame?.id === frameId) {
          setSelectedFrame(null);
        }
      } catch (error) {
        console.error('Error deleting frame:', error);
      }
    }
  };

  const handleUploadPhoto = async (file: File) => {
    const formData = new FormData();
    formData.append('photo', file);

    try {
      await axios.post(`${API_URL}/photos/upload`, formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      });
      loadPhotos();
    } catch (error) {
      console.error('Error uploading photo:', error);
      alert('Failed to upload photo');
    }
  };

  const handleDeletePhoto = async (photoId: string) => {
    if (window.confirm('Are you sure you want to delete this photo?')) {
      try {
        await axios.delete(`${API_URL}/photos/${photoId}`);
        loadPhotos();
        if (overlayPhoto?.id === photoId) {
          setOverlayPhoto(null);
        }
      } catch (error) {
        console.error('Error deleting photo:', error);
      }
    }
  };

  const handleAssignPhoto = async (frameId: string, photoId: string) => {
    try {
      await axios.post(`${API_URL}/frames/${frameId}/photos`, { photoId });
      alert('Photo assigned to frame successfully');
    } catch (error) {
      console.error('Error assigning photo:', error);
      alert('Failed to assign photo');
    }
  };

  const handleToggleOverlayMode = async (enabled: boolean, photoId?: string) => {
    try {
      await axios.post(`${API_URL}/overlay`, {
        enabled,
        photoId: photoId || overlayPhoto?.id,
      });
      setOverlayMode(enabled);
      if (enabled && photoId) {
        const photo = photos.find(p => p.id === photoId);
        if (photo) {
          setOverlayPhoto(photo);
        }
      }
    } catch (error) {
      console.error('Error toggling overlay mode:', error);
      alert('Failed to update overlay mode');
    }
  };

  return (
    <div className="App">
      <header className="App-header">
        <h1>📷 Photo Frame Orchestrator</h1>
        <div className="mode-indicator">
          Mode: <strong>{overlayMode ? 'Overlay' : 'Individual'}</strong>
        </div>
      </header>

      <div className="tabs">
        <button
          className={activeTab === 'layout' ? 'active' : ''}
          onClick={() => setActiveTab('layout')}
        >
          Layout Editor
        </button>
        <button
          className={activeTab === 'frames' ? 'active' : ''}
          onClick={() => setActiveTab('frames')}
        >
          Frames ({frames.length})
        </button>
        <button
          className={activeTab === 'photos' ? 'active' : ''}
          onClick={() => setActiveTab('photos')}
        >
          Photos ({photos.length})
        </button>
      </div>

      <div className="content">
        {activeTab === 'layout' && (
          <FrameLayoutEditor
            frames={frames}
            photos={photos}
            overlayMode={overlayMode}
            overlayPhoto={overlayPhoto}
            onUpdateFrame={handleUpdateFrame}
            onSelectFrame={setSelectedFrame}
            selectedFrame={selectedFrame}
            onToggleOverlayMode={handleToggleOverlayMode}
          />
        )}

        {activeTab === 'frames' && (
          <FrameList
            frames={frames}
            onDeleteFrame={handleDeleteFrame}
            onSelectFrame={setSelectedFrame}
          />
        )}

        {activeTab === 'photos' && (
          <PhotoGallery
            photos={photos}
            frames={frames}
            overlayMode={overlayMode}
            overlayPhoto={overlayPhoto}
            onUploadPhoto={handleUploadPhoto}
            onDeletePhoto={handleDeletePhoto}
            onAssignPhoto={handleAssignPhoto}
            onSetOverlayPhoto={(photoId) => handleToggleOverlayMode(true, photoId)}
          />
        )}
      </div>
    </div>
  );
}

export default App;
