import { defineCollection } from 'astro:content'
import { docsLoader } from '@astrojs/starlight/loaders'
import { docsSchema } from '@astrojs/starlight/schema'

// Single Starlight collection. sync-content.mjs populates
// src/content/docs/handbook/ from <repo>/docs/ before Astro builds.
export const collections = {
  docs: defineCollection({ loader: docsLoader(), schema: docsSchema() }),
}
