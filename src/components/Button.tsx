import type { ButtonHTMLAttributes, ReactNode } from 'react';

type Variant = 'primary' | 'secondary' | 'ghost' | 'gold';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  children: ReactNode;
}

const VARIANTS: Record<Variant, string> = {
  primary: 'bg-emerald-500 hover:bg-emerald-400 text-emerald-950 shadow-lg shadow-emerald-900/40',
  secondary: 'bg-white/10 hover:bg-white/20 text-white border border-white/15',
  ghost: 'bg-transparent hover:bg-white/10 text-white/80',
  gold: 'bg-gradient-to-b from-gold-400 to-gold-500 hover:from-gold-400 hover:to-gold-400 text-amber-950 shadow-lg shadow-amber-900/40',
};

export function Button({ variant = 'primary', children, className, ...rest }: ButtonProps) {
  return (
    <button
      {...rest}
      className={[
        'inline-flex items-center justify-center gap-2 rounded-xl px-5 py-3 text-base font-bold transition active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40',
        VARIANTS[variant],
        className ?? '',
      ].join(' ')}
    >
      {children}
    </button>
  );
}
