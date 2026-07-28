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
import { Eye, EyeOff } from 'lucide-react'
import * as React from 'react'

import { cn } from '@/lib/utils'

import { Button } from './ui/button'
import { Input } from './ui/input'

type PasswordInputProps = Omit<
  React.InputHTMLAttributes<HTMLInputElement>,
  'type'
> & {
  ref?: React.Ref<HTMLInputElement>
  startAdornment?: React.ReactNode
}

export function PasswordInput({
  className,
  disabled,
  ref,
  startAdornment,
  ...props
}: PasswordInputProps) {
  const [showPassword, setShowPassword] = React.useState(false)

  return (
    <div className='relative'>
      {startAdornment && (
        <span className='text-muted-foreground pointer-events-none absolute top-1/2 left-3 z-10 flex size-4 -translate-y-1/2 items-center justify-center'>
          {startAdornment}
        </span>
      )}
      <Input
        type={showPassword ? 'text' : 'password'}
        ref={ref}
        disabled={disabled}
        className={cn(className, startAdornment && 'ps-9 pe-9')}
        {...props}
      />
      <Button
        type='button'
        size='icon'
        variant='ghost'
        disabled={disabled}
        className='text-muted-foreground absolute end-1 top-1/2 h-6 w-6 -translate-y-1/2 rounded-md'
        onClick={() => setShowPassword((prev) => !prev)}
        aria-label='Toggle password visibility'
      >
        {showPassword ? (
          <Eye size={18} aria-hidden='true' />
        ) : (
          <EyeOff size={18} aria-hidden='true' />
        )}
      </Button>
    </div>
  )
}
