// POST: uji koneksi sumber (OAuth/API token/merchant key) tanpa menulis ledger.
import { param } from '../../../../../utils/admin-api'
import { defineRevenueHandler } from '../../../../../utils/revenue'

export default defineRevenueHandler(async ({ event, service }) => service.testConnection(param(event, 'code')))
