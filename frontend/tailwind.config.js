/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx,ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // Colores de marca (HT-AP-03 §4 + Anexo "Sistema de acentos por app").
        'ht-navy': '#112548',   // Pantone 281 CVC — común a todas las apps HT
        'ht-accent': '#E8833A', // Naranja HT — acento propio del CRM (HT-AP-03)
      },
    },
  },
  plugins: [],
}
