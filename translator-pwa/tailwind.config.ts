import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: ["selector", '[data-theme="dark"]'],
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: [
          "M PLUS Rounded 1c",
          "Hiragino Maru Gothic ProN",
          "Inter",
          "-apple-system",
          "BlinkMacSystemFont",
          "Segoe UI",
          "Roboto",
          "sans-serif",
        ],
      },
      colors: {
        bg: "var(--bg)",
        "bg-elevated": "var(--bg-elevated)",
        surface: "var(--surface)",
        "surface-muted": "var(--surface-muted)",
        line: "var(--line)",
        fg: "var(--text)",
        "fg-muted": "var(--text-muted)",
        "fg-faint": "var(--text-faint)",
        es: {
          500: "var(--es-500)",
          600: "var(--es-600)",
          700: "var(--es-700)",
          surface: "var(--es-surface)",
        },
        ja: {
          500: "var(--ja-500)",
          600: "var(--ja-600)",
          700: "var(--ja-700)",
          surface: "var(--ja-surface)",
        },
        danger: "var(--danger)",
        "danger-surface": "var(--danger-surface)",
        success: "var(--success)",
        focus: "var(--focus-ring)",
      },
      borderRadius: {
        sm: "10px",
        md: "16px",
        lg: "22px",
      },
      boxShadow: {
        sm: "0 1px 2px rgba(36,28,21,.06)",
        md: "0 4px 12px rgba(36,28,21,.10)",
        lg: "0 12px 32px rgba(36,28,21,.16)",
        "es-glow": "0 8px 24px rgba(234,88,12,.35)",
        "ja-glow": "0 8px 24px rgba(166,54,45,.22)",
      },
      transitionDuration: {
        fast: "150ms",
        base: "200ms",
        slow: "250ms",
      },
      transitionTimingFunction: {
        out: "cubic-bezier(0.22, 1, 0.36, 1)",
      },
      backgroundImage: {
        "es-gradient": "var(--es-gradient)",
        "ja-gradient": "var(--ja-gradient)",
      },
      animation: {
        "pulse-ring": "pulse-ring 1.5s ease-out infinite",
        "spin-slow": "spin 3s linear infinite",
      },
      keyframes: {
        "pulse-ring": {
          "0%": { transform: "scale(1)", opacity: "1" },
          "100%": { transform: "scale(1.8)", opacity: "0" },
        },
      },
    },
  },
  plugins: [],
};
export default config;
