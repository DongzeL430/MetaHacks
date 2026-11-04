/**
 * The StudBuds bear (public/logo.webp). Decorative: the name or a message always sits next to it,
 * so screen readers skip it. Size it with className, e.g. "w-16 h-16".
 */
export default function Logo({ className = 'w-16 h-16' }: { className?: string }) {
  return (
    <img
      src="/logo.webp"
      alt=""
      width={512}
      height={512}
      // doodle.css frames every image; these turn that off
      className={`${className} shrink-0 object-contain rounded-none border-0 [border-image:none] shadow-none`}
    />
  );
}
