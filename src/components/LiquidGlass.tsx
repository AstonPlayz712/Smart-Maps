import { forwardRef, type HTMLAttributes, type ReactNode } from 'react';

interface Props extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode;
  /** Visual thickness — drives blur strength + shadow depth. */
  thickness?: 'thin' | 'medium' | 'thick';
  /** Edge cyan glow intensity. */
  glow?: 'none' | 'subtle' | 'strong';
  className?: string;
}

/**
 * Liquid Glass (LG) base panel.
 *
 * Implements the proto's LG language: backdrop blur for refraction, an
 * inset top-edge highlight (the "edge light"), a soft inner cyan tint
 * (the "internal glow"), and a low outer drop shadow for depth. No
 * bouncy animation, no springy transitions — engineered motion only.
 */
const LiquidGlass = forwardRef<HTMLDivElement, Props>(function LiquidGlass(
  { children, thickness = 'medium', glow = 'subtle', className = '', ...rest },
  ref
) {
  const classes = ['lg-panel', `lg-thickness-${thickness}`, `lg-glow-${glow}`, className]
    .filter(Boolean)
    .join(' ');
  return (
    <div ref={ref} className={classes} {...rest}>
      <span className="lg-edge-top" aria-hidden />
      <div className="lg-content">{children}</div>
    </div>
  );
});

export default LiquidGlass;
