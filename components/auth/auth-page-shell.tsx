import { cn } from '@/lib/utils'

type AuthPageShellProps = {
  children: React.ReactNode
  eyebrow?: string
  title: string
  description: string
  className?: string
}

export function AuthPageShell({
  children,
  eyebrow = 'Account',
  title,
  description,
  className
}: AuthPageShellProps) {
  return (
    <main className="min-h-full bg-background px-4 py-6 text-foreground md:px-8 md:py-8">
      <div className="mx-auto flex min-h-full w-full max-w-6xl flex-col">
        <section
          className={cn(
            'grid flex-1 items-center gap-8 md:grid-cols-[minmax(0,0.9fr)_minmax(360px,440px)]',
            className
          )}
        >
          <div className="hidden max-w-xl md:block">
            <p className="text-xs font-medium uppercase text-muted-foreground">
              {eyebrow}
            </p>
            <h1 className="mt-4 font-[var(--font-display)] text-5xl font-semibold leading-none tracking-normal md:text-6xl">
              {title}
            </h1>
            <p className="mt-5 max-w-md text-base leading-7 text-muted-foreground">
              {description}
            </p>
            <div className="mt-8 grid max-w-md gap-3">
              {[
                'Search without losing the sources.',
                'Save useful reading for later.',
                'Carry your source preferences across chats.'
              ].map(item => (
                <div
                  key={item}
                  className="flex items-center gap-3 text-sm text-muted-foreground"
                >
                  <span className="size-1.5 rounded-full bg-[var(--indigo)]" />
                  <span>{item}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="mx-auto w-full max-w-md">{children}</div>
        </section>
      </div>
    </main>
  )
}
