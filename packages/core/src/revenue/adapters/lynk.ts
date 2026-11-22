// Adapter webhook Lynk.id (push). Kontrak dari dokumentasi resmi "Lynk
// Webhook" (Postman, dibaca 22 Nov 2026):
//   - POST application/json, satu event: payment.received
//   - header X-Lynk-Signature = sha256_hex(amount + refId + message_id + merchantKey)
//     dengan amount = data.message_data.totals.grandTotal (nominal bersih
//     yang diterima penjual, IDR) sebagai teks
//   - tidak ada event refund/pembatalan; refund dicatat manual di admin
//
// Idempotensi: kunci = lynk:<refId>:sale. Pengiriman ulang event yang sama
// (atau message_id berbeda untuk order yang sama) tidak menggandakan saldo.
import { createHash, timingSafeEqual } from 'node:crypto'
import { z } from 'zod'
import { dateInZone, zonedLocalToDate } from '../dates'
import { toDecimal } from '../decimal'
import type { LedgerInput } from '../types'

export const LYNK_SIGNATURE_HEADER = 'x-lynk-signature'
export const LYNK_EVENT_PAYMENT = 'payment.received'

const amount = z.union([z.number(), z.string().regex(/^-?\d+(\.\d+)?$/)])

const itemSchema = z.looseObject({
  title: z.string().optional(),
  qty: z.number().optional(),
  price: z.union([z.number(), z.string()]).optional(),
  uuid: z.string().optional(),
})

export const lynkPayloadSchema = z.looseObject({
  event: z.string().min(1),
  data: z.looseObject({
    message_action: z.string().optional(),
    message_code: z.string().optional(),
    message_id: z.string().min(1).max(200),
    message_data: z.looseObject({
      refId: z.string().min(1).max(200),
      createdAt: z.string().optional(),
      items: z.array(itemSchema).optional(),
      totals: z.looseObject({
        grandTotal: amount,
        totalPrice: amount.optional(),
        totalAddon: amount.optional(),
        totalItem: z.number().optional(),
        convenienceFee: amount.optional(),
        discount: amount.optional(),
        affiliate: amount.optional(),
        totalShipping: amount.optional(),
      }),
    }),
  }),
})

export type LynkPayload = z.infer<typeof lynkPayloadSchema>

/** Teks amount untuk tanda tangan: grandTotal apa adanya seperti di JSON (72000 -> "72000"). */
function amountText(value: number | string): string {
  return typeof value === 'number' ? String(value) : value
}

export function lynkSignature(payload: LynkPayload, merchantKey: string): string {
  const data = payload.data
  const text = amountText(data.message_data.totals.grandTotal) + data.message_data.refId + data.message_id + merchantKey
  return createHash('sha256').update(text, 'utf8').digest('hex')
}

/** Bandingkan tanda tangan dengan waktu konstan; header kosong/salah format = tidak sah. */
export function verifyLynkSignature(payload: LynkPayload, header: string | null | undefined, merchantKey: string): boolean {
  if (!header || !merchantKey) return false
  const received = header.trim().toLowerCase()
  if (!/^[0-9a-f]{64}$/.test(received)) return false
  return timingSafeEqual(Buffer.from(received, 'hex'), Buffer.from(lynkSignature(payload, merchantKey), 'hex'))
}

export type LynkParseResult =
  | { kind: 'invalid'; error: string }
  | { kind: 'ok'; payload: LynkPayload }

/** Body mentah -> payload tervalidasi (bentuk saja; tanda tangan diperiksa terpisah). */
export function parseLynkBody(raw: string): LynkParseResult {
  let json: unknown
  try {
    json = JSON.parse(raw)
  } catch {
    return { kind: 'invalid', error: 'body bukan JSON' }
  }
  const parsed = lynkPayloadSchema.safeParse(json)
  if (!parsed.success) {
    const issue = parsed.error.issues[0]
    return { kind: 'invalid', error: `payload tidak sesuai: ${issue?.path.join('.') ?? ''} ${issue?.message ?? ''}`.trim() }
  }
  return { kind: 'ok', payload: parsed.data }
}

export type LynkLedgerResult =
  | { kind: 'entry'; entry: LedgerInput }
  | { kind: 'ignored'; reason: string }

const num = (v: number | string | undefined): number | undefined => (v === undefined ? undefined : Number(v))

/**
 * Event -> entri ledger. Event selain payment.received, atau
 * message_action selain SUCCESS, diabaikan (dicatat, tidak masuk ledger).
 */
export function lynkToLedger(payload: LynkPayload, options: { timeZone: string; now: Date }): LynkLedgerResult {
  if (payload.event !== LYNK_EVENT_PAYMENT) return { kind: 'ignored', reason: `event ${payload.event} tidak dipakai` }
  const data = payload.data
  if (data.message_action && data.message_action.toUpperCase() !== 'SUCCESS') {
    return { kind: 'ignored', reason: `message_action ${data.message_action}` }
  }
  const order = data.message_data
  const occurredAt = (order.createdAt ? zonedLocalToDate(order.createdAt, options.timeZone) : null) ?? options.now
  const items = order.items ?? []
  const titles = items.map((i) => i.title).filter((t): t is string => Boolean(t))
  const totals = order.totals
  const metrics: Record<string, number> = { orders: 1 }
  const put = (key: string, value: number | undefined) => {
    if (value !== undefined && Number.isFinite(value)) metrics[key] = value
  }
  put('items', totals.totalItem ?? items.reduce((n, i) => n + (i.qty ?? 1), 0))
  put('totalPrice', num(totals.totalPrice))
  put('totalAddon', num(totals.totalAddon))
  put('convenienceFee', num(totals.convenienceFee))
  put('discount', num(totals.discount))
  put('affiliate', num(totals.affiliate))
  put('shipping', num(totals.totalShipping))

  return {
    kind: 'entry',
    entry: {
      idempotencyKey: `lynk:${order.refId}:sale`,
      externalId: order.refId,
      occurredAt,
      reportDate: dateInZone(occurredAt, options.timeZone),
      grossAmount: toDecimal(totals.grandTotal),
      currency: 'IDR',
      status: 'finalized',
      metrics,
      dimensions: titles[0] ? { product: titles[0].slice(0, 200) } : {},
      description: titles.length ? titles.join(', ').slice(0, 500) : `Order ${order.refId}`,
      rawPayload: payload,
    },
  }
}

/** Contoh event untuk tombol uji di admin dan data contoh; bentuk sama dengan dokumentasi. */
export function sampleLynkPayload(input: { refId: string; messageId: string; grandTotal: number; title: string; price: number; createdAt: string; customerName?: string }): LynkPayload {
  return {
    event: LYNK_EVENT_PAYMENT,
    data: {
      message_action: 'SUCCESS',
      message_code: '0',
      message_id: input.messageId,
      message_desc: '',
      message_title: '',
      message_data: {
        createdAt: input.createdAt,
        customer: { email: 'pembeli@contoh.test', name: input.customerName ?? 'Pembeli Contoh', phone: '080000000000' },
        items: [{ addons: [], appointment_data: {}, pafId: '', price: input.price, public_affiliate_content: {}, qty: 1, stock: 1, title: input.title, uuid: `item-${input.refId}` }],
        refId: input.refId,
        shippingAddress: '',
        shippingInfo: '',
        totals: {
          affiliate: 0,
          convenienceFee: input.grandTotal - input.price,
          discount: 0,
          grandTotal: input.grandTotal,
          totalAddon: 0,
          totalItem: 1,
          totalPrice: input.price,
          totalShipping: 0,
        },
      },
    },
  }
}
