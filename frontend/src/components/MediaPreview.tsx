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
      <div className="w-full max-w-md mx-auto">
        <video
          controls
          className="w-full rounded-lg shadow-lg"
          poster={mediaUrl.replace("/upload/", "/upload/w_400,h_400,c_fill/")}
        >
          <source src={mediaUrl} type="video/mp4" />
          Your browser does not support the video tag.
        </video>
      </div>
    );
  }

  return (
    <div className="w-full max-w-md mx-auto">
      <img
        src={mediaUrl}
        alt="Generated content"
        className="w-full rounded-lg shadow-lg"
        loading="lazy"
      />
    </div>
  );
};
