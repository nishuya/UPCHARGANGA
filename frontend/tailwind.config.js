/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      screens: {
        xs: '420px',
      },
      colors: {
        // Primary Brand Color: Healthcare Emerald
        upchar: {
          50: '#F0FAF7',
          100: '#D4F0EA',
          200: '#A8E1D5',
          300: '#7CD1C0',
          400: '#51C2AB',
          500: '#259B8A',
          600: '#1F7D6F',
          700: '#185F54',
          800: '#124139',
          900: '#0C231E',
        },

        // Secondary: Deep Teal
        teal: {
          0: '#FFFFFF',
          50: '#F0FDFC',
          100: '#CCFAF5',
          200: '#99F6E4',
          300: '#5EEAD4',
          400: '#2DD4BF',
          500: '#0891B2',
          600: '#0E7490',
          700: '#0F766E',
          800: '#115E59',
          900: '#134E4A',
        },

        // Tertiary: Professional Blue
        blue: {
          0: '#FFFFFF',
          50: '#EFF6FF',
          100: '#DBEAFE',
          200: '#BFDBFE',
          300: '#93C5FD',
          400: '#60A5FA',
          500: '#0B5BA3',
          600: '#0A4A85',
          700: '#1D4ED8',
          800: '#1E40AF',
          900: '#1E3A8A',
        },

        // Accent: Gold/Yellow
        gold: {
          0: '#FFFFFF',
          50: '#FEF9E7',
          100: '#FEF3CE',
          200: '#FDE68A',
          300: '#FCD34D',
          400: '#FBBF24',
          500: '#D4A123',
          600: '#B8881A',
          700: '#92400E',
        },

        // Semantic Status Colors (full shade support)
        success: {
          0: '#FFFFFF',
          DEFAULT: '#10B981',
          50: '#ECFDF5',
          100: '#D1FAE5',
          200: '#A7F3D0',
          300: '#6EE7B7',
          500: '#10B981',
          600: '#059669',
          700: '#047857',
        },
        warning: {
          0: '#FFFFFF',
          DEFAULT: '#F59E0B',
          50: '#FFFBEB',
          100: '#FEF3C7',
          200: '#FDE68A',
          300: '#FCD34D',
          500: '#F59E0B',
          600: '#D97706',
          700: '#B45309',
        },
        danger: {
          0: '#FFFFFF',
          DEFAULT: '#EF4444',
          50: '#FEF2F2',
          100: '#FEE2E2',
          200: '#FECACA',
          300: '#FCA5A5',
          500: '#EF4444',
          600: '#DC2626',
          700: '#B91C1C',
          900: '#7F1D1D',
        },
        info: {
          0: '#FFFFFF',
          DEFAULT: '#3B82F6',
          50: '#EFF6FF',
          100: '#DBEAFE',
          200: '#BFDBFE',
          500: '#3B82F6',
          600: '#2563EB',
          700: '#1D4ED8',
        },

        // Neutral System
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

        // Semantic aliases used in Admin & Reception components
        ink: {
          DEFAULT: '#111827',
          muted: '#4B5563',
          subtle: '#6B7280',
        },
        surface: {
          DEFAULT: '#F9FAFB',
          raised: '#FFFFFF',
          border: '#E5E7EB',
        },
        primary: {
          DEFAULT: '#259B8A',
          hover: '#1F7D6F',
        },
        role: {
          patient: '#259B8A',
          reception: '#D4A123',
          doctor: '#0891B2',
          admin: '#0B5BA3',
        },

        // Legacy HealQ palette
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
        display: [
          'Sora',
          'Segoe UI',
          '-apple-system',
          'BlinkMacSystemFont',
          'Helvetica Neue',
          'sans-serif',
        ],
        sans: [
          'Inter',
          'Segoe UI',
          '-apple-system',
          'BlinkMacSystemFont',
          'Helvetica Neue',
          'sans-serif',
        ],
        serif: ['Lora', 'ui-serif', 'Georgia', 'serif'],
      },

      fontSize: {
        // Fluid responsive typography so mobile screens never overflow
        'display-lg': ['clamp(2rem, 5vw, 3.5rem)', { lineHeight: '1.15', letterSpacing: '-0.02em', fontWeight: '700' }],
        'display': ['clamp(1.625rem, 4vw, 2.75rem)', { lineHeight: '1.2', letterSpacing: '-0.02em', fontWeight: '700' }],
        'h1': ['clamp(1.5rem, 3.2vw, 2.25rem)', { lineHeight: '1.25', letterSpacing: '-0.01em', fontWeight: '700' }],
        'h2': ['clamp(1.25rem, 2.5vw, 1.75rem)', { lineHeight: '1.3', letterSpacing: '0', fontWeight: '600' }],
        'h3': ['clamp(1.0625rem, 2vw, 1.25rem)', { lineHeight: '1.4', letterSpacing: '0', fontWeight: '600' }],
        'body-lg': ['16px', { lineHeight: '1.6', letterSpacing: '0', fontWeight: '400' }],
        'body': ['14px', { lineHeight: '1.6', letterSpacing: '0', fontWeight: '400' }],
        'body-sm': ['13px', { lineHeight: '1.5', letterSpacing: '0.01em', fontWeight: '400' }],
        'label': ['12px', { lineHeight: '1.4', letterSpacing: '0.05em', fontWeight: '500' }],
        'caption': ['12px', { lineHeight: '1.4', letterSpacing: '0.02em', fontWeight: '400' }],
        'button': ['14px', { lineHeight: '1.5', letterSpacing: '0', fontWeight: '600' }],
      },

      spacing: {
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
        none: 'none',
        sm: '0 1px 2px rgba(0, 0, 0, 0.05)',
        base: '0 2px 4px rgba(0, 0, 0, 0.08)',
        md: '0 4px 12px rgba(0, 0, 0, 0.10)',
        lg: '0 12px 24px rgba(0, 0, 0, 0.12)',
        xl: '0 20px 40px rgba(0, 0, 0, 0.15)',
        'focus-ring': '0 0 0 3px rgba(37, 155, 138, 0.1)',
      },

      transitionDuration: {
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
