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
import { Loader2, Send, Shield, UserRound, type LucideIcon } from 'lucide-react'
import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { SiGithub, SiLinux, SiWechat } from 'react-icons/si'

import { AuthLayout } from '../auth-layout'

type OAuthCallbackScreenProps = {
  provider: string
  mode: 'login' | 'bind'
}

type ProviderMeta = {
  label: string
  Icon: LucideIcon | ((props: { className?: string }) => React.JSX.Element)
}

const providerDictionary: Record<string, ProviderMeta> = {
  github: {
    label: 'GitHub',
    Icon: (props: { className?: string }) => (
      <SiGithub className={props.className} focusable='false' />
    ),
  },
  oidc: { label: 'OIDC', Icon: Shield },
  linuxdo: {
    label: 'LinuxDO',
    Icon: (props: { className?: string }) => (
      <SiLinux className={props.className} focusable='false' />
    ),
  },
  telegram: { label: 'Telegram', Icon: Send },
  wechat: {
    label: 'WeChat',
    Icon: (props: { className?: string }) => (
      <SiWechat className={props.className} focusable='false' />
    ),
  },
}

export function OAuthCallbackScreen({
  provider,
  mode,
}: OAuthCallbackScreenProps) {
  const { t } = useTranslation()
  const { label, Icon } = useMemo(() => {
    const normalized = provider?.toLowerCase() ?? ''
    return (
      providerDictionary[normalized] || {
        label: 'account',
        Icon: UserRound,
      }
    )
  }, [provider])

  const providerLabel = t(label)
  const isBindMode = mode === 'bind'

  const headline = isBindMode
    ? t('Binding your {{provider}} account', { provider: providerLabel })
    : t('Signing you in with {{provider}}', { provider: providerLabel })

  const description = isBindMode
    ? t('Hang tight while we securely link this account to your profile.')
    : t('Hang tight while we finish connecting your account.')

  const secondaryNote = isBindMode
    ? t(
        'You can close this tab once the binding completes or a success message appears in the original window.'
      )
    : t(
        "You'll be redirected automatically. You can return to the previous page if nothing happens after a few seconds."
      )

  return (
    <AuthLayout>
      <div className='w-full space-y-7'>
        <div className='flex flex-col items-center space-y-4 text-center'>
          <div className='bg-primary/10 text-primary ring-primary/15 flex size-16 items-center justify-center rounded-2xl ring-1'>
            <Icon className='size-8' aria-hidden='true' />
          </div>
          <div className='space-y-1.5'>
            <h1 className='text-2xl font-semibold tracking-tight'>{headline}</h1>
            <p className='text-muted-foreground text-sm leading-relaxed'>
              {description}
            </p>
          </div>
        </div>

        <div className='space-y-3 text-center'>
          <div className='bg-muted/40 text-foreground/90 inline-flex items-center justify-center gap-2 rounded-full px-3 py-1.5 text-sm font-medium'>
            <Loader2 className='size-4 animate-spin' aria-hidden='true' />
            <span>{t('Processing OAuth response...')}</span>
          </div>
          <p className='text-muted-foreground text-sm leading-relaxed'>
            {secondaryNote}
          </p>
          <p className='text-muted-foreground text-xs leading-relaxed'>
            {t(
              'This may take a few moments while we validate the request and update your session.'
            )}
          </p>
        </div>
      </div>
    </AuthLayout>
  )
}
