// Komponen section base, dengan key yang sama seperti definitions.ts.
// HomeView memilih komponen dari sini berdasarkan SectionView.type.
import type { Component } from 'vue'
import type { BaseSectionType } from './definitions'
import CategoryStripSection from './CategoryStripSection.vue'
import HeadlineListSection from './HeadlineListSection.vue'
import HeroSection from './HeroSection.vue'
import LatestGridSection from './LatestGridSection.vue'

export const sectionComponents: Readonly<Record<BaseSectionType, Component>> = Object.freeze({
  hero: HeroSection,
  'latest-grid': LatestGridSection,
  'headline-list': HeadlineListSection,
  'category-strip': CategoryStripSection,
})
