/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        ink: '#0B0E14',
        panel: '#11151D',
        line: '#1E2530',
        signal: '#5EE6A8',
        ember: '#FF6B4A',
        mist: '#8893A6',
        bone: '#E9EDF3',
      },
      fontFamily: {
        display: ['"Spline Sans Mono"', 'monospace'],
        body: ['"Inter"', 'sans-serif'],
      },
    },
  },
  plugins: [],
};
