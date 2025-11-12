import axios from "axios";

const BUFFER_API_KEY = process.env.BUFFER_API_KEY;

interface BufferPost {
  text: string;
  media: {
    photo?: string;
    video?: string;
    thumbnail?: string;
  };
  profile_ids: string[];
  scheduled_at?: number;
}

export async function scheduleBufferPost(
  caption: string[],
  cta: string,
  mediaUrl: string,
  mediaType: "image" | "video" | "carousel",
  platform: string = "instagram"
): Promise<{ success: boolean; postId?: string; message: string }> {
  if (!BUFFER_API_KEY || BUFFER_API_KEY.startsWith("placeholder")) {
    console.warn(
      "Buffer API key not configured, post would be scheduled to:",
      platform
    );
    return {
      success: true,
      message: `Post ready for ${platform} (Buffer not configured)`,
    };
  }

  try {
    // Combine caption lines and CTA
    const fullText = [...caption, "", cta].join("\n");

    const postData: BufferPost = {
      text: fullText,
      media: {},
      profile_ids: [getProfileId(platform)],
    };

    // Set media based on type
    if (mediaType === "image" || mediaType === "carousel") {
      postData.media.photo = mediaUrl;
    } else if (mediaType === "video") {
      postData.media.video = mediaUrl;
      postData.media.thumbnail = mediaUrl + "?thumb=true"; // Simple thumbnail approach
    }

    const response = await axios.post(
      "https://api.bufferapp.com/1/updates/create.json",
      postData,
      {
        headers: {
          Authorization: `Bearer ${BUFFER_API_KEY}`,
          "Content-Type": "application/json",
        },
      }
    );

    return {
      success: true,
      postId: response.data.id,
      message: `Post scheduled successfully for ${platform}`,
    };
  } catch (error: any) {
    console.error("Buffer API Error:", error.response?.data || error.message);
    return {
      success: false,
      message: `Failed to schedule post: ${
        error.response?.data?.message || error.message
      }`,
    };
  }
}

function getProfileId(platform: string): string {
  // You'll need to set these up in your Buffer account
  const profileIds = {
    instagram:
      process.env.BUFFER_INSTAGRAM_PROFILE_ID || "instagram_profile_id",
    linkedin: process.env.BUFFER_LINKEDIN_PROFILE_ID || "linkedin_profile_id",
    facebook: process.env.BUFFER_FACEBOOK_PROFILE_ID || "facebook_profile_id",
    twitter: process.env.BUFFER_TWITTER_PROFILE_ID || "twitter_profile_id",
  };

  return (
    profileIds[platform as keyof typeof profileIds] || profileIds.instagram
  );
}
