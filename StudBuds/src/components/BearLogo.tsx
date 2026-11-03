import bearLogo from '../assets/bear-logo.png';

/**
 * The StudBuds bear, reading on a blanket: the original picture, cropped to the bear (the viewBox
 * picks the part of the 1024x1024 image to show). Its white background is blended away
 * (mix-blend-mode: multiply), so it sits on the paper instead of in a white box.
 */
export default function BearLogo({ size = 48, className = '' }: { size?: number; className?: string }) {
  return (
    <svg
      className={`mix-blend-multiply ${className}`}
      width={size}
      height={size}
      viewBox="195 265 655 595"
      role="img"
      aria-label="StudBuds logo"
    >
      <image href={bearLogo} width="1024" height="1024" />
    </svg>
  );
}
