import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/data/**/*.{js,ts}",
  ],
  safelist: [
    "bg-v-green",
    "bg-v-blue",
    "bg-orange-400",
    "bg-amber-400",
    "bg-pink-400",
    "bg-purple-400"
  ],
  theme: {
    extend: {
      colors: {
        "v-green": "#85CC17",
        "v-green-dark": "#6aaa10",
        "v-blue": "#3B74ED",
        "v-blue-dark": "#2B62D9",
        "v-bg": "#F7F7F2",
        "v-ink": "#0D0D0D",
        "v-muted": "#6B7280",
        "v-border": "#E5E5DF",
        "v-card": "#FFFFFF",
        "v-dark": "#111110",
      },
      fontFamily: {
        display: ["var(--font-space-grotesk)", "sans-serif"],
        body: ["var(--font-dm-sans)", "sans-serif"],
      },
      keyframes: {
        marquee: {
          "0%": { transform: "translateX(0)" },
          "100%": { transform: "translateX(-50%)" },
        },
      },
      animation: {
        marquee: "marquee 35s linear infinite",
      },
    },
  },
  plugins: [],
};

export default config;
