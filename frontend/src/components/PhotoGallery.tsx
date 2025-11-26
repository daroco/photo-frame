import React, { useState, useCallback } from 'react';
import { useDropzone } from 'react-dropzone';
import { Frame, Photo } from '../App';

interface Props {
  photos: Photo[];
  frames: Frame[];
  overlayMode: boolean;
  overlayPhoto: Photo | null;
  onUploadPhoto: (file: File) => void;
  onDeletePhoto: (photoId: string) => void;
  onAssignPhoto: (frameId: string, photoId: string) => void;
  onSetOverlayPhoto: (photoId: string) => void;
}

const PhotoGallery: React.FC<Props> = ({
  photos,
  frames,
  overlayMode,
  overlayPhoto,
  onUploadPhoto,
  onDeletePhoto,
  onAssignPhoto,
  onSetOverlayPhoto,
}) => {
  const [selectedFrameForPhoto, setSelectedFrameForPhoto] = useState<{ [photoId: string]: string }>({});

  const onDrop = useCallback((acceptedFiles: File[]) => {
    acceptedFiles.forEach((file) => {
      if (file.type.startsWith('image/')) {
        onUploadPhoto(file);
      } else {
        alert('Please upload only image files');
      }
    });
  }, [onUploadPhoto]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'image/*': ['.png', '.jpg', '.jpeg', '.gif', '.bmp', '.webp']
    },
    multiple: true,
  });

  const handleAssignClick = (photoId: string) => {
    const frameId = selectedFrameForPhoto[photoId];
    if (frameId) {
      onAssignPhoto(frameId, photoId);
    } else {
      alert('Please select a frame first');
    }
  };

  return (
    <div className="photo-gallery">
      <h2>Photo Library</h2>

      <div {...getRootProps()} className={`upload-zone ${isDragActive ? 'active' : ''}`}>
        <input {...getInputProps()} />
        {isDragActive ? (
          <p>📁 Drop the images here...</p>
        ) : (
          <>
            <p>🖼️ Drag & drop images here, or click to select</p>
            <p style={{ fontSize: '0.9em', color: '#999' }}>
              Supports: PNG, JPG, JPEG, GIF, BMP, WebP
            </p>
          </>
        )}
      </div>

      {photos.length === 0 ? (
        <div className="empty-state">
          <h3>No photos uploaded yet</h3>
          <p>Upload some photos to get started</p>
        </div>
      ) : (
        <div className="photo-grid">
          {photos.map((photo) => {
            const apiUrl = process.env.REACT_APP_API_URL || 'http://localhost:3001/api';
            const baseUrl = apiUrl.replace('/api', '');
            const photoUrl = `${baseUrl}${photo.url}`;
            
            return (
              <div key={photo.id} className="photo-card">
                <img src={photoUrl} alt={photo.original_name} />
                <div className="photo-card-info">
                  <h3 title={photo.original_name}>{photo.original_name}</h3>
                  
                  {!overlayMode && frames.length > 0 && (
                    <div className="photo-card-actions">
                      <select
                        value={selectedFrameForPhoto[photo.id] || ''}
                        onChange={(e) =>
                          setSelectedFrameForPhoto({
                            ...selectedFrameForPhoto,
                            [photo.id]: e.target.value,
                          })
                        }
                      >
                        <option value="">Select Frame</option>
                        {frames.map((frame) => (
                          <option key={frame.id} value={frame.id}>
                            {frame.name}
                          </option>
                        ))}
                      </select>
                      <button
                        className="assign"
                        onClick={() => handleAssignClick(photo.id)}
                      >
                        Assign
                      </button>
                    </div>
                  )}
                  
                  <div className="photo-card-actions" style={{ marginTop: '8px' }}>
                    <button
                      className="overlay"
                      onClick={() => onSetOverlayPhoto(photo.id)}
                    >
                      Set as Overlay
                    </button>
                    <button
                      className="delete"
                      onClick={() => onDeletePhoto(photo.id)}
                    >
                      Delete
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default PhotoGallery;
