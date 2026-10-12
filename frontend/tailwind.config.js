/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        // ========================================
        // UpcharGanga Premium Healthcare Brand
        // ========================================

        // Primary Brand Color: Healthcare Emerald
        // Used for primary actions, brand identity, trust signals
        upchar: {
          50: '#F0FAF7',
          100: '#D4F0EA',
          200: '#A8E1D5',
          300: '#7CD1C0',
          400: '#51C2AB',
          500: '#259B8A', // Primary
          600: '#1F7D6F',
          700: '#185F54',
          800: '#124139',
          900: '#0C231E',
        },

        // Secondary: Deep Teal (Professional Trust)
        teal: {
          50: '#F0FDFC',
          100: '#CCFAF5',
          500: '#0891B2',
          600: '#0E7490',
        },

        // Tertiary: Professional Blue (Authority)
        blue: {
          50: '#EFF6FF',
          500: '#0B5BA3',
          600: '#0A4A85',
        },

        // Accent: Gold/Yellow (Positivity, Healthcare Cross)
        gold: {
          50: '#FEF9E7',
          100: '#FEF3CE',
          500: '#D4A123',
          600: '#B8881A',
        },

        // Semantic Status Colors
        success: {
          50: '#ECFDF5',
          500: '#10B981',
          600: '#059669',
        },
        warning: {
          50: '#FFFBEB',
          500: '#F59E0B',
          600: '#D97706',
        },
        danger: {
          50: '#FEF2F2',
          500: '#EF4444',
          600: '#DC2626',
        },
        info: {
          50: '#EFF6FF',
          500: '#3B82F6',
          600: '#2563EB',
        },

        // Neutral System (Professional Grays)
        neutral: {
          0: '#FFFFFF',
          50: '#F9FAFB',
          100: '#F3F4F6',
          200: '#E5E7EB',
          300: '#D1D5DB',
          400: '#9CA3AF',
          500: '#6B7280',
          600: '#4B5563',
          700: '#374151',
          800: '#1F2937',
          900: '#111827',
        },

        // Legacy HealQ palette — kept for patient pages only
        // All operational panels now use upchar-*
        healq: {
          50: '#EFF6FF',
          100: '#DBEAFE',
          200: '#BFDBFE',
          500: '#2563EB',
          600: '#1D4ED8',
          700: '#1E40AF',
          900: '#1E3A8A',
        },
      },

      fontFamily: {
        // Display/Heading Font: Sora (modern geometric sans-serif)
        // Fallback to system fonts if Sora is not loaded
        display: [
          'Sora',
          'Segoe UI',
          '-apple-system',
          'BlinkMacSystemFont',
          'Helvetica Neue',
          'sans-serif',
        ],
        // Body Font: Inter (professional, highly legible)
        sans: [
          'Inter',
          'Segoe UI',
          '-apple-system',
          'BlinkMacSystemFont',
          'Helvetica Neue',
          'sans-serif',
        ],
        // Serif: Lora (patient pages + auth screens — reads as trustworthy)
        serif: ['Lora', 'ui-serif', 'Georgia', 'serif'],
      },

      fontSize: {
        // Display: 48–56px, used for hero text
        'display-lg': ['56px', { lineHeight: '1.2', letterSpacing: '-0.02em', fontWeight: '700' }],
        'display': ['48px', { lineHeight: '1.2', letterSpacing: '-0.02em', fontWeight: '700' }],

        // H1: 32–36px, page titles
        'h1': ['36px', { lineHeight: '1.2', letterSpacing: '-0.01em', fontWeight: '700' }],

        // H2: 24–28px, section headings
        'h2': ['28px', { lineHeight: '1.3', letterSpacing: '0', fontWeight: '600' }],

        // H3: 20px, subsections
        'h3': ['20px', { lineHeight: '1.4', letterSpacing: '0', fontWeight: '600' }],

        // Body Large: 16px
        'body-lg': ['16px', { lineHeight: '1.6', letterSpacing: '0', fontWeight: '400' }],

        // Body: 14px (default)
        'body': ['14px', { lineHeight: '1.6', letterSpacing: '0', fontWeight: '400' }],

        // Body Small: 13px
        'body-sm': ['13px', { lineHeight: '1.5', letterSpacing: '0.01em', fontWeight: '400' }],

        // Label: 12px, form labels, tabs
        'label': ['12px', { lineHeight: '1.4', letterSpacing: '0.05em', fontWeight: '500' }],

        // Caption: 12px, helpers, metadata
        'caption': ['12px', { lineHeight: '1.4', letterSpacing: '0.02em', fontWeight: '400' }],

        // Button: 14px
        'button': ['14px', { lineHeight: '1.5', letterSpacing: '0', fontWeight: '600' }],
      },

      spacing: {
        // 4px grid system
        xs: '4px',
        sm: '8px',
        md: '12px',
        lg: '16px',
        xl: '24px',
        '2xl': '32px',
        '3xl': '48px',
        '4xl': '64px',
      },

      borderRadius: {
        // Premium border radius scale
        none: '0px',
        xs: '4px',
        sm: '6px',
        DEFAULT: '8px',
        md: '8px',
        lg: '12px',
        xl: '16px',
        full: '9999px',
      },

      boxShadow: {
        // Professional shadow system
        none: 'none',
        sm: '0 1px 2px rgba(0, 0, 0, 0.05)',
        base: '0 2px 4px rgba(0, 0, 0, 0.08)',
        md: '0 4px 12px rgba(0, 0, 0, 0.10)',
        lg: '0 12px 24px rgba(0, 0, 0, 0.12)',
        xl: '0 20px 40px rgba(0, 0, 0, 0.15)',

        // Focus ring shadow (upchar-500 with 10% opacity)
        'focus-ring': '0 0 0 3px rgba(37, 155, 138, 0.1)',
      },

      transitionDuration: {
        // Microinteraction timings
        fast: '150ms',
        base: '200ms',
        slow: '300ms',
      },

      transitionTimingFunction: {
        smooth: 'cubic-bezier(0.4, 0, 0.2, 1)',
      },
    },
  },

  plugins: [],
};
