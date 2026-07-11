/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx,ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // Colores de marca autorizados (HT-AP-03 §4 / manual de marca).
        'ht-navy': '#112548', // Pantone 281 CVC — botones primarios, headers, títulos
        'ht-cyan': '#34B3DE', // Pantone 306 C  — badges, acentos, highlights
      },
    },
  },
  plugins: [],
}
