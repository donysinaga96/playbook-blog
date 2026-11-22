// GET: satu entri ledger + riwayat revisi + koreksi/refund yang merujuknya.
import { param } from '../../../../utils/admin-api'
import { defineRevenueHandler } from '../../../../utils/revenue'

export default defineRevenueHandler(async ({ event, repos }) => repos.revenueQueries.getEntry(param(event, 'id')))
