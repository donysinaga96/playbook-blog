// POST { code, name, connector: generic|headless, integrationType, defaultCurrency }: sumber lain (impor file/manual/headless).
import { readBody } from 'nuxt/server'
import { defineRevenueHandler } from '../../../../utils/revenue'

export default defineRevenueHandler(async ({ event, repos }) => repos.revenue.createSource(await readBody(event)))
