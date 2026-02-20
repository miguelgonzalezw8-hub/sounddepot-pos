/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: "class", // ✅ REQUIRED
  content: [
    "./index.html",
    "./src/**/*.{js,jsx,ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        brand: {
          blue: "hsl(var(--brand-blue) / <alpha-value>)",
          green: "hsl(var(--brand-green) / <alpha-value>)",
          primary: "hsl(var(--brand-primary) / <alpha-value>)",
          accent: "hsl(var(--brand-accent) / <alpha-value>)",
        },
        app: {
          bg: "hsl(var(--app-bg) / <alpha-value>)",
          panel: "hsl(var(--panel-bg) / <alpha-value>)",
          text: "hsl(var(--text) / <alpha-value>)",
          muted: "hsl(var(--muted) / <alpha-value>)",
          border: "hsl(var(--border) / <alpha-value>)",
        },
        sidebar: {
          bg: "hsl(var(--sidebar-bg) / <alpha-value>)",
          bg2: "hsl(var(--sidebar-bg-2) / <alpha-value>)",
          text: "hsl(var(--sidebar-text) / <alpha-value>)",
          muted: "hsl(var(--sidebar-muted) / <alpha-value>)",
        },
      },
    },
  },
  plugins: [require("@tailwindcss/forms")],
};
