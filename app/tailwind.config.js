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
        // ClipAI Custom Colors — deep darkened palette (glow restored on darkened hues)
        'clip-dark': '#050507',
        'clip-surface': '#0B0B0F',
        'clip-border': '#131318',
        'clip-cyan': '#22D3EE',
        'clip-amber': '#F59E0B',
        'clip-red': '#FF3B3B',
        'clip-text': '#A8AEB8',
        'clip-muted': '#565B6A',
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
        // Brand glow — restored. Built on the darkened cyan so the halo
        // reads as a soft teal bloom rather than a neon spike.
        'glow-cyan': '0 0 24px rgba(34, 211, 238, 0.45)',
        'glow-cyan-sm': '0 0 12px rgba(34, 211, 238, 0.35)',
        'glow-amber': '0 0 24px rgba(245, 158, 11, 0.45)',
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
        // Brand pulse-glow — restored. Slow soft pulsing glow used on the
        // LandingPage AI POWERED badge and other key CTAs.
        "pulse-glow": {
          "0%, 100%": { boxShadow: "0 0 12px rgba(34, 211, 238, 0.4), 0 0 24px rgba(34, 211, 238, 0.2)" },
          "50%":      { boxShadow: "0 0 18px rgba(34, 211, 238, 0.6), 0 0 36px rgba(34, 211, 238, 0.3)" },
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
