// GET /rss.xml: artikel terbaru site ini (RSS 2.0).
import { defineEventHandler } from 'nuxt/server'
import { feedResponse } from '../utils/feed-response'
import { useFeedBuilder } from '../utils/pages'

export default defineEventHandler((event) =>
  feedResponse(event, 'application/rss+xml; charset=utf-8', (site, origin) => useFeedBuilder().rss(site, origin)))
