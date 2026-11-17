import type { ReactNode } from 'react'

type IconName =
  | 'dashboard'
  | 'numbers'
  | 'billing'
  | 'calls'
  | 'admin'
  | 'signout'
  | 'menu'
  | 'close'
  | 'plus'
  | 'search'
  | 'arrow'
  | 'refresh'
  | 'check'
  | 'spark'
  | 'user'
  | 'server'
  | 'mic'
  | 'clock'
  | 'chevron'

const paths: Record<IconName, ReactNode> = {
  dashboard: (
    <>
      <rect x="3" y="3" width="7" height="7" rx="1.5" />
      <rect x="14" y="3" width="7" height="4" rx="1.5" />
      <rect x="14" y="11" width="7" height="10" rx="1.5" />
      <rect x="3" y="14" width="7" height="7" rx="1.5" />
    </>
  ),
  numbers: (
    <>
      <path d="M9 4 7 20M17 4l-2 16M4 9h16M3 15h16" />
    </>
  ),
  billing: (
    <>
      <rect x="2.5" y="5" width="19" height="14" rx="2.5" />
      <path d="M2.5 10h19M6 15h4" />
    </>
  ),
  calls: (
    <>
      <path d="M6.6 3.5 9 8.2 6.8 10a13 13 0 0 0 7.2 7.2l1.8-2.2 4.7 2.4-.6 2.1a2 2 0 0 1-2.2 1.4C10.4 19.7 4.3 13.6 3.1 6.3A2 2 0 0 1 4.5 4.1Z" />
    </>
  ),
  admin: (
    <>
      <path d="M12 3 4.5 6v5.4c0 4.4 3 7.6 7.5 9.1 4.5-1.5 7.5-4.7 7.5-9.1V6Z" />
      <path d="m8.7 11.7 2.2 2.2 4.4-4.4" />
    </>
  ),
  signout: (
    <>
      <path d="M14 4h4.5A1.5 1.5 0 0 1 20 5.5v13a1.5 1.5 0 0 1-1.5 1.5H14" />
      <path d="M10 8l-4 4 4 4M6 12h9" />
    </>
  ),
  menu: (
    <>
      <path d="M3.5 7h17M3.5 12h17M3.5 17h17" />
    </>
  ),
  close: (
    <>
      <path d="m5.5 5.5 13 13M18.5 5.5l-13 13" />
    </>
  ),
  plus: (
    <>
      <path d="M12 5v14M5 12h14" />
    </>
  ),
  search: (
    <>
      <circle cx="11" cy="11" r="6.5" />
      <path d="m16 16 4.5 4.5" />
    </>
  ),
  arrow: (
    <>
      <path d="M4 12h15M13.5 6.5 19 12l-5.5 5.5" />
    </>
  ),
  refresh: (
    <>
      <path d="M20 12a8 8 0 1 1-2.4-5.7" />
      <path d="M20 4v4h-4" />
    </>
  ),
  check: (
    <>
      <path d="m4.5 12.5 5 5 10-11" />
    </>
  ),
  spark: (
    <>
      <path d="M12 3.5 13.8 9l5.7 1.9-5.7 1.9L12 18.5l-1.8-5.7L4.5 10.9 10.2 9Z" />
      <path d="M18.5 16.5 19.2 18.6 21.5 19.4l-2.3.8-.7 2.2-.7-2.2-2.3-.8 2.3-.8Z" />
    </>
  ),
  user: (
    <>
      <circle cx="12" cy="8" r="3.6" />
      <path d="M4.5 20a7.5 7.5 0 0 1 15 0" />
    </>
  ),
  server: (
    <>
      <rect x="3.5" y="4" width="17" height="6.5" rx="2" />
      <rect x="3.5" y="13.5" width="17" height="6.5" rx="2" />
      <path d="M7 7.2h.01M7 16.8h.01" />
    </>
  ),
  mic: (
    <>
      <rect x="9" y="3" width="6" height="11" rx="3" />
      <path d="M5.5 11.5a6.5 6.5 0 0 0 13 0M12 18v3M9 21h6" />
    </>
  ),
  clock: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 7.5V12l3 2" />
    </>
  ),
  chevron: (
    <>
      <path d="m9 5 7 7-7 7" />
    </>
  ),
}

export function Icon({ name, size = 18, className }: { name: IconName, size?: number, className?: string }) {
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {paths[name]}
    </svg>
  )
}

export function BrandMark({ size = 30 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true" focusable="false">
      <rect width="32" height="32" rx="8" fill="var(--mark-bg, #DAFA9C)" />
      <path
        d="M9 12.5v7M13.4 8.5v15M18.2 10.8v10.4M23 13.5v5"
        stroke="var(--mark-ink, #10130A)"
        strokeWidth="2.3"
        strokeLinecap="round"
      />
    </svg>
  )
}

export function WhatsAppMark({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path
        fill="#25D366"
        d="M12.04 2C6.58 2 2.13 6.45 2.13 11.91c0 1.75.46 3.45 1.32 4.95L2 22l5.25-1.38a9.87 9.87 0 0 0 4.79 1.22h.01c5.46 0 9.91-4.45 9.91-9.91 0-2.65-1.03-5.14-2.9-7.01A9.82 9.82 0 0 0 12.04 2Zm0 18.15h-.01a8.2 8.2 0 0 1-4.18-1.15l-.3-.18-3.11.82.83-3.04-.2-.31a8.2 8.2 0 0 1-1.26-4.38c0-4.54 3.7-8.23 8.24-8.23 2.2 0 4.27.86 5.82 2.41a8.18 8.18 0 0 1 2.41 5.83c0 4.54-3.7 8.23-8.24 8.23Zm4.52-6.16c-.25-.12-1.47-.72-1.69-.81-.23-.08-.39-.12-.56.13-.16.24-.64.8-.79.97-.14.16-.29.18-.54.06-.25-.12-1.05-.39-1.99-1.23-.74-.66-1.24-1.47-1.38-1.72-.15-.25-.02-.38.11-.5.11-.11.25-.29.37-.43.12-.14.16-.25.25-.41.08-.17.04-.31-.02-.43-.06-.12-.56-1.34-.76-1.84-.2-.48-.41-.42-.56-.42h-.48c-.16 0-.43.06-.66.31-.23.25-.87.85-.87 2.07 0 1.22.89 2.4 1.01 2.56.12.17 1.75 2.67 4.23 3.74.59.26 1.05.41 1.41.52.59.19 1.13.16 1.56.1.48-.07 1.47-.6 1.68-1.18.21-.58.21-1.07.14-1.18-.06-.11-.22-.17-.47-.29Z"
      />
    </svg>
  )
}
