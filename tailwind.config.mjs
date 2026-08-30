/** @type {import('tailwindcss').Config} */
export default {
  content: ['./src/**/*.{astro,html,js,jsx,md,mdx,svelte,ts,tsx,vue}'],
  theme: {
    extend: {
      fontFamily: {
        bubbly: ['"Titan One"', 'cursive'],
      },
      colors: {
        ff: {
          bg: {
            primary: 'var(--ff-bg-primary)',
            secondary: 'var(--ff-bg-secondary)',
            tertiary: 'var(--ff-bg-tertiary)',
          },
          text: {
            primary: 'var(--ff-text-primary)',
            secondary: 'var(--ff-text-secondary)',
            muted: 'var(--ff-text-muted)',
          },
          resin: {
            cream: 'var(--ff-resin-cream)',
            gold: 'var(--ff-resin-gold)',
            amber: 'var(--ff-resin-amber)',
          },
          grape: {
            deep: 'var(--ff-grape-deep)',
            vivid: 'var(--ff-grape-vivid)',
            neon: 'var(--ff-grape-neon)',
          },
          peach: {
            soft: 'var(--ff-peach-soft)',
            bright: 'var(--ff-peach-bright)',
          },
          lime: {
            soft: 'var(--ff-lime-soft)',
            bright: 'var(--ff-lime-bright)',
          },
          neon: {
            pink: 'var(--ff-pink-neon)',
            cyan: 'var(--ff-cyan-neon)',
            blue: 'var(--ff-rainbow-blue)',
          },
          status: {
            current: 'var(--ff-status-current)',
            archived: 'var(--ff-status-archived)',
            upcoming: 'var(--ff-status-upcoming)',
          },
          border: {
            subtle: 'var(--ff-border-subtle)',
          }
        }
      },
      borderRadius: {
        'ff-sm': 'var(--ff-radius-sm)',
        'ff-md': 'var(--ff-radius-md)',
        'ff-lg': 'var(--ff-radius-lg)',
        'ff-xl': 'var(--ff-radius-xl)',
      },
      typography: {
        DEFAULT: {
          css: {
            // Dark theme prose styles using Fruitfull brand colors
            '--tw-prose-body': '#c9c6bd',           // ff-text-secondary for body
            '--tw-prose-headings': '#f5f3ee',       // ff-text-primary for headings
            '--tw-prose-lead': '#c9c6bd',           // ff-text-secondary for lead
            '--tw-prose-links': '#7a5cff',          // ff-grape-vivid for links
            '--tw-prose-bold': '#f5f3ee',           // ff-text-primary for bold
            '--tw-prose-counters': '#9a98a0',       // ff-text-muted for counters
            '--tw-prose-bullets': '#9a98a0',        // ff-text-muted for bullets
            '--tw-prose-hr': '#2c2c3a',             // ff-border-subtle for rules
            '--tw-prose-quotes': '#c9c6bd',         // ff-text-secondary for quotes
            '--tw-prose-quote-borders': '#d6b85a',  // ff-resin-gold for quote borders
            '--tw-prose-captions': '#9a98a0',       // ff-text-muted for captions
            '--tw-prose-code': '#7dff3f',           // ff-lime-bright for inline code
            '--tw-prose-pre-code': '#c9c6bd',       // ff-text-secondary for code blocks
            '--tw-prose-pre-bg': '#161621',         // ff-bg-secondary for code backgrounds
            '--tw-prose-th-borders': '#2c2c3a',     // ff-border-subtle for table borders
            '--tw-prose-td-borders': '#2c2c3a',     // ff-border-subtle for table borders

            // Base typography for mobile (default)
            maxWidth: '65ch',
            fontSize: '1rem',
            lineHeight: '1.75',

            // Custom styling for genetics content
            'h1, h2, h3': {
              color: '#f5f3ee',
              fontWeight: '700',
            },
            'h4, h5, h6': {
              color: '#d6b85a', // ff-resin-gold for subheadings
              fontWeight: '600',
            },
            'strong': {
              color: '#7a5cff', // ff-grape-vivid for emphasis
              fontWeight: '600',
            },
            'em': {
              color: '#ff8c5a', // ff-peach-bright for italics
              fontStyle: 'italic',
            }
          }
        },
        lg: {
          css: {
            // Larger typography for desktop
            fontSize: '1.125rem',
            lineHeight: '1.75',
            'h1': {
              fontSize: '2.5rem',
              lineHeight: '1.2',
            },
            'h2': {
              fontSize: '2rem',
              lineHeight: '1.3',
            },
            'h3': {
              fontSize: '1.5rem',
              lineHeight: '1.4',
            },
            'h4': {
              fontSize: '1.25rem',
              lineHeight: '1.5',
            },
          }
        }
      }
    },
  },
  plugins: [
    require('@tailwindcss/typography'),
  ],
}