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
import {
  Activity,
  ArrowUpRight,
  ChartNoAxesCombined,
  Route,
  ShieldCheck,
} from 'lucide-react'
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
        className='pointer-events-none absolute inset-0 bg-[linear-gradient(to_right,var(--border)_1px,transparent_1px),linear-gradient(to_bottom,var(--border)_1px,transparent_1px)] [mask-image:linear-gradient(to_bottom,black,transparent_45%)] bg-[size:3rem_3rem] opacity-20'
      />

      <header className='absolute inset-x-0 top-0 z-10 flex items-center justify-between gap-4 px-5 py-5 sm:px-8 sm:py-7'>
        <BrandLink loading={loading} logo={logo} systemName={systemName} />
        <div className='flex items-center gap-1'>
          <LanguageSwitcher />
          <ThemeSwitch />
        </div>
      </header>

      <main className='relative z-0 grid min-h-svh lg:grid-cols-[minmax(0,1.15fr)_minmax(26rem,0.85fr)]'>
        <AuthOperationsPreview />
        <div className='lg:border-border flex min-w-0 items-center justify-center px-5 py-28 sm:px-8 lg:border-l lg:px-12'>
          <Card
            className={cn(
              'w-full max-w-md border-border bg-card/95 py-0 shadow-[0_20px_60px_-35px_rgb(0_0_0_/_0.3)]',
              'dark:bg-card/90',
              props.className
            )}
          >
            <CardContent className='px-6 py-7 sm:px-8 sm:py-9'>
              {props.children}
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  )
}

function AuthOperationsPreview() {
  const { t } = useTranslation()

  const rows = [
    {
      icon: Route,
      label: t('Request routing'),
      value: t('Configured'),
    },
    {
      icon: ShieldCheck,
      label: t('Policy coverage'),
      value: t('Active'),
    },
    {
      icon: ChartNoAxesCombined,
      label: t('Usage visibility'),
      value: t('Ready'),
    },
  ]

  return (
    <aside
      className='border-border bg-muted/30 hidden min-w-0 px-12 pt-36 pb-12 lg:flex lg:flex-col xl:px-20'
      aria-label={t('Workspace operations preview')}
    >
      <div className='my-auto max-w-xl'>
        <p className='text-primary text-xs font-semibold tracking-[0.12em] uppercase'>
          {t('AI operations workspace')}
        </p>
        <h2 className='mt-4 text-4xl leading-tight font-semibold tracking-normal text-balance'>
          {t('Secure access to the controls behind every AI request')}
        </h2>
        <p className='text-muted-foreground mt-5 max-w-lg text-base leading-7'>
          {t(
            'Connect providers, manage access, and understand usage from one shared operating view.'
          )}
        </p>

        <div className='border-border bg-background mt-10 overflow-hidden border shadow-sm'>
          <div className='border-border flex items-center justify-between border-b px-5 py-3'>
            <span className='flex items-center gap-2 text-sm font-semibold'>
              <Activity className='text-success size-4' aria-hidden='true' />
              {t('Workspace activity')}
            </span>
            <span className='text-success font-mono text-xs'>200 OK</span>
          </div>
          <div className='border-border text-muted-foreground border-b px-5 py-4 font-mono text-xs leading-6'>
            <span className='text-success'>POST</span>{' '}
            <span className='text-foreground'>/v1/chat/completions</span>
            <br />
            <span>{t('Channel selection')}</span>{' '}
            <span className='text-foreground'>primary-model-route</span>
            <br />
            <span>{t('Usage tracked')}</span>{' '}
            <span className='text-foreground'>27 tokens</span>
          </div>
          <dl className='divide-border divide-y'>
            {rows.map((row) => {
              const Icon = row.icon
              return (
                <div
                  key={row.label}
                  className='flex items-center justify-between gap-4 px-5 py-3'
                >
                  <dt className='text-muted-foreground flex min-w-0 items-center gap-2 text-sm'>
                    <Icon className='size-4 shrink-0' aria-hidden='true' />
                    <span className='truncate'>{row.label}</span>
                  </dt>
                  <dd className='text-foreground shrink-0 text-xs font-semibold'>
                    {row.value}
                  </dd>
                </div>
              )
            })}
          </dl>
        </div>

        <p className='border-primary text-muted-foreground mt-8 max-w-md border-l-2 pl-4 text-sm leading-6'>
          {t(
            'Your sign-in protects access to credentials, channels, and billing controls.'
          )}
        </p>
      </div>
    </aside>
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
