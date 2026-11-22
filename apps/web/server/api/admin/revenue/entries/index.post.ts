// POST { sourceCode, kind: income|adjustment, reportDate, amount, currency, description, note?, propertyId?, externalId?, adjustsEntryId? }
import { readBody } from 'nuxt/server'
import { defineRevenueHandler } from '../../../../utils/revenue'

export default defineRevenueHandler(async ({ event, admin, repos }) => repos.revenue.createManualEntry(await readBody(event), admin.user.id))
