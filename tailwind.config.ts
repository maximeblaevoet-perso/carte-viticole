import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        wine: {
          50: "#fbf3f4",
          100: "#f6e3e6",
          200: "#eec6cd",
          300: "#e09da9",
          400: "#cd6a7d",
          500: "#b54559",
          600: "#9d2f44",
          700: "#7c2335",
          800: "#5f1d2b",
          900: "#4a1b26",
        },
        leaf: {
          400: "#5aa469",
          500: "#3f8a52",
          600: "#2f6b40",
        },
      },
      fontFamily: {
        sans: ["var(--font-inter)", "system-ui", "sans-serif"],
      },
    },
  },
  plugins: [],
};

export default config;
