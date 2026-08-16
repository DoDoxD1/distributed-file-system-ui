/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/**/*.{html,ts}'],
  theme: {
    extend: {
      boxShadow: {
        shell: '0 24px 80px rgba(2, 6, 23, 0.45)'
      }
    }
  },
  plugins: []
};
