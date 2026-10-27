module.exports = Object.assign({content:["./public/index.html","./public/*.js"]}, {
  theme: {
    extend: {
      colors: {
        background: 'var(--background)', foreground: 'var(--foreground)',
        card: 'var(--card)', 'card-foreground': 'var(--card-foreground)',
        primary: 'var(--primary)', 'primary-foreground': 'var(--primary-foreground)',
        secondary: 'var(--secondary)', 'secondary-foreground': 'var(--secondary-foreground)',
        muted: 'var(--muted)', 'muted-foreground': 'var(--muted-foreground)',
        accent: 'var(--accent)', 'accent-foreground': 'var(--accent-foreground)',
        destructive: 'var(--destructive)', 'destructive-foreground': 'var(--destructive-foreground)',
        border: 'var(--border)', input: 'var(--input)', ring: 'var(--ring)',
        gain: 'var(--gain)', 'gain-foreground': 'var(--gain-foreground)', 'gain-subtle': 'var(--gain-subtle)',
        loss: 'var(--loss)', 'loss-foreground': 'var(--loss-foreground)', 'loss-subtle': 'var(--loss-subtle)',
        'broker-manual': 'var(--broker-manual)', 'broker-binance': 'var(--broker-binance)',
        'broker-blofin': 'var(--broker-blofin)', 'broker-bitunix': 'var(--broker-bitunix)',
        'broker-hyperliquid': 'var(--broker-hyperliquid)',
      },
      borderRadius: {
        sm: 'calc(var(--radius) - 4px)', md: 'calc(var(--radius) - 2px)', lg: 'var(--radius)',
        xl: 'calc(var(--radius) + 4px)', '2xl': 'calc(var(--radius) + 8px)', '3xl': 'calc(var(--radius) + 12px)',
      },
      boxShadow: {
        soft: '0 1px 2px oklch(0.3 0.02 80 / 4%), 0 8px 24px -8px oklch(0.3 0.02 80 / 8%)',
        lift: '0 2px 4px oklch(0.3 0.02 80 / 5%), 0 16px 40px -12px oklch(0.3 0.02 80 / 14%)',
      },
      fontFamily: { display: ['Sora','ui-sans-serif','system-ui','sans-serif'], sans: ['Manrope','ui-sans-serif','system-ui','sans-serif'] },
    }
  }
});
