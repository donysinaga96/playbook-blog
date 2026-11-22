// PUT { code, name, domain?, siteId?, status, updatedAt }
import { readBody } from 'nuxt/server'
import { param } from '../../../../utils/admin-api'
import { defineRevenueHandler } from '../../../../utils/revenue'

export default defineRevenueHandler(async ({ event, repos }) => repos.revenue.updateProperty(param(event, 'id'), await readBody(event)))
