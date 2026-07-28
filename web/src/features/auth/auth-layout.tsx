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

import { Skeleton } from '@/components/ui/skeleton'
import { useSystemConfig } from '@/hooks/use-system-config'

type AuthLayoutProps = {
  children: React.ReactNode
}

export function AuthLayout({ children }: AuthLayoutProps) {
  const { systemName, logo, loading } = useSystemConfig()

  return (
    <div className='bg-muted/30 min-h-svh max-w-none'>
      <header className='absolute top-5 left-5 z-10 sm:top-8 sm:left-8'>
        <BrandLink loading={loading} logo={logo} systemName={systemName} />
      </header>
      <main className='flex min-h-svh items-center justify-center overflow-y-auto px-5 py-24 sm:px-8'>
        <div className='w-full max-w-md'>{children}</div>
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
            className='size-9 rounded-lg object-cover shadow-sm'
          />
        )}
      </div>
      {props.loading ? (
        <Skeleton className='h-5 w-28' />
      ) : (
        <span className='flex items-center gap-1.5 text-lg font-semibold'>
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
