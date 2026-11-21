// Pembangun view model halaman publik dan feed, satu per proses (ADR-007).
import { createFeedBuilder, createMediaUrlResolver, createPageBuilder } from '@framework/core'
import { useRepositories } from './database'

let pageBuilder: ReturnType<typeof createPageBuilder> | undefined
let previewBuilder: ReturnType<typeof createPageBuilder> | undefined
let feedBuilder: ReturnType<typeof createFeedBuilder> | undefined

export function usePageBuilder() {
  pageBuilder ??= createPageBuilder(useRepositories(), {
    mediaUrl: createMediaUrlResolver({ baseUrl: process.env['MEDIA_BASE_URL'] || '/media' }),
  })
  return pageBuilder
}

/**
 * Pembangun halaman untuk pratinjau tema di admin: sama, tetapi URL media
 * lewat /admin/preview-media (route /media hanya melayani domain site).
 */
export function usePreviewPageBuilder() {
  previewBuilder ??= createPageBuilder(useRepositories(), {
    mediaUrl: createMediaUrlResolver({ baseUrl: '/admin/preview-media' }),
  })
  return previewBuilder
}

export function useFeedBuilder() {
  feedBuilder ??= createFeedBuilder(useRepositories())
  return feedBuilder
}
