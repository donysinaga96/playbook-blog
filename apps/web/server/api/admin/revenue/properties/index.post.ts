// POST { code, name, domain?, siteId?, status? }: entri lama berdomain sama otomatis ditautkan.
import { readBody } from 'nuxt/server'
import { defineRevenueHandler } from '../../../../utils/revenue'

export default defineRevenueHandler(async ({ event, repos }) => repos.revenue.createProperty(await readBody(event)))
