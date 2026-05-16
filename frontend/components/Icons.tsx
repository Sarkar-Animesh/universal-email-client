import * as React from "react";

type IconProps = React.SVGProps<SVGSVGElement> & { size?: number };

function svgProps(p: IconProps) {
  const { size = 20, className, ...rest } = p;
  return {
    width: size,
    height: size,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.8,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    className,
    "aria-hidden": true,
    ...rest,
  };
}

export const InboxIcon = (p: IconProps) => (
  <svg {...svgProps(p)}>
    <path d="M22 12h-6l-2 3h-4l-2-3H2" />
    <path d="M5.45 5.11L2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z" />
  </svg>
);

export const SearchIcon = (p: IconProps) => (
  <svg {...svgProps(p)}>
    <circle cx="11" cy="11" r="7" />
    <path d="m20 20-3.5-3.5" />
  </svg>
);

export const UsersIcon = (p: IconProps) => (
  <svg {...svgProps(p)}>
    <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
    <circle cx="9" cy="7" r="4" />
    <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
    <path d="M16 3.13a4 4 0 0 1 0 7.75" />
  </svg>
);

export const PenIcon = (p: IconProps) => (
  <svg {...svgProps(p)}>
    <path d="M12 20h9" />
    <path d="M16.5 3.5a2.12 2.12 0 1 1 3 3L7 19l-4 1 1-4 12.5-12.5z" />
  </svg>
);

export const ArrowLeftIcon = (p: IconProps) => (
  <svg {...svgProps(p)}>
    <path d="M19 12H5" />
    <path d="m12 19-7-7 7-7" />
  </svg>
);

export const ArchiveIcon = (p: IconProps) => (
  <svg {...svgProps(p)}>
    <rect x="2" y="3" width="20" height="5" rx="1" />
    <path d="M4 8v11a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8" />
    <path d="M10 12h4" />
  </svg>
);

export const TrashIcon = (p: IconProps) => (
  <svg {...svgProps(p)}>
    <path d="M3 6h18" />
    <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" />
    <path d="M10 11v6M14 11v6" />
  </svg>
);

export const ReplyIcon = (p: IconProps) => (
  <svg {...svgProps(p)}>
    <path d="M9 17 4 12l5-5" />
    <path d="M20 18v-2a4 4 0 0 0-4-4H4" />
  </svg>
);

export const SendIcon = (p: IconProps) => (
  <svg {...svgProps(p)}>
    <path d="m22 2-7 20-4-9-9-4 20-7z" />
    <path d="M22 2 11 13" />
  </svg>
);

export const SparklesIcon = (p: IconProps) => (
  <svg {...svgProps(p)}>
    <path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M5.6 18.4l2.1-2.1M16.3 7.7l2.1-2.1" />
    <circle cx="12" cy="12" r="3" />
  </svg>
);

export const RefreshIcon = (p: IconProps) => (
  <svg {...svgProps(p)}>
    <path d="M21 12a9 9 0 1 1-3-6.7L21 8" />
    <path d="M21 3v5h-5" />
  </svg>
);

export const PlusIcon = (p: IconProps) => (
  <svg {...svgProps(p)}>
    <path d="M12 5v14M5 12h14" />
  </svg>
);

export const LockIcon = (p: IconProps) => (
  <svg {...svgProps(p)}>
    <rect x="4" y="11" width="16" height="10" rx="2" />
    <path d="M8 11V7a4 4 0 0 1 8 0v4" />
  </svg>
);

export const LogoutIcon = (p: IconProps) => (
  <svg {...svgProps(p)}>
    <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
    <path d="m16 17 5-5-5-5" />
    <path d="M21 12H9" />
  </svg>
);

export const CheckIcon = (p: IconProps) => (
  <svg {...svgProps(p)}>
    <path d="M20 6 9 17l-5-5" />
  </svg>
);

export const AlertIcon = (p: IconProps) => (
  <svg {...svgProps(p)}>
    <circle cx="12" cy="12" r="10" />
    <path d="M12 8v4M12 16h.01" />
  </svg>
);

export const MailIcon = (p: IconProps) => (
  <svg {...svgProps(p)}>
    <rect x="2" y="4" width="20" height="16" rx="2" />
    <path d="m22 6-10 7L2 6" />
  </svg>
);

export const ServerIcon = (p: IconProps) => (
  <svg {...svgProps(p)}>
    <rect x="2" y="3" width="20" height="7" rx="1.5" />
    <rect x="2" y="14" width="20" height="7" rx="1.5" />
    <path d="M6 6.5h.01M6 17.5h.01" />
  </svg>
);

export const ChevronRightIcon = (p: IconProps) => (
  <svg {...svgProps(p)}>
    <path d="m9 18 6-6-6-6" />
  </svg>
);

export const ChevronDownIcon = (p: IconProps) => (
  <svg {...svgProps(p)}>
    <path d="m6 9 6 6 6-6" />
  </svg>
);

export const GoogleIcon = (p: IconProps) => {
  const { size = 20, className, ...rest } = p;
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      className={className}
      aria-hidden
      {...rest}
    >
      <path
        fill="#4285F4"
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
      />
      <path
        fill="#34A853"
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.99.66-2.25 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84A11 11 0 0 0 12 23z"
      />
      <path
        fill="#FBBC05"
        d="M5.84 14.1A6.6 6.6 0 0 1 5.5 12c0-.73.13-1.44.34-2.1V7.07H2.18a11 11 0 0 0 0 9.86l3.66-2.84z"
      />
      <path
        fill="#EA4335"
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1A11 11 0 0 0 2.18 7.07l3.66 2.84C6.71 7.31 9.14 5.38 12 5.38z"
      />
    </svg>
  );
};

export const MicrosoftIcon = (p: IconProps) => {
  const { size = 20, className, ...rest } = p;
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      className={className}
      aria-hidden
      {...rest}
    >
      <path fill="#F25022" d="M2 2h9.5v9.5H2z" />
      <path fill="#7FBA00" d="M12.5 2H22v9.5h-9.5z" />
      <path fill="#00A4EF" d="M2 12.5h9.5V22H2z" />
      <path fill="#FFB900" d="M12.5 12.5H22V22h-9.5z" />
    </svg>
  );
};
