// GET: kurs ke mata uang utama + mata uang yang dipakai ledger tetapi belum punya kurs.
import { sql } from '@framework/db'
import { queryRows } from '@framework/core'
import { useDatabase } from '../../../../utils/database'
import { defineRevenueHandler } from '../../../../utils/revenue'

export default defineRevenueHandler(async ({ repos }) => {
  const [rates, missing] = await Promise.all([
    repos.revenue.listFxRates(),
    queryRows<{ currency: string; entries: number; firstDate: string }>(useDatabase(), sql`
      SELECT currency, count(*)::int AS entries, to_char(min(report_date), 'YYYY-MM-DD') AS "firstDate"
        FROM revenue_ledger_entries WHERE normalized_amount IS NULL GROUP BY currency ORDER BY currency`),
  ])
  return { baseCurrency: repos.revenue.settings.baseCurrency, rates, missing }
})
