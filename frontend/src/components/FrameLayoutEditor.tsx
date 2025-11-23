import React, { useState } from 'react';
import { Frame, Photo } from '../App';

interface Props {
  frames: Frame[];
  photos: Photo[];
  overlayMode: boolean;
  overlayPhoto: Photo | null;
  onUpdateFrame: (frameId: string, updates: Partial<Frame>) => void;
  onSelectFrame: (frame: Frame | null) => void;
  selectedFrame: Frame | null;
  onToggleOverlayMode: (enabled: boolean, photoId?: string) => void;
}

const FrameLayoutEditor: React.FC<Props> = ({
  frames,
  photos,
  overlayMode,
  overlayPhoto,
  onUpdateFrame,
  onSelectFrame,
  selectedFrame,
  onToggleOverlayMode,
}) => {
  const [draggedFrame, setDraggedFrame] = useState<Frame | null>(null);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });

  const handleMouseDown = (e: React.MouseEvent, frame: Frame) => {
    e.preventDefault();
    setDraggedFrame(frame);
    onSelectFrame(frame);

    const rect = e.currentTarget.getBoundingClientRect();
    setDragOffset({
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
    });
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!draggedFrame) return;

    const canvas = e.currentTarget;
    const rect = canvas.getBoundingClientRect();
    
    const newX = Math.max(0, Math.min(
      e.clientX - rect.left - dragOffset.x,
      rect.width - draggedFrame.width
    ));
    
    const newY = Math.max(0, Math.min(
      e.clientY - rect.top - dragOffset.y,
      rect.height - draggedFrame.height
    ));

    onUpdateFrame(draggedFrame.id, {
      position_x: Math.round(newX),
      position_y: Math.round(newY),
    });
  };

  const handleMouseUp = () => {
    setDraggedFrame(null);
  };

  return (
    <div className="layout-editor">
      <h2>Frame Layout Editor</h2>
      
      <div className="layout-controls">
        <div className="overlay-controls">
          <label>
            <input
              type="checkbox"
              checked={overlayMode}
              onChange={(e) => onToggleOverlayMode(e.target.checked)}
            />
            Enable Overlay Mode
          </label>
          
          {overlayMode && (
            <>
              <span>Overlay Photo:</span>
              <select
                value={overlayPhoto?.id || ''}
                onChange={(e) => onToggleOverlayMode(true, e.target.value)}
              >
                <option value="">Select a photo</option>
                {photos.map((photo) => (
                  <option key={photo.id} value={photo.id}>
                    {photo.original_name}
                  </option>
                ))}
              </select>
            </>
          )}
        </div>
        
        {overlayMode && overlayPhoto && (
          <p style={{ marginTop: '10px', color: '#666' }}>
            The selected photo will be stretched across all frames based on their layout positions.
          </p>
        )}
      </div>

      <div
        className="layout-canvas"
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
      >
        {frames.length === 0 ? (
          <div className="empty-state">
            <h3>No frames registered yet</h3>
            <p>Frames will appear here automatically when they connect to the server</p>
          </div>
        ) : (
          frames.map((frame) => (
            <div
              key={frame.id}
              className={`frame-box ${selectedFrame?.id === frame.id ? 'selected' : ''}`}
              style={{
                left: `${frame.position_x}px`,
                top: `${frame.position_y}px`,
                width: `${frame.width}px`,
                height: `${frame.height}px`,
              }}
              onMouseDown={(e) => handleMouseDown(e, frame)}
            >
              <div className="frame-name">{frame.name}</div>
              <div className={`frame-status ${frame.status}`}>
                {frame.status}
              </div>
              <div className="frame-dimensions">
                {frame.width} × {frame.height}
              </div>
              <div className="frame-dimensions">
                Position: ({frame.position_x}, {frame.position_y})
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
};

export default FrameLayoutEditor;
