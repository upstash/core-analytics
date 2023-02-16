const defaultTheme = require("tailwindcss/defaultTheme");
/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./app/**/*.tsx"],
  theme: {
    extend: {
      fontFamily: {
        sans: ["var(--font-inter)", ...defaultTheme.fontFamily.sans],
      },
    },
  },
  plugins: [],
};
