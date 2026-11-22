// GET: situs penghasil pendapatan + site framework yang bisa ditautkan.
import { defineRevenueHandler } from '../../../../utils/revenue'

export default defineRevenueHandler(async ({ admin, repos }) => ({ properties: await repos.revenue.listProperties(), sites: admin.sites.map((s) => ({ id: s.id, code: s.code, name: s.name })) }))
