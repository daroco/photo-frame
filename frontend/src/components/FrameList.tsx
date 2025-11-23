import React from 'react';
import { Frame } from '../App';

interface Props {
  frames: Frame[];
  onDeleteFrame: (frameId: string) => void;
  onSelectFrame: (frame: Frame) => void;
}

const FrameList: React.FC<Props> = ({ frames, onDeleteFrame, onSelectFrame }) => {
  return (
    <div className="frame-list">
      <h2>Registered Frames</h2>
      
      {frames.length === 0 ? (
        <div className="empty-state">
          <h3>No frames registered</h3>
          <p>Frames will automatically register when they connect to the server</p>
        </div>
      ) : (
        frames.map((frame) => (
          <div key={frame.id} className="frame-item">
            <div className="frame-info">
              <h3>{frame.name}</h3>
              <p><strong>ID:</strong> {frame.id}</p>
              <p><strong>IP Address:</strong> {frame.ip_address || 'Unknown'}</p>
              <p><strong>Dimensions:</strong> {frame.width} × {frame.height}</p>
              <p><strong>Position:</strong> ({frame.position_x}, {frame.position_y})</p>
              <p>
                <strong>Status:</strong>{' '}
                <span className={`frame-status ${frame.status}`}>
                  {frame.status}
                </span>
              </p>
              <p><strong>Last Seen:</strong> {new Date(frame.last_seen).toLocaleString()}</p>
            </div>
            <div className="frame-actions">
              <button className="delete" onClick={() => onDeleteFrame(frame.id)}>
                Delete
              </button>
            </div>
          </div>
        ))
      )}
    </div>
  );
};

export default FrameList;
