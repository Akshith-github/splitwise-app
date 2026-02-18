/** @type {import('tailwindcss').Config} */
export default {
    content: [
        "./index.html",
        "./src/**/*.{js,ts,jsx,tsx}",
    ],
    theme: {
        extend: {
            colors: {
                primary: {
                    DEFAULT: '#00BFA5',
                    dark: '#00897B',
                }
            },
            borderRadius: {
                '3xl': '24px',
                '2xl': '16px',
            }
        },
    },
    plugins: [],
}
