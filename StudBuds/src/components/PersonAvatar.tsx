/** Background colors for initials avatars, picked from the person's id so each person keeps theirs */
const PALETTE = ['#F2A65A', '#9FD6A6', '#F2A99E', '#A9C7E8', '#E8D27A', '#C9B3E6'];

const colorFor = (id: string) => {
  let hash = 0;
  for (const ch of id) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
  return PALETTE[hash % PALETTE.length];
};

const initialsOf = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join('')
    .toUpperCase();

/**
 * A person's avatar picture, or their initials on a colored circle.
 * Decorative: their name is always shown next to it, so screen readers skip it.
 * Size it with className, e.g. "w-12 h-12".
 */
export default function PersonAvatar({
  person,
  className = 'w-10 h-10',
}: {
  person: { id: string; name: string; avatar?: string };
  className?: string;
}) {
  const shared = `${className} shrink-0 rounded-full border-2 border-[#3c3c3c]`;

  // A Muse avatar is its own square tile, so it shows as is: no circle, and none of doodle.css's image frame
  if (person.avatar) {
    return (
      <img src={person.avatar} alt="" className={`${className} shrink-0 object-contain rounded-none border-0 [border-image:none]`} />
    );
  }

  return (
    <span
      aria-hidden="true"
      className={`${shared} flex items-center justify-center overflow-hidden`}
      // Container units let the initials scale with whatever size the avatar is given
      style={{ backgroundColor: colorFor(person.id), containerType: 'size' }}
    >
      <span className="text-[38cqh] leading-none">{initialsOf(person.name)}</span>
    </span>
  );
}