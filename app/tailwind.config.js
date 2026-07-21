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
        // ClipAI Custom Colors — vibrant, saturated palette
        // Tuned to match the rich, punchy accents in the creator-uploaded reference images.
        // Slightly deeper than pure neon so colors read as *saturated* rather than *neon-white*
        // when rendered on dark surfaces. HSL lightness ~45-55% gives maximum perceived vibrancy.
        'clip-dark': '#0A0A0A',
        'clip-surface': '#121212',
        'clip-border': '#2A2A2A',
        'clip-cyan': '#22F0FF',           // brighter neon teal-cyan — bumped L 45%→56%
        'clip-teal': '#5CEDE9',           // brighter teal — bumped saturation+lightness
        'clip-blue': '#62B8F0',           // brighter sky blue — bumped saturation+lightness
        'clip-violet': '#C266F5',         // brighter magenta-violet — bumped L 58%→68%
        'clip-purple': '#8262D6',          // brighter deep purple — bumped L 48%→61%
        'clip-amber': '#FF9500',           // bright orange (PRO badges, alerts)
        'clip-amber-rich': '#FFB347',     // brighter sunset amber — matches reference, bumped
        'clip-red': '#FF6B6B',             // brighter danger red — bumped L 63%→71%
        'clip-live': '#39FF14',            // neon green (LIVE indicators only)
        'clip-text': '#F0F0F0',            // brighter body text — near-white for high contrast
        'clip-muted': '#B0B0B0',           // brighter secondary text — was #888, now readable
        'clip-icon': '#808080',            // inactive icon default — was #404040, now visible
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
        // Brand glow — brighter neon teal-cyan halo (#22F0FF = 34,240,255). Max luminosity for pop.
        'glow-cyan': '0 0 24px rgba(34, 240, 255, 0.65), 0 4px 20px rgba(34, 240, 255, 0.35)',
        'glow-cyan-sm': '0 0 12px rgba(34, 240, 255, 0.55)',
        'glow-amber': '0 0 24px rgba(255, 149, 0, 0.6)',
        'glow-violet': '0 0 24px rgba(194, 102, 245, 0.6), 0 4px 20px rgba(194, 102, 245, 0.3)',
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
        // Brand pulse-glow — brighter neon teal-cyan pulse (#22F0FF = 34,240,255)
        "pulse-glow": {
          "0%, 100%": { boxShadow: "0 0 12px rgba(34, 240, 255, 0.65), 0 0 24px rgba(34, 240, 255, 0.35)" },
          "50%":      { boxShadow: "0 0 20px rgba(34, 240, 255, 0.85), 0 0 40px rgba(34, 240, 255, 0.45)" },
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
