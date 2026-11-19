// Pembangun view model halaman publik dan feed, satu per proses (ADR-007).
import { createFeedBuilder, createMediaUrlResolver, createPageBuilder } from '@framework/core'
import { useRepositories } from './database'

let pageBuilder: ReturnType<typeof createPageBuilder> | undefined
let feedBuilder: ReturnType<typeof createFeedBuilder> | undefined

export function usePageBuilder() {
  pageBuilder ??= createPageBuilder(useRepositories(), {
    mediaUrl: createMediaUrlResolver({ baseUrl: process.env['MEDIA_BASE_URL'] || '/media' }),
  })
  return pageBuilder
}

export function useFeedBuilder() {
  feedBuilder ??= createFeedBuilder(useRepositories())
  return feedBuilder
}
