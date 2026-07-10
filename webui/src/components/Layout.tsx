import type { ReactNode } from 'react'

interface LayoutProps {
  header: ReactNode
  children: ReactNode
}

export default function Layout({ header, children }: LayoutProps) {
  return (
    <>
      <div className='pt-safe' />
      {header}
      <section
        className='w-full flex-1 min-h-0 flex flex-col overflow-auto'
        style={{ paddingBottom: 'calc(16px + var(--bottom-inset, 0px))' }}
      >
        <main className="w-full px-4 box-border flex flex-col flex-1 min-h-0 gap-2 landscape:flex-row items-center landscape:items-stretch landscape:justify-center">
          {children}
        </main>
      </section>
    </>
  )
}
