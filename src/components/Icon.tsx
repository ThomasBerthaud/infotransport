type IconName = 'external' | 'up' | 'down' | 'left' | 'right' | 'overflow';
const paths: Record<IconName, string> = {
  external: 'M7 17 17 7M7 7h10v10',
  up: 'm6 14 6-6 6 6',
  down: 'm6 10 6 6 6-6',
  left: 'm14 6-6 6 6 6',
  right: 'm10 6 6 6-6 6',
  overflow: 'M14 4H4v16h10m4-16h2v3m0 10v3h-2M10 12h12m-3-3 3 3-3 3',
};
export function Icon({ name, size = 18 }: { name: IconName; size?: number }) {
  return (
    <svg className="ui-icon" width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      <path
        d={paths[name]}
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
