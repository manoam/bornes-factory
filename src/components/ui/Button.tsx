import { forwardRef } from 'react'
import type { ButtonHTMLAttributes } from 'react'
import { Loader2 } from 'lucide-react'
import { cn } from './cn'

const VARIANTS = {
  primary:
    'bg-[--k-primary] text-white border-[--k-primary] hover:brightness-110 shadow-sm shadow-[--k-primary]/20',
  secondary:
    'bg-white text-[--k-text] border-[--k-border] hover:bg-[--k-surface-2]',
  ghost:
    'bg-transparent text-[--k-muted] border-transparent hover:bg-[--k-surface-2] hover:text-[--k-text]',
  danger:
    'bg-white text-[--k-danger] border-[--k-border] hover:bg-red-50',
  outline:
    'bg-transparent text-[--k-text] border-[--k-border] hover:bg-[--k-surface-2]',
}

const SIZES = {
  sm: 'h-8 px-3 text-[13px]',
  md: 'h-9 px-4 text-sm',
  lg: 'h-10 px-5 text-sm',
}

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: keyof typeof VARIANTS
  size?: keyof typeof SIZES
  isLoading?: boolean
}

const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = 'primary', size = 'md', isLoading, children, disabled, ...props }, ref) => {
    return (
      <button
        ref={ref}
        className={cn(
          'inline-flex items-center justify-center gap-1.5 rounded-xl border font-medium transition disabled:opacity-50 disabled:cursor-not-allowed',
          SIZES[size],
          VARIANTS[variant],
          className
        )}
        disabled={disabled || isLoading}
        {...props}
      >
        {isLoading && <Loader2 className="h-4 w-4 animate-spin" />}
        {children}
      </button>
    )
  }
)

Button.displayName = 'Button'

export default Button
