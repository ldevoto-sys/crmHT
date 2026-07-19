/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx,ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // Colores de marca (manual gráfico HidroTecnica: Pantone 281 CVC / 306 C).
        'ht-navy': '#112548',   // Azul marino — énfasis alto: títulos, texto, logo.
        'ht-accent': '#34B3DE', // Celeste — color de interacción principal (antes naranja).
      },
    },
  },
  plugins: [],
}
