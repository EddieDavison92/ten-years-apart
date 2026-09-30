import type { Config } from "tailwindcss"

const config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        paper: { DEFAULT: "#f4f4f0", 2: "#ecebe6", 3: "#e2e1db" },
        ink: { DEFAULT: "#111315", 2: "#3f4349", 3: "#62666d", 4: "#9a9ea4" },
        line: { DEFAULT: "#d9d8d2", 2: "#e7e6e1" },
        brand: { DEFAULT: "#0b6e62", dark: "#08493f", soft: "#d8ebe5" },
        male: "#2f6db5",
        female: "#c27812",
        loss: "#a83a22",
        poor: "#cbc3b2",
        brick: "#b3452c",
        teal: { DEFAULT: "#0b5a4c", 2: "#2a8a76" },
      },
      fontFamily: {
        sans: ["var(--font-sans)", "system-ui", "sans-serif"],
        display: ["var(--font-display)", "Georgia", "serif"],
      },
      fontSize: {
        "2xs": ["0.6875rem", { lineHeight: "1rem" }],
      },
      keyframes: {
        rise: {
          from: { opacity: "0", transform: "translateY(8px)" },
          to: { opacity: "1", transform: "none" },
        },
        fade: {
          from: { opacity: "0" },
        },
      },
      animation: {
        rise: "rise 600ms cubic-bezier(0.2, 0.7, 0.2, 1) both",
        fade: "fade 500ms ease-out",
      },
    },
  },
} satisfies Config

export default config
