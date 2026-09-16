/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: ['selector', '[data-theme="dark"]'],
  // Hover jen tam, kde je opravdu kurzor. Na dotyku by klepnutí nechalo
  // tlačítko „viset" ve stavu hover — 700+ hover: tříd se tím zkrotí najednou.
  future: { hoverOnlyWhenSupported: true },
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['var(--font-geist-sans)', '-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'sans-serif'],
        mono: ['var(--font-geist-mono)', 'ui-monospace', 'SFMono-Regular', 'Menlo', 'monospace'],
      },
      transitionTimingFunction: {
        out: 'cubic-bezier(0.23, 1, 0.32, 1)',
        'in-out': 'cubic-bezier(0.77, 0, 0.175, 1)',
        drawer: 'cubic-bezier(0.32, 0.72, 0, 1)',
      },
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
      // Tři rádiusy pro celou aplikaci (Managero 2): karta 20, pole 14,
      // drobná dlaždice 10. Cokoli většího/menšího v kódu se sem přemapuje.
      borderRadius: {
        xl: 'var(--r-sm)',
        '2xl': 'var(--r-md)',
        '3xl': 'var(--r-lg)',
      },
    },
  },
  plugins: [],
}
