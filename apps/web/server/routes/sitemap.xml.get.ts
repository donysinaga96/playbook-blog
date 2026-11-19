// GET /sitemap.xml: semua URL publik site ini (ADR-006).
import { defineEventHandler } from 'nuxt/server'
import { feedResponse } from '../utils/feed-response'
import { useFeedBuilder } from '../utils/pages'

export default defineEventHandler((event) =>
  feedResponse(event, 'application/xml; charset=utf-8', (site, origin) => useFeedBuilder().sitemap(site, origin)))
