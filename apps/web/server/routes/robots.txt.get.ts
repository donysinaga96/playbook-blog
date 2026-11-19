// GET /robots.txt: aturan crawler + lokasi sitemap site ini.
import { renderRobots } from '@framework/core'
import { defineEventHandler } from 'nuxt/server'
import { feedResponse } from '../utils/feed-response'

export default defineEventHandler((event) =>
  feedResponse(event, 'text/plain; charset=utf-8', (_site, origin) => renderRobots(origin)))
