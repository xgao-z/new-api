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
import { WeChatScanDialog } from '@/features/auth/components/wechat-scan-dialog'

interface WeChatBindDialogProps {
  open: boolean
  qrCodeUrl: string
  authMode?: string
  onOpenChange: (open: boolean) => void
  onSuccess: () => void
}

export function WeChatBindDialog(props: WeChatBindDialogProps) {
  return (
    <WeChatScanDialog
      open={props.open}
      onOpenChange={props.onOpenChange}
      intent='bind'
      authMode={props.authMode}
      legacyQrCodeUrl={props.qrCodeUrl}
      onBindSuccess={props.onSuccess}
    />
  )
}
