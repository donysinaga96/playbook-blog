// POST: kirim event Lynk.id contoh bertanda tangan ke handler webhook (tidak menulis ledger).
import { param } from '../../../../../utils/admin-api'
import { defineRevenueHandler } from '../../../../../utils/revenue'

export default defineRevenueHandler(async ({ event, service }) => (await service.sendTestWebhook(param(event, 'code'))).body)
