/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        gray: {
          750: "#2d3748",
          850: "#1a202c",
          900: "#111827",
          950: "#0B0F19", // Deep studio background
        },
        brand: {
          primary: "var(--primary-brand)",
          secondary: "var(--secondary-brand)",
          accent: "#22d3ee", // Cyan-400
        },
      },
      backgroundImage: {
        "studio-gradient": "linear-gradient(to bottom right, #111827, #0B0F19)",
        "glass-panel":
          "linear-gradient(180deg, rgba(255, 255, 255, 0.05) 0%, rgba(255, 255, 255, 0.02) 100%)",
        "active-tab":
          "linear-gradient(180deg, rgba(255, 255, 255, 0.1) 0%, rgba(255, 255, 255, 0.05) 100%)",
      },
      boxShadow: {
        glow: "0 0 20px rgba(34, 211, 238, 0.15)",
        "glow-sm": "0 0 10px rgba(34, 211, 238, 0.1)",
      },
      animation: {
        "pulse-slow": "pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite",
      },
    },
  },
  plugins: [],
};
