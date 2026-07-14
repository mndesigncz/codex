/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        // iOS 26 glassmorphism design tokens
        deep: '#0A0A0C',
        lime: {
          DEFAULT: '#C8F542',
          soft: 'rgba(200,245,66,0.15)',
        },
        accent: {
          blue: '#0A84FF',
        },
        glass: {
          DEFAULT: 'rgba(255,255,255,0.06)',
          strong: 'rgba(255,255,255,0.10)',
          border: 'rgba(255,255,255,0.10)',
          'border-strong': 'rgba(255,255,255,0.16)',
        },
        // Legacy palette kept for backwards compat during transition
        tea: {
          50:  '#f7f5f0',
          100: '#ede8dc',
          200: '#d9cfba',
          300: '#c2b090',
          400: '#a98f68',
          500: '#8f7350',
          600: '#6f5840',
          700: '#534030',
          800: '#3a2c22',
          900: '#261c16',
        },
        matcha: {
          50:  '#f3f7f0',
          100: '#e0ecda',
          200: '#bad5b0',
          300: '#8dba80',
          400: '#619c54',
          500: '#437d37',
          600: '#31612a',
          700: '#254921',
          800: '#1a331a',
          900: '#112211',
        },
        cream: '#faf8f3',
      },
      borderRadius: {
        '3xl': '1.5rem',
      },
    },
  },
  plugins: [],
}
