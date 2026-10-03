import type { Config } from "tailwindcss";

export default {
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        ink: "#2B2A28",
        charcoal: "#0D0D0D",
        cream: "#F5F2EA",
        paper: "#FCFBF8",
        gold: {
          DEFAULT: "#C59A44",
          bright: "#F5C45C",
          ink: "rgb(var(--brand-gold-ink) / <alpha-value>)",
        },
        sage: "#66715A",
        stone: {
          50: "#FCFBF8", 100: "#F0EDE5", 200: "#E2DDD2", 300: "#CFC8BC",
          400: "#958B7D", 500: "#746C60", 600: "#5D564C", 700: "#49433B",
          800: "#342F29", 900: "#24211C", 950: "#171510",
        },
      },
      boxShadow: {
        soft: "0 8px 32px rgba(43, 42, 40, 0.045)",
      },
    },
  },
  plugins: [],
} satisfies Config;
