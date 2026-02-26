// components/MediaPreview.tsx
import React from "react";

interface MediaPreviewProps {
  mediaUrl: string;
  mediaType: string;
}

export const MediaPreview: React.FC<MediaPreviewProps> = ({
  mediaUrl,
  mediaType,
}) => {
  if (!mediaUrl) return null;

  if (mediaType === "video") {
    return (
      <div className="w-full h-full flex items-center justify-center">
        <video
          controls
          autoPlay
          className="max-w-full max-h-full object-contain shadow-2xl"
        >
          <source src={mediaUrl} type="video/mp4" />
          Your browser does not support the video tag.
        </video>
      </div>
    );
  }

  return (
    <div className="w-full h-full flex items-center justify-center">
      <img
        src={mediaUrl}
        alt="Generated content"
        className="max-w-full max-h-full object-contain shadow-2xl"
        loading="lazy"
      />
    </div>
  );
};
