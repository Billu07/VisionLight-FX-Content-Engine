import axios from "axios";

const BANNERBEAR_API_KEY = process.env.BANNERBEAR_API_KEY;

interface BannerbearResponse {
  uid: string;
  status: string;
  image_url?: string;
  error?: string;
}

export async function generateBannerbearCarousel(
  prompt: string,
  imageReference: string
): Promise<{ url: string; credit: string }> {
  if (!BANNERBEAR_API_KEY || BANNERBEAR_API_KEY.startsWith("placeholder")) {
    console.warn("Bannerbear API key not configured, using demo carousel");
    return getDemoCarousel(prompt);
  }

  try {
    // For now, use a placeholder until Bannerbear template is set up
    // You'll need to create a template in Bannerbear dashboard first
    const response = await axios.post(
      "https://sync.api.bannerbear.com/v2/images",
      {
        template: process.env.BANNERBEAR_TEMPLATE_ID || "your-template-id-here",
        modifications: [
          {
            name: "text",
            text: prompt,
          },
          {
            name: "background",
            color: "#3B82F6",
          },
        ],
      },
      {
        headers: {
          Authorization: `Bearer ${BANNERBEAR_API_KEY}`,
          "Content-Type": "application/json",
        },
      }
    );

    const carouselData: BannerbearResponse = response.data;

    if (carouselData.status === "completed" && carouselData.image_url) {
      return {
        url: carouselData.image_url,
        credit: "Created with Bannerbear",
      };
    } else {
      throw new Error(carouselData.error || "Carousel generation failed");
    }
  } catch (error: any) {
    console.error(
      "Bannerbear API Error:",
      error.response?.data || error.message
    );
    return getDemoCarousel(prompt);
  }
}

function getDemoCarousel(prompt: string): { url: string; credit: string } {
  return {
    url: "https://images.unsplash.com/photo-1552664730-d307ca884978?w=1200&h=600&fit=crop",
    credit: "Demo carousel template",
  };
}
