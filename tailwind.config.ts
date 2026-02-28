import type { Config } from 'tailwindcss'

const config: Config = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        terracotta: {
          50: '#fdf5f0',
          100: '#fbe8db',
          200: '#f6cdb6',
          300: '#f0ab87',
          400: '#e88456',
          500: '#e2632e',
          600: '#c44d20',
          700: '#a33b1c',
          800: '#85321d',
          900: '#6d2b1b',
        },
        olive: {
          50: '#f7f8f0',
          100: '#edf0db',
          200: '#dae1b8',
          300: '#c0cc8b',
          400: '#a5b563',
          500: '#889b45',
          600: '#6a7b34',
          700: '#515f2b',
          800: '#424c26',
          900: '#394124',
        },
        cream: {
          50: '#fefdfb',
          100: '#fdf9f2',
          200: '#faf2e4',
          300: '#f5e6cc',
          400: '#eed4ab',
          500: '#e5be87',
          600: '#d4a066',
          700: '#b47f4a',
          800: '#94673f',
          900: '#7a5536',
        },
        walnut: {
          50: '#f9f6f4',
          100: '#f1ece6',
          200: '#e1d5ca',
          300: '#cdb8a6',
          400: '#b69580',
          500: '#a47b65',
          600: '#976a57',
          700: '#7e5649',
          800: '#674840',
          900: '#553d36',
        },
      },
      fontFamily: {
        display: ['"Playfair Display"', 'Georgia', 'serif'],
        body: ['"Source Sans 3"', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
}
export default config
