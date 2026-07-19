/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: ["class"],
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive) / <alpha-value>)",
          foreground: "hsl(var(--destructive-foreground) / <alpha-value>)",
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
        },
        popover: {
          DEFAULT: "hsl(var(--popover))",
          foreground: "hsl(var(--popover-foreground))",
        },
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },
        sidebar: {
          DEFAULT: "hsl(var(--sidebar-background))",
          foreground: "hsl(var(--sidebar-foreground))",
          primary: "hsl(var(--sidebar-primary))",
          "primary-foreground": "hsl(var(--sidebar-primary-foreground))",
          accent: "hsl(var(--sidebar-accent))",
          "accent-foreground": "hsl(var(--sidebar-accent-foreground))",
          border: "hsl(var(--sidebar-border))",
          ring: "hsl(var(--sidebar-ring))",
        },
        // ClipAI Custom Colors — electric-bright palette
        // Backgrounds lifted slightly off pure black, borders crisper so cards read as distinct surfaces.
        'clip-dark': '#0A0A0A',
        'clip-surface': '#121212',
        'clip-border': '#2A2A2A',
        'clip-cyan': '#00E5FF',           // electric cyan (primary accent)
        'clip-amber': '#FF9500',           // bright orange (PRO badges, alerts)
        'clip-red': '#FF3B3B',
        'clip-live': '#39FF14',            // neon green (LIVE indicators only)
        'clip-text': '#E0E0E0',            // brighter body text
        'clip-muted': '#888888',           // brighter secondary text
      },
      borderRadius: {
        xl: "calc(var(--radius) + 4px)",
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
        xs: "calc(var(--radius) - 6px)",
        '2xl': '18px',
        '3xl': '22px',
      },
      boxShadow: {
        xs: "0 1px 2px 0 rgb(0 0 0 / 0.05)",
        'card': '0 18px 50px rgba(0, 0, 0, 0.45)',
        // Brand glow — electric cyan halo, brighter & more luminous
        'glow-cyan': '0 0 24px rgba(0, 229, 255, 0.5), 0 4px 20px rgba(0, 229, 255, 0.25)',
        'glow-cyan-sm': '0 0 12px rgba(0, 229, 255, 0.4)',
        'glow-amber': '0 0 24px rgba(255, 149, 0, 0.5)',
        'glow-live': '0 0 12px rgba(57, 255, 20, 0.5)',
      },
      fontFamily: {
        'display': ['Sora', 'sans-serif'],
        'body': ['Inter', 'sans-serif'],
        'mono': ['IBM Plex Mono', 'monospace'],
      },
      keyframes: {
        "accordion-down": {
          from: { height: "0" },
          to: { height: "var(--radix-accordion-content-height)" },
        },
        "accordion-up": {
          from: { height: "var(--radix-accordion-content-height)" },
          to: { height: "0" },
        },
        "caret-blink": {
          "0%,70%,100%": { opacity: "1" },
          "20%,50%": { opacity: "0" },
        },
        "float": {
          "0%, 100%": { transform: "translateY(0)" },
          "50%": { transform: "translateY(-10px)" },
        },
        "scan": {
          "0%": { transform: "translateY(-100%)" },
          "100%": { transform: "translateY(100%)" },
        },
        "progress": {
          "0%": { width: "0%" },
          "100%": { width: "100%" },
        },
        // Brand pulse-glow — bright electric cyan pulse on key CTAs
        "pulse-glow": {
          "0%, 100%": { boxShadow: "0 0 12px rgba(0, 229, 255, 0.5), 0 0 24px rgba(0, 229, 255, 0.25)" },
          "50%":      { boxShadow: "0 0 20px rgba(0, 229, 255, 0.7), 0 0 40px rgba(0, 229, 255, 0.35)" },
        },
      },
      animation: {
        "accordion-down": "accordion-down 0.2s ease-out",
        "accordion-up": "accordion-up 0.2s ease-out",
        "caret-blink": "caret-blink 1.25s ease-out infinite",
        "float": "float 3s ease-in-out infinite",
        "scan": "scan 2s linear infinite",
        "progress": "progress 2s ease-out forwards",
        "pulse-glow": "pulse-glow 2.5s ease-in-out infinite",
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
}
