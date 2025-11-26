import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:3001/api';

interface Album {
  id: string;
  title: string;
  mediaItemsCount: number;
  coverPhotoBaseUrl?: string;
}

interface SlideshowConfig {
  enabled: boolean;
  albumId: string | null;
  albumTitle: string | null;
  rotationInterval: number;
  panoramicFrequency: number;
  currentIndex: number;
  lastRotation: string | null;
}

interface GoogleAuthStatus {
  configured: boolean;
  authenticated: boolean;
}

const GooglePhotos: React.FC = () => {
  const [authStatus, setAuthStatus] = useState<GoogleAuthStatus>({ configured: false, authenticated: false });
  const [albums, setAlbums] = useState<Album[]>([]);
  const [slideshowConfig, setSlideshowConfig] = useState<SlideshowConfig>({
    enabled: false,
    albumId: null,
    albumTitle: null,
    rotationInterval: 30,
    panoramicFrequency: 5,
    currentIndex: 0,
    lastRotation: null
  });
  const [loading, setLoading] = useState(true);
  const [albumsLoading, setAlbumsLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Form state for editing
  const [selectedAlbumId, setSelectedAlbumId] = useState<string>('');
  const [rotationInterval, setRotationInterval] = useState<number>(30);
  const [panoramicFrequency, setPanoramicFrequency] = useState<number>(5);

  // Auto-clear success messages after 3 seconds
  useEffect(() => {
    if (successMessage) {
      const timer = setTimeout(() => setSuccessMessage(null), 3000);
      return () => clearTimeout(timer);
    }
  }, [successMessage]);

  const loadAuthStatus = useCallback(async () => {
    try {
      const response = await axios.get(`${API_URL}/google/status`);
      setAuthStatus(response.data);
      return response.data;
    } catch (err) {
      console.error('Error loading Google auth status:', err);
      return { configured: false, authenticated: false };
    }
  }, []);

  const loadAlbums = useCallback(async () => {
    setAlbumsLoading(true);
    setError(null);
    try {
      const response = await axios.get(`${API_URL}/google/albums`);
      setAlbums(response.data.albums || []);
    } catch (err: unknown) {
      console.error('Error loading albums:', err);
      const axiosError = err as { response?: { status?: number } };
      if (axiosError.response?.status === 401) {
        setError('Google authentication expired. Please reconnect your account.');
        setAuthStatus(prev => ({ ...prev, authenticated: false }));
      } else {
        setError('Failed to load albums');
      }
    } finally {
      setAlbumsLoading(false);
    }
  }, []);

  const loadSlideshowConfig = useCallback(async () => {
    try {
      const response = await axios.get(`${API_URL}/slideshow`);
      const config = response.data;
      setSlideshowConfig(config);
      setSelectedAlbumId(config.albumId || '');
      setRotationInterval(config.rotationInterval || 30);
      setPanoramicFrequency(config.panoramicFrequency || 5);
    } catch (err) {
      console.error('Error loading slideshow config:', err);
    }
  }, []);

  useEffect(() => {
    const init = async () => {
      setLoading(true);
      const status = await loadAuthStatus();
      await loadSlideshowConfig();
      if (status.authenticated) {
        await loadAlbums();
      }
      setLoading(false);
    };
    init();

    // Check for OAuth callback result
    const params = new URLSearchParams(window.location.search);
    const googleAuth = params.get('google_auth');
    if (googleAuth === 'success') {
      // Clear URL params and reload
      window.history.replaceState({}, '', window.location.pathname);
      init();
    } else if (googleAuth === 'error') {
      const message = params.get('message') || 'Unknown error';
      setError(`Google authentication failed: ${message}`);
      window.history.replaceState({}, '', window.location.pathname);
    }
  }, [loadAuthStatus, loadAlbums, loadSlideshowConfig]);

  const handleConnect = async () => {
    try {
      const response = await axios.get(`${API_URL}/google/auth-url`);
      window.location.href = response.data.url;
    } catch (err) {
      console.error('Error getting auth URL:', err);
      setError('Failed to initiate Google authentication');
    }
  };

  const handleDisconnect = async () => {
    if (!window.confirm('Are you sure you want to disconnect your Google account? This will stop the slideshow if running.')) {
      return;
    }
    
    try {
      await axios.post(`${API_URL}/google/disconnect`);
      setAuthStatus({ configured: true, authenticated: false });
      setAlbums([]);
      setSlideshowConfig(prev => ({ ...prev, enabled: false, albumId: null, albumTitle: null }));
    } catch (err) {
      console.error('Error disconnecting:', err);
      setError('Failed to disconnect Google account');
    }
  };

  const handleSaveConfig = async () => {
    if (slideshowConfig.enabled && !selectedAlbumId) {
      setError('Please select an album to enable slideshow');
      return;
    }

    setSaving(true);
    setError(null);

    try {
      const selectedAlbum = albums.find(a => a.id === selectedAlbumId);
      await axios.post(`${API_URL}/slideshow`, {
        enabled: slideshowConfig.enabled,
        albumId: selectedAlbumId || null,
        albumTitle: selectedAlbum?.title || null,
        rotationInterval: rotationInterval,
        panoramicFrequency: panoramicFrequency
      });
      
      await loadSlideshowConfig();
      setSuccessMessage('Slideshow settings saved successfully!');
    } catch (err) {
      console.error('Error saving config:', err);
      setError('Failed to save slideshow settings');
    } finally {
      setSaving(false);
    }
  };

  const handleToggleSlideshow = async (enabled: boolean) => {
    if (enabled && !selectedAlbumId) {
      setError('Please select an album first');
      return;
    }

    setSlideshowConfig(prev => ({ ...prev, enabled }));
    
    setSaving(true);
    setError(null);

    try {
      const selectedAlbum = albums.find(a => a.id === selectedAlbumId);
      await axios.post(`${API_URL}/slideshow`, {
        enabled: enabled,
        albumId: selectedAlbumId || null,
        albumTitle: selectedAlbum?.title || null,
        rotationInterval: rotationInterval,
        panoramicFrequency: panoramicFrequency
      });
      
      await loadSlideshowConfig();
    } catch (err) {
      console.error('Error toggling slideshow:', err);
      setError('Failed to update slideshow');
      setSlideshowConfig(prev => ({ ...prev, enabled: !enabled }));
    } finally {
      setSaving(false);
    }
  };

  const handleNextPhoto = async () => {
    try {
      await axios.post(`${API_URL}/slideshow/next`);
    } catch (err) {
      console.error('Error advancing slideshow:', err);
      setError('Failed to advance to next photo');
    }
  };

  const handleRefreshCache = async () => {
    try {
      await axios.post(`${API_URL}/slideshow/refresh`);
      setSuccessMessage('Photo cache cleared. New photos will be loaded on next rotation.');
    } catch (err) {
      console.error('Error refreshing cache:', err);
      setError('Failed to refresh photo cache');
    }
  };

  if (loading) {
    return (
      <div className="google-photos">
        <h2>Google Photos Integration</h2>
        <div className="loading-state">
          <p>Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="google-photos">
      <h2>📷 Google Photos Integration</h2>
      
      {error && (
        <div className="error-message">
          {error}
          <button onClick={() => setError(null)}>×</button>
        </div>
      )}

      {successMessage && (
        <div className="success-message">
          {successMessage}
          <button onClick={() => setSuccessMessage(null)}>×</button>
        </div>
      )}

      {!authStatus.configured ? (
        <div className="setup-section">
          <h3>Setup Required</h3>
          <p>
            To use Google Photos integration, you need to configure OAuth credentials on the server.
          </p>
          <ol>
            <li>Go to the <a href="https://console.developers.google.com/" target="_blank" rel="noopener noreferrer">Google Cloud Console</a></li>
            <li>Create a new project or select an existing one</li>
            <li>Enable the Photos Library API</li>
            <li>Create OAuth 2.0 credentials</li>
            <li>Set the following environment variables on the server:
              <ul>
                <li><code>GOOGLE_CLIENT_ID</code></li>
                <li><code>GOOGLE_CLIENT_SECRET</code></li>
                <li><code>GOOGLE_REDIRECT_URI</code> (optional, defaults to http://localhost:3001/api/google/callback)</li>
              </ul>
            </li>
            <li>Restart the server</li>
          </ol>
        </div>
      ) : !authStatus.authenticated ? (
        <div className="auth-section">
          <h3>Connect Your Google Account</h3>
          <p>
            Connect your Google account to access your Google Photos albums and enable automatic slideshow rotation.
          </p>
          <button className="connect-button" onClick={handleConnect}>
            Connect Google Photos
          </button>
        </div>
      ) : (
        <>
          <div className="connected-section">
            <div className="status-bar">
              <span className="status-indicator connected">✓ Connected to Google Photos</span>
              <button className="disconnect-button" onClick={handleDisconnect}>
                Disconnect
              </button>
            </div>
          </div>

          <div className="slideshow-section">
            <h3>Slideshow Settings</h3>
            
            <div className="form-group">
              <label className="toggle-label">
                <input
                  type="checkbox"
                  checked={slideshowConfig.enabled}
                  onChange={(e) => handleToggleSlideshow(e.target.checked)}
                  disabled={saving}
                />
                Enable Slideshow
              </label>
              <p className="help-text">
                When enabled, photos from the selected album will automatically rotate on your frames.
              </p>
            </div>

            <div className="form-group">
              <label htmlFor="album-select">Select Album</label>
              {albumsLoading ? (
                <p>Loading albums...</p>
              ) : (
                <select
                  id="album-select"
                  value={selectedAlbumId}
                  onChange={(e) => setSelectedAlbumId(e.target.value)}
                  disabled={saving}
                >
                  <option value="">-- Select an album --</option>
                  {albums.map((album) => (
                    <option key={album.id} value={album.id}>
                      {album.title} ({album.mediaItemsCount} photos)
                    </option>
                  ))}
                </select>
              )}
              <button 
                className="refresh-albums-button"
                onClick={loadAlbums}
                disabled={albumsLoading}
              >
                🔄 Refresh Albums
              </button>
            </div>

            <div className="form-group">
              <label htmlFor="rotation-interval">
                Rotation Interval (seconds)
              </label>
              <input
                type="number"
                id="rotation-interval"
                value={rotationInterval}
                onChange={(e) => setRotationInterval(Math.max(10, Math.min(3600, parseInt(e.target.value) || 30)))}
                min={10}
                max={3600}
                disabled={saving}
              />
              <p className="help-text">
                How often photos should change (10 seconds to 1 hour)
              </p>
            </div>

            <div className="form-group">
              <label htmlFor="panoramic-frequency">
                Panoramic/Stretched Display Frequency
              </label>
              <input
                type="number"
                id="panoramic-frequency"
                value={panoramicFrequency}
                onChange={(e) => setPanoramicFrequency(Math.max(1, Math.min(20, parseInt(e.target.value) || 5)))}
                min={1}
                max={20}
                disabled={saving}
              />
              <p className="help-text">
                Every N photos, display in stretched/overlay mode across all frames (1-20). 
                Panoramic photos are always stretched automatically.
              </p>
            </div>

            <div className="button-group">
              <button 
                className="save-button"
                onClick={handleSaveConfig}
                disabled={saving}
              >
                {saving ? 'Saving...' : 'Save Settings'}
              </button>
            </div>
          </div>

          {slideshowConfig.enabled && (
            <div className="playback-section">
              <h3>Playback Controls</h3>
              <div className="playback-info">
                {slideshowConfig.albumTitle && (
                  <p><strong>Album:</strong> {slideshowConfig.albumTitle}</p>
                )}
                <p><strong>Interval:</strong> {slideshowConfig.rotationInterval} seconds</p>
                <p><strong>Panoramic every:</strong> {slideshowConfig.panoramicFrequency} photos</p>
                {slideshowConfig.lastRotation && (
                  <p><strong>Last rotation:</strong> {new Date(slideshowConfig.lastRotation).toLocaleString()}</p>
                )}
              </div>
              <div className="button-group">
                <button className="next-button" onClick={handleNextPhoto}>
                  ⏭️ Next Photo
                </button>
                <button className="refresh-button" onClick={handleRefreshCache}>
                  🔄 Refresh Cache
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
};

export default GooglePhotos;
