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
import { Loader2 } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { Dialog } from '@/components/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  createWeChatQRCode,
  getWeChatQRStatus,
  wechatLoginByCode,
  wechatQRBind,
  wechatQRLogin,
  type WeChatQRIntent,
} from '@/features/auth/api'
import { isAuthBundle } from '@/lib/api'
import { getServerErrorMessageKey } from '@/lib/server-error-message'
import type { AuthBundle } from '@/stores/auth-store'

type WeChatScanDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  intent?: WeChatQRIntent
  /** native | legacy | empty */
  authMode?: string
  /** Static account QR used by legacy verification-code flow */
  legacyQrCodeUrl?: string
  title?: string
  disabled?: boolean
  onLoginSuccess?: (bundle: AuthBundle) => void | Promise<void>
  onBindSuccess?: () => void | Promise<void>
}

const POLL_INTERVAL_MS = 1500

export function WeChatScanDialog(props: WeChatScanDialogProps) {
  const { t } = useTranslation()
  const intent = props.intent ?? 'login'
  // Prefer native Official Account scan login unless explicitly on legacy mode.
  const isNative = props.authMode !== 'legacy'
  const onOpenChange = props.onOpenChange
  const onLoginSuccess = props.onLoginSuccess
  const onBindSuccess = props.onBindSuccess
  const [wechatCode, setWeChatCode] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [loadingQr, setLoadingQr] = useState(false)
  const [scene, setScene] = useState('')
  const [qrCodeUrl, setQrCodeUrl] = useState('')
  const [statusText, setStatusText] = useState('')
  const [expired, setExpired] = useState(false)
  const submittingRef = useRef(false)
  const finishingRef = useRef(false)

  useEffect(() => {
    submittingRef.current = submitting
  }, [submitting])

  const resetState = useCallback(() => {
    setWeChatCode('')
    setSubmitting(false)
    setLoadingQr(false)
    setScene('')
    setQrCodeUrl('')
    setStatusText('')
    setExpired(false)
    finishingRef.current = false
  }, [])

  const handleOpenChange = useCallback(
    (open: boolean) => {
      if (submittingRef.current) return
      if (!open) resetState()
      onOpenChange(open)
    },
    [onOpenChange, resetState]
  )

  const finishNativeLogin = useCallback(
    async (currentScene: string) => {
      if (finishingRef.current) return
      finishingRef.current = true
      setSubmitting(true)
      try {
        if (intent === 'bind') {
          const res = await wechatQRBind(currentScene)
          if (!res?.success) {
            if (getServerErrorMessageKey(res)) return
            toast.error(res?.message || t('Request failed'))
            finishingRef.current = false
            return
          }
          toast.success(t('Binding successful!'))
          handleOpenChange(false)
          await onBindSuccess?.()
          return
        }

        const res = await wechatQRLogin(currentScene)
        if (res?.success && isAuthBundle(res.data)) {
          toast.success(t('Signed in via WeChat'))
          handleOpenChange(false)
          await onLoginSuccess?.(res.data)
          return
        }
        if (getServerErrorMessageKey(res)) return
        toast.error(res?.message || t('Login failed'))
        finishingRef.current = false
      } catch (error: unknown) {
        if (getServerErrorMessageKey(error)) return
        toast.error(intent === 'bind' ? t('Request failed') : t('Login failed'))
        finishingRef.current = false
      } finally {
        setSubmitting(false)
      }
    },
    [handleOpenChange, intent, onBindSuccess, onLoginSuccess, t]
  )

  const startNativeSession = useCallback(async () => {
    setLoadingQr(true)
    setExpired(false)
    setStatusText(t('Generating QR code...'))
    setScene('')
    setQrCodeUrl('')
    finishingRef.current = false
    try {
      const res = await createWeChatQRCode(intent)
      if (!res?.success || !res.data?.scene || !res.data?.qrcode_url) {
        if (getServerErrorMessageKey(res)) return
        toast.error(res?.message || t('Failed to create WeChat QR code'))
        setStatusText(t('Failed to create WeChat QR code'))
        setExpired(true)
        return
      }
      setScene(res.data.scene)
      setQrCodeUrl(res.data.qrcode_url)
      setStatusText(
        t(
          'Scan the QR code with WeChat to follow the official account and sign in'
        )
      )
    } catch (error: unknown) {
      if (getServerErrorMessageKey(error)) return
      toast.error(t('Failed to create WeChat QR code'))
      setStatusText(t('Failed to create WeChat QR code'))
      setExpired(true)
    } finally {
      setLoadingQr(false)
    }
  }, [intent, t])

  useEffect(() => {
    if (!props.open) return
    if (!isNative) return
    void startNativeSession()
  }, [props.open, isNative, startNativeSession])

  useEffect(() => {
    if (!props.open || !isNative || !scene || expired || submitting) return

    let cancelled = false

    const poll = async () => {
      if (cancelled || finishingRef.current) return
      try {
        const res = await getWeChatQRStatus(scene)
        if (cancelled) return
        if (!res?.success || !res.data) {
          if (res?.message) {
            setStatusText(res.message)
          }
          if (
            res?.message?.includes('过期') ||
            res?.message?.toLowerCase().includes('expired')
          ) {
            setExpired(true)
          }
          return
        }
        if (res.data.status === 'confirmed') {
          setStatusText(t('Scan confirmed. Signing you in...'))
          await finishNativeLogin(scene)
          return
        }
        if (res.data.status === 'expired' || res.data.status === 'consumed') {
          setExpired(true)
          setStatusText(t('QR code expired. Please refresh and try again.'))
          return
        }
        if (res.data.message) {
          setStatusText(res.data.message)
        }
      } catch {
        // Ignore transient poll errors; next tick retries.
      }
    }

    void poll()
    const timer = window.setInterval(() => {
      void poll()
    }, POLL_INTERVAL_MS)

    return () => {
      cancelled = true
      window.clearInterval(timer)
    }
  }, [
    props.open,
    isNative,
    scene,
    expired,
    submitting,
    finishNativeLogin,
    t,
  ])

  async function handleLegacySubmit() {
    if (!wechatCode.trim()) {
      toast.error(t('Please enter the verification code'))
      return
    }
    if (props.disabled) return

    setSubmitting(true)
    try {
      if (intent === 'bind') {
        const { bindWeChat } = await import('@/features/profile/api')
        const res = await bindWeChat(wechatCode.trim())
        if (!res?.success) {
          toast.error(res?.message || t('Request failed'))
          return
        }
        toast.success(t('Binding successful!'))
        handleOpenChange(false)
        await onBindSuccess?.()
        return
      }

      const res = await wechatLoginByCode(wechatCode.trim())
      if (res?.success && isAuthBundle(res.data)) {
        toast.success(t('Signed in via WeChat'))
        handleOpenChange(false)
        await onLoginSuccess?.(res.data)
        return
      }
      if (getServerErrorMessageKey(res)) return
      toast.error(res?.message || t('Login failed'))
    } catch (error: unknown) {
      if (getServerErrorMessageKey(error)) return
      toast.error(intent === 'bind' ? t('Request failed') : t('Login failed'))
    } finally {
      setSubmitting(false)
    }
  }

  const title =
    props.title ||
    (intent === 'bind' ? t('Bind WeChat Account') : t('WeChat sign in'))

  const description = isNative
    ? t(
        'Scan the QR code with WeChat. After following the official account, sign-in will complete automatically.'
      )
    : t(
        'Scan the QR code to follow the official account and reply with “验证码” to receive your verification code.'
      )

  const displayQr = isNative ? qrCodeUrl : props.legacyQrCodeUrl || ''

  let qrContent
  if (loadingQr && !displayQr) {
    qrContent = (
      <div className='text-muted-foreground flex items-center justify-center gap-2 py-10 text-sm'>
        <Loader2 className='h-4 w-4 animate-spin' />
        {t('Generating QR code...')}
      </div>
    )
  } else if (displayQr) {
    qrContent = (
      <div className='flex justify-center'>
        <img
          src={displayQr}
          alt={t('WeChat login QR code')}
          className='h-40 w-40 rounded-md border object-contain'
        />
      </div>
    )
  } else {
    qrContent = (
      <p className='text-muted-foreground text-sm'>
        {isNative
          ? t('Failed to create WeChat QR code')
          : t('QR code is not configured. Please contact support.')}
      </p>
    )
  }

  const footer = isNative ? (
    <>
      <Button
        type='button'
        variant='outline'
        onClick={() => handleOpenChange(false)}
        disabled={submitting}
      >
        {t('Cancel')}
      </Button>
      <Button
        type='button'
        onClick={() => void startNativeSession()}
        disabled={submitting || loadingQr || props.disabled}
        className='gap-2'
      >
        {loadingQr ? <Loader2 className='h-4 w-4 animate-spin' /> : null}
        {t('Refresh QR code')}
      </Button>
    </>
  ) : (
    <>
      <Button
        type='button'
        variant='outline'
        onClick={() => handleOpenChange(false)}
        disabled={submitting}
      >
        {t('Cancel')}
      </Button>
      <Button
        type='button'
        onClick={() => void handleLegacySubmit()}
        disabled={submitting || !wechatCode.trim() || Boolean(props.disabled)}
        className='gap-2'
      >
        {submitting ? <Loader2 className='h-4 w-4 animate-spin' /> : null}
        {intent === 'bind' ? t('Bind') : t('Confirm')}
      </Button>
    </>
  )

  return (
    <Dialog
      open={props.open}
      onOpenChange={handleOpenChange}
      title={title}
      description={description}
      contentClassName='max-w-sm'
      headerClassName='text-left'
      contentHeight='auto'
      bodyClassName='space-y-4'
      footer={footer}
    >
      {qrContent}

      {isNative ? (
        <p className='text-muted-foreground text-center text-sm'>
          {statusText ||
            t(
              'Scan the QR code with WeChat to follow the official account and sign in'
            )}
        </p>
      ) : (
        <div className='grid gap-2'>
          <Label htmlFor='wechat-code'>{t('Verification code')}</Label>
          <Input
            id='wechat-code'
            placeholder={t('Enter the verification code')}
            value={wechatCode}
            onChange={(event) => setWeChatCode(event.target.value)}
            autoComplete='one-time-code'
            disabled={submitting}
          />
        </div>
      )}
    </Dialog>
  )
}
