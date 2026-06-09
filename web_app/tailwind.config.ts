import type { Config } from "tailwindcss";

export default {
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        ink: "#181816",
        cream: "#F5F2EB",
        paper: "#FCFBF8",
        gold: "#C59A45",
        sage: "#66715A",
      },
      boxShadow: {
        soft: "0 18px 50px rgba(37, 33, 25, 0.08)",
      },
    },
  },
  plugins: [],
} satisfies Config;
