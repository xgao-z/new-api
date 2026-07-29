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
import type { LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'

import { cn } from '@/lib/utils'

type AuthPageHeaderProps = {
  icon: LucideIcon
  title: string
  description?: ReactNode
  className?: string
}

export function AuthPageHeader(props: AuthPageHeaderProps) {
  const Icon = props.icon

  return (
    <div className={cn('space-y-4', props.className)}>
      <div className='flex items-center gap-3'>
        <div className='bg-primary/10 text-primary ring-primary/15 flex size-10 items-center justify-center rounded-lg ring-1'>
          <Icon className='size-[1.125rem]' aria-hidden='true' />
        </div>
        <span className='text-muted-foreground text-xs font-semibold tracking-[0.12em] uppercase'>
          {props.title}
        </span>
      </div>
      <div className='space-y-2'>
        <h1 className='text-2xl leading-tight font-semibold tracking-normal'>
          {props.title}
        </h1>
        {props.description ? (
          <div className='text-muted-foreground text-sm leading-6'>
            {props.description}
          </div>
        ) : null}
      </div>
    </div>
  )
}
