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
      },
    },
  },
  plugins: [],
};
