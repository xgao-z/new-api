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

/**
 * Format a rate expressed as a fraction in [0, 1] as a percentage string.
 * Unlike `formatPercent` from `@/lib/format` (which expects a 0-100 number
 * because it divides by 100 before applying `style: 'percent'`), this takes
 * the fraction directly: 0.99 -> "99%".
 */
export function formatRate(fraction: number | null | undefined): string {
  if (fraction == null || Number.isNaN(fraction)) return '-'
  return Intl.NumberFormat(undefined, {
    style: 'percent',
    maximumFractionDigits: 2,
  }).format(fraction)
}
