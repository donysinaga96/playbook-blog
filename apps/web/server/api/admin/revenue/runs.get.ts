// GET: riwayat sync semua sumber dan impor file (log operasional).
import { defineRevenueHandler } from '../../../utils/revenue'

export default defineRevenueHandler(async ({ repos }) => ({ runs: await repos.revenueQueries.listRuns(40), imports: await repos.revenueQueries.listImports(30) }))
