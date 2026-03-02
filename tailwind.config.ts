// tailwind.config.ts
import type { Config } from "tailwindcss";

const config: Config = {
    darkMode: "class",
    content: [
        "./app/**/*.{js,ts,jsx,tsx}",
        "./components/**/*.{js,ts,jsx,tsx}",
    ],
    theme: {
        extend: {
            colors: {
                primary: "#13ec13",
                "primary-dark": "#0ea80e",
                "background-light": "#f6f8f6",
                "background-dark": "#102210",
                "surface-light": "#ffffff",
                "surface-dark": "#1a331a",
                "text-main": "#111811",
                "text-sub": "#618961",
            },
            fontFamily: {
                display: ['"Manrope"', '"Noto Sans JP"', "sans-serif"],
                body: ['"Manrope"', '"Noto Sans JP"', "sans-serif"],
            },
            borderRadius: {
                DEFAULT: "0.25rem",
                lg: "0.5rem",
                xl: "0.75rem",
                full: "9999px",
            },
        },
    },
};

export default config;
