import type { SVGProps } from 'react';

type IconProps = SVGProps<SVGSVGElement> & { size?: number };

function base({ size = 20, ...props }: IconProps, children: React.ReactNode, viewBox = '0 0 24 24') {
  return (
    <svg
      width={size}
      height={size}
      viewBox={viewBox}
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    >
      {children}
    </svg>
  );
}

export const HomeIcon = (p: IconProps) =>
  base(p, (
    <>
      <path d="M3 10.5 12 3l9 7.5" />
      <path d="M5 9.5V21h14V9.5" />
      <path d="M9.5 21v-6h5v6" />
    </>
  ));

export const ServersIcon = (p: IconProps) =>
  base(p, (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M3 12h18" />
      <path d="M12 3c2.5 2.6 3.9 5.7 3.9 9S14.5 18.4 12 21c-2.5-2.6-3.9-5.7-3.9-9S9.5 5.6 12 3Z" />
    </>
  ));

export const ShieldIcon = (p: IconProps) =>
  base(p, (
    <>
      <path d="M12 3 5 5.8v5.4c0 4.3 2.9 7.4 7 9.3 4.1-1.9 7-5 7-9.3V5.8L12 3Z" />
      <path d="m9.2 12 2 2 3.6-3.8" />
    </>
  ));

export const AppsIcon = (p: IconProps) =>
  base(p, (
    <>
      <rect x="3.5" y="3.5" width="7" height="7" rx="1.8" />
      <rect x="13.5" y="3.5" width="7" height="7" rx="1.8" />
      <rect x="3.5" y="13.5" width="7" height="7" rx="1.8" />
      <rect x="13.5" y="13.5" width="7" height="7" rx="1.8" />
    </>
  ));

export const ImportIcon = (p: IconProps) =>
  base(p, (
    <>
      <path d="M12 3v10" />
      <path d="m8 9 4 4 4-4" />
      <path d="M4 15v3.5A2.5 2.5 0 0 0 6.5 21h11a2.5 2.5 0 0 0 2.5-2.5V15" />
    </>
  ));

export const PowerIcon = (p: IconProps) =>
  base(p, (
    <>
      <path d="M12 3v8" />
      <path d="M6.3 6.5a8 8 0 1 0 11.4 0" />
    </>
  ));

export const RefreshIcon = (p: IconProps) =>
  base(p, (
    <>
      <path d="M20 11a8 8 0 0 0-14.5-4.5L4 8" />
      <path d="M4 3v5h5" />
      <path d="M4 13a8 8 0 0 0 14.5 4.5L20 16" />
      <path d="M20 21v-5h-5" />
    </>
  ));

export const CheckIcon = (p: IconProps) => base(p, <path d="m4.5 12.5 5 5 10-11" />);

export const SearchIcon = (p: IconProps) =>
  base(p, (
    <>
      <circle cx="11" cy="11" r="7" />
      <path d="m20.5 20.5-4.6-4.6" />
    </>
  ));

export const FolderIcon = (p: IconProps) =>
  base(p, (
    <path d="M3.5 7A2.5 2.5 0 0 1 6 4.5h3.6a2 2 0 0 1 1.5.7l1.2 1.4a2 2 0 0 0 1.5.7H18a2.5 2.5 0 0 1 2.5 2.5V17a2.5 2.5 0 0 1-2.5 2.5H6A2.5 2.5 0 0 1 3.5 17V7Z" />
  ));

export const LinkIcon = (p: IconProps) =>
  base(p, (
    <>
      <path d="M10 14a5 5 0 0 0 7.1 0l2-2a5 5 0 0 0-7.1-7.1l-1.1 1.1" />
      <path d="M14 10a5 5 0 0 0-7.1 0l-2 2a5 5 0 0 0 7.1 7.1l1.1-1.1" />
    </>
  ));

export const TrashIcon = (p: IconProps) =>
  base(p, (
    <>
      <path d="M4 7h16" />
      <path d="M9.5 7V5.4A1.4 1.4 0 0 1 10.9 4h2.2a1.4 1.4 0 0 1 1.4 1.4V7" />
      <path d="M6.5 7 7.3 19a1.6 1.6 0 0 0 1.6 1.5h6.2a1.6 1.6 0 0 0 1.6-1.5L17.5 7" />
      <path d="M10 11v5.5M14 11v5.5" />
    </>
  ));

export const ChevronRightIcon = (p: IconProps) => base(p, <path d="m9 5 7 7-7 7" />);
export const ChevronDownIcon = (p: IconProps) => base(p, <path d="m6 9 6 6 6-6" />);

export const BoltIcon = (p: IconProps) =>
  base(p, <path d="M13 2 4.5 13.5H11L10 22l8.5-11.5H12L13 2Z" />);

export const ClockIcon = (p: IconProps) =>
  base(p, (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3.5 2" />
    </>
  ));

export const SignalIcon = (p: IconProps) =>
  base(p, (
    <>
      <path d="M5 19v-4" />
      <path d="M10 19v-8" />
      <path d="M15 19V7" />
      <path d="M20 19V3" />
    </>
  ));

export const PawIcon = (p: IconProps) =>
  base(
    p,
    <>
      <circle cx="7" cy="8" r="1.9" fill="currentColor" stroke="none" />
      <circle cx="12" cy="6" r="1.9" fill="currentColor" stroke="none" />
      <circle cx="17" cy="8" r="1.9" fill="currentColor" stroke="none" />
      <path
        d="M12 11c-3 0-5.5 2.3-5.5 5 0 1.7 1.3 3 3 3 1 0 1.7-.5 2.5-.5s1.5.5 2.5.5c1.7 0 3-1.3 3-3 0-2.7-2.5-5-5.5-5Z"
        fill="currentColor"
        stroke="none"
      />
    </>,
  );

export const PlusIcon = (p: IconProps) =>
  base(p, (
    <>
      <path d="M12 5v14" />
      <path d="M5 12h14" />
    </>
  ));

export const SettingsIcon = (p: IconProps) =>
  base(p, (
    <>
      <circle cx="12" cy="12" r="3" />
      <path d="M12 1v2.2M12 20.8V23M4.2 4.2l1.6 1.6M18.2 18.2l1.6 1.6M1 12h2.2M20.8 12H23M4.2 19.8l1.6-1.6M18.2 5.8l1.6-1.6" />
    </>
  ));

export const HelpCircleIcon = (p: IconProps) =>
  base(p, (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M9.6 9.2a2.4 2.4 0 0 1 4.6.9c0 1.6-2.2 2-2.2 3.4" />
      <circle cx="12" cy="16.6" r="0.85" fill="currentColor" stroke="none" />
    </>
  ));
