import type { Config } from "tailwindcss"

const config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        paper: { DEFAULT: "#f4f4f0", 2: "#ecebe6", 3: "#e2e1db" },
        ink: { DEFAULT: "#111315", 2: "#3f4349", 3: "#62666d", 4: "#9a9ea4" },
        line: { DEFAULT: "#d9d8d2", 2: "#e7e6e1" },
        brick: "#b3452c",
        teal: { DEFAULT: "#0b5a4c", 2: "#2a8a76" },
      },
      fontFamily: {
        sans: ["var(--font-sans)", "system-ui", "sans-serif"],
        display: ["var(--font-display)", "Georgia", "serif"],
      },
    },
  },
} satisfies Config

export default config
