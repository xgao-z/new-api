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
import { motion, useReducedMotion } from 'motion/react'
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
        <AuthVisualPanel brandName={systemName || 'Confluia'} />
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

type AuthVisualPanelProps = {
  brandName: string
}

function AuthVisualPanel(props: AuthVisualPanelProps) {
  const { t } = useTranslation()
  const reduceMotion = useReducedMotion()

  return (
    <aside
      className='relative hidden min-w-0 overflow-hidden lg:flex lg:flex-col'
      aria-label={t('Confluia brand introduction')}
    >
      <div
        aria-hidden='true'
        className='pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_70%_55%_at_30%_35%,color-mix(in_oklab,var(--primary)_22%,transparent),transparent_70%),radial-gradient(ellipse_55%_45%_at_75%_70%,color-mix(in_oklab,var(--primary)_14%,transparent),transparent_72%)]'
      />
      <div
        aria-hidden='true'
        className='pointer-events-none absolute inset-0 bg-[linear-gradient(to_right,color-mix(in_oklab,var(--border)_55%,transparent)_1px,transparent_1px),linear-gradient(to_bottom,color-mix(in_oklab,var(--border)_55%,transparent)_1px,transparent_1px)] [mask-image:radial-gradient(ellipse_70%_60%_at_45%_45%,black_20%,transparent_85%)] bg-[size:2.5rem_2.5rem] opacity-40'
      />

      <div className='relative flex flex-1 flex-col items-center justify-center px-10 py-28 xl:px-16'>
        <ConfluenceVisual reduceMotion={Boolean(reduceMotion)} />

        <motion.div
          className='mt-10 max-w-md text-center'
          initial={reduceMotion ? false : { opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.55, delay: 0.15, ease: [0.33, 1, 0.68, 1] }}
        >
          <p className='text-3xl font-semibold tracking-tight xl:text-4xl'>
            {props.brandName}
          </p>
          <p className='text-muted-foreground mt-3 text-sm tracking-[0.18em] uppercase'>
            {t('Converge. Create. Control.')}
          </p>
        </motion.div>
      </div>
    </aside>
  )
}

type ConfluenceVisualProps = {
  reduceMotion: boolean
}

function ConfluenceVisual(props: ConfluenceVisualProps) {
  const orbitDuration = props.reduceMotion ? 0 : 18
  const flowDuration = props.reduceMotion ? 0 : 6

  return (
    <div
      aria-hidden='true'
      className='relative flex size-[min(28rem,52vw)] items-center justify-center'
    >
      {/* Soft ambient bloom */}
      <div className='bg-primary/15 absolute size-[78%] rounded-full blur-3xl' />
      <div className='bg-primary/10 absolute size-[58%] rounded-full blur-2xl' />

      {/* Outer ring */}
      <motion.div
        className='border-border/60 absolute size-[92%] rounded-full border'
        animate={
          props.reduceMotion
            ? undefined
            : { rotate: 360, scale: [1, 1.015, 1] }
        }
        transition={
          props.reduceMotion
            ? undefined
            : {
                rotate: { duration: orbitDuration, ease: 'linear', repeat: Infinity },
                scale: { duration: 8, ease: 'easeInOut', repeat: Infinity },
              }
        }
      />

      {/* Mid ring */}
      <motion.div
        className='border-primary/25 absolute size-[68%] rounded-full border border-dashed'
        animate={props.reduceMotion ? undefined : { rotate: -360 }}
        transition={
          props.reduceMotion
            ? undefined
            : { duration: orbitDuration * 1.25, ease: 'linear', repeat: Infinity }
        }
      />

      {/* Flowing confluence paths */}
      <svg
        viewBox='0 0 360 360'
        className='absolute inset-[8%] size-[84%]'
        fill='none'
      >
        <defs>
          <linearGradient id='auth-flow-a' x1='0%' y1='0%' x2='100%' y2='100%'>
            <stop offset='0%' stopColor='var(--primary)' stopOpacity='0' />
            <stop offset='45%' stopColor='var(--primary)' stopOpacity='0.7' />
            <stop offset='100%' stopColor='var(--primary)' stopOpacity='0' />
          </linearGradient>
          <linearGradient id='auth-flow-b' x1='100%' y1='0%' x2='0%' y2='100%'>
            <stop offset='0%' stopColor='var(--primary)' stopOpacity='0' />
            <stop offset='50%' stopColor='var(--primary)' stopOpacity='0.55' />
            <stop offset='100%' stopColor='var(--primary)' stopOpacity='0' />
          </linearGradient>
          <linearGradient id='auth-flow-c' x1='50%' y1='100%' x2='50%' y2='0%'>
            <stop offset='0%' stopColor='var(--primary)' stopOpacity='0' />
            <stop offset='45%' stopColor='var(--primary)' stopOpacity='0.6' />
            <stop offset='100%' stopColor='var(--primary)' stopOpacity='0' />
          </linearGradient>
        </defs>

        <motion.path
          d='M36 78 C 96 96, 126 150, 180 180 C 234 210, 264 246, 324 282'
          stroke='url(#auth-flow-a)'
          strokeWidth='1.6'
          strokeLinecap='round'
          initial={false}
          animate={
            props.reduceMotion
              ? { pathLength: 1, opacity: 0.7 }
              : { pathLength: [0.15, 1, 0.15], opacity: [0.25, 0.9, 0.25] }
          }
          transition={
            props.reduceMotion
              ? undefined
              : { duration: flowDuration, ease: 'easeInOut', repeat: Infinity }
          }
        />
        <motion.path
          d='M318 72 C 258 102, 228 144, 180 180 C 132 216, 102 252, 42 288'
          stroke='url(#auth-flow-b)'
          strokeWidth='1.6'
          strokeLinecap='round'
          initial={false}
          animate={
            props.reduceMotion
              ? { pathLength: 1, opacity: 0.65 }
              : { pathLength: [0.2, 1, 0.2], opacity: [0.2, 0.85, 0.2] }
          }
          transition={
            props.reduceMotion
              ? undefined
              : {
                  duration: flowDuration + 1.2,
                  ease: 'easeInOut',
                  repeat: Infinity,
                  delay: 0.5,
                }
          }
        />
        <motion.path
          d='M180 28 C 180 88, 180 132, 180 180 C 180 228, 180 272, 180 332'
          stroke='url(#auth-flow-c)'
          strokeWidth='1.4'
          strokeLinecap='round'
          initial={false}
          animate={
            props.reduceMotion
              ? { pathLength: 1, opacity: 0.55 }
              : { pathLength: [0.1, 1, 0.1], opacity: [0.15, 0.75, 0.15] }
          }
          transition={
            props.reduceMotion
              ? undefined
              : {
                  duration: flowDuration + 0.8,
                  ease: 'easeInOut',
                  repeat: Infinity,
                  delay: 0.9,
                }
          }
        />
      </svg>

      {/* Orbiting nodes */}
      {[
        { top: '12%', left: '52%', size: 'size-2.5', delay: 0 },
        { top: '28%', left: '18%', size: 'size-2', delay: 0.4 },
        { top: '62%', left: '14%', size: 'size-2.5', delay: 0.8 },
        { top: '78%', left: '48%', size: 'size-2', delay: 1.2 },
        { top: '58%', left: '82%', size: 'size-2.5', delay: 1.6 },
        { top: '24%', left: '78%', size: 'size-2', delay: 2 },
      ].map((node) => (
        <motion.span
          key={`${node.top}-${node.left}`}
          className={cn(
            'bg-primary absolute rounded-full shadow-[0_0_18px_color-mix(in_oklab,var(--primary)_55%,transparent)]',
            node.size
          )}
          style={{ top: node.top, left: node.left }}
          animate={
            props.reduceMotion
              ? undefined
              : { opacity: [0.35, 1, 0.35], scale: [0.85, 1.15, 0.85] }
          }
          transition={
            props.reduceMotion
              ? undefined
              : {
                  duration: 3.6,
                  ease: 'easeInOut',
                  repeat: Infinity,
                  delay: node.delay,
                }
          }
        />
      ))}

      {/* Core mark */}
      <motion.div
        className='border-border/70 bg-background/80 relative z-10 flex size-28 items-center justify-center rounded-full border shadow-[0_20px_60px_-28px_color-mix(in_oklab,var(--primary)_65%,transparent)] backdrop-blur-md'
        animate={
          props.reduceMotion
            ? undefined
            : { scale: [1, 1.04, 1], boxShadow: [
                '0 20px 60px -28px color-mix(in oklab, var(--primary) 45%, transparent)',
                '0 24px 70px -24px color-mix(in oklab, var(--primary) 70%, transparent)',
                '0 20px 60px -28px color-mix(in oklab, var(--primary) 45%, transparent)',
              ] }
        }
        transition={
          props.reduceMotion
            ? undefined
            : { duration: 4.8, ease: 'easeInOut', repeat: Infinity }
        }
      >
        <div className='bg-primary/12 absolute inset-3 rounded-full' />
        <div className='bg-primary/20 absolute inset-7 rounded-full blur-md' />
        <div className='from-primary via-primary/70 to-primary/30 relative size-10 rounded-full bg-linear-to-br shadow-[0_0_24px_color-mix(in_oklab,var(--primary)_50%,transparent)]' />
      </motion.div>
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
