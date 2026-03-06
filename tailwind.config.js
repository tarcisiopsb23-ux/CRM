/** @type {import('tailwindcss').Config} */
export default {
  darkMode: ['class'],
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        primary: '#6A2DBD',
        'gray-dark': '#1E2A38',
        'gray-light': '#F6F7FB',
      },
    },
  },
  plugins: [],
};
