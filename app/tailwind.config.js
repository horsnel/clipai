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
        'clip-cyan': '#07D2DF',           // vivid teal-cyan — matches reference image (was #00E5FF)
        'clip-teal': '#3FC7C3',           // bright teal — secondary cyan, for duo-tone gradients
        'clip-blue': '#479AC8',           // bright sky blue — tertiary cool accent
        'clip-violet': '#AD52D4',         // vivid magenta-violet — gradient end-stop, matches reference
        'clip-purple': '#6648AC',          // deep saturated purple — alt gradient stop
        'clip-amber': '#FF9500',           // bright orange (PRO badges, alerts)
        'clip-amber-rich': '#CE8A31',     // richer sunset amber — matches reference image
        'clip-red': '#FF4444',             // bright danger red (Logout, errors)
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
        // Brand glow — vivid teal-cyan halo (#07D2DF = 7,210,223). Stronger luminosity for pop.
        'glow-cyan': '0 0 24px rgba(7, 210, 223, 0.6), 0 4px 20px rgba(7, 210, 223, 0.3)',
        'glow-cyan-sm': '0 0 12px rgba(7, 210, 223, 0.5)',
        'glow-amber': '0 0 24px rgba(255, 149, 0, 0.55)',
        'glow-violet': '0 0 24px rgba(173, 82, 212, 0.55), 0 4px 20px rgba(173, 82, 212, 0.25)',
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
        // Brand pulse-glow — vivid teal-cyan pulse on key CTAs (#07D2DF = 7,210,223)
        "pulse-glow": {
          "0%, 100%": { boxShadow: "0 0 12px rgba(7, 210, 223, 0.6), 0 0 24px rgba(7, 210, 223, 0.3)" },
          "50%":      { boxShadow: "0 0 20px rgba(7, 210, 223, 0.8), 0 0 40px rgba(7, 210, 223, 0.4)" },
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
