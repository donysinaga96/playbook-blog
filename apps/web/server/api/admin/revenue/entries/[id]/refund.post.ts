// POST { amount?, note }: catat refund (penuh bila amount kosong) sebagai entri negatif berstatus refunded.
import { readBody } from 'nuxt/server'
import { param } from '../../../../../utils/admin-api'
import { defineRevenueHandler } from '../../../../../utils/revenue'

export default defineRevenueHandler(async ({ event, admin, repos }) => repos.revenue.createRefund(param(event, 'id'), await readBody(event), admin.user.id))
