/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
GNU Affero General Public License for more details.

You should have received a copy of the GNU Affero General Public License
along with this program. If not, see <https://www.gnu.org/licenses/>.

For commercial licensing, please contact support@quantumnous.com
*/
import { Link } from '@tanstack/react-router'
import { ArrowUpRight } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { LanguageSwitcher } from '@/components/language-switcher'
import { ThemeSwitch } from '@/components/theme-switch'
import { Card, CardContent } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { useSystemConfig } from '@/hooks/use-system-config'
import { cn } from '@/lib/utils'

type AuthLayoutProps = {
  children: React.ReactNode
  className?: string
}

export function AuthLayout(props: AuthLayoutProps) {
  const { systemName, logo, loading } = useSystemConfig()

  return (
    <div className='bg-background relative min-h-svh max-w-none overflow-hidden'>
      <div
        aria-hidden='true'
        className='pointer-events-none absolute inset-0 -z-10 overflow-hidden'
      >
        <div className='bg-primary/15 absolute -top-32 left-1/2 size-[42rem] -translate-x-1/2 rounded-full blur-3xl' />
        <div className='bg-chart-2/10 absolute -right-24 bottom-0 size-[28rem] rounded-full blur-3xl' />
        <div className='bg-muted/50 absolute inset-0 [mask-image:radial-gradient(ellipse_at_center,black,transparent_72%)]' />
      </div>

      <header className='absolute inset-x-0 top-0 z-10 flex items-center justify-between gap-4 px-5 py-5 sm:px-8 sm:py-8'>
        <BrandLink loading={loading} logo={logo} systemName={systemName} />
        <div className='flex items-center gap-1'>
          <LanguageSwitcher />
          <ThemeSwitch />
        </div>
      </header>

      <main className='flex min-h-svh items-center justify-center overflow-y-auto px-5 py-24 sm:px-8'>
        <Card
          className={cn(
            'bg-card/90 w-full max-w-md border-0 py-0 shadow-xl shadow-black/5 ring-1 ring-black/5 backdrop-blur-sm dark:bg-card/80 dark:shadow-black/20 dark:ring-white/10',
            props.className
          )}
        >
          <CardContent className='px-6 py-7 sm:px-8 sm:py-8'>
            {props.children}
          </CardContent>
        </Card>
      </main>
    </div>
  )
}

type BrandLinkProps = {
  loading: boolean
  logo: string
  systemName: string
}

function BrandLink(props: BrandLinkProps) {
  const { t } = useTranslation()

  return (
    <Link
      to='/'
      className='group focus-visible:ring-ring/50 flex w-fit items-center gap-3 rounded-lg outline-none focus-visible:ring-3'
    >
      <div className='relative size-9 shrink-0'>
        {props.loading ? (
          <Skeleton className='absolute inset-0 rounded-lg' />
        ) : (
          <img
            src={props.logo}
            alt={t('Logo')}
            className='size-9 rounded-lg object-cover shadow-sm ring-1 ring-black/5 dark:ring-white/10'
          />
        )}
      </div>
      {props.loading ? (
        <Skeleton className='h-5 w-28' />
      ) : (
        <span className='flex items-center gap-1.5 text-lg font-semibold tracking-tight'>
          {props.systemName}
          <ArrowUpRight
            className='text-muted-foreground size-3.5 opacity-0 transition-opacity group-hover:opacity-100'
            aria-hidden='true'
          />
        </span>
      )}
    </Link>
  )
}
