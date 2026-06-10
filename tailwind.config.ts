import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./lib/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        ink: {
          50: "#f6f7f9",
          100: "#eceef2",
          200: "#d5dae2",
          300: "#b1bac8",
          400: "#8694a9",
          500: "#67778f",
          600: "#525f76",
          700: "#434d60",
          800: "#3a4251",
          900: "#343a45",
          950: "#23272f",
        },
      },
    },
  },
  plugins: [],
};

export default config;
