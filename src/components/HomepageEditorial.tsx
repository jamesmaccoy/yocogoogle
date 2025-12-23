'use client'

import React from 'react'
import { motion } from 'framer-motion'
import { LuxuryCard } from './ui/LuxuryCard'
import { EditorialSection } from './EditorialSection'
import { CinematicSection } from './CinematicSection'
import { LuxuryButton } from './ui/LuxuryButton'
import type { Post } from '@/payload-types'

interface HomepageEditorialProps {
  featuredPosts?: Post[]
}

export function HomepageEditorial({ featuredPosts = [] }: HomepageEditorialProps) {
  // Get first 3 posts for featured section
  const featured = featuredPosts.slice(0, 3)

  return (
    <main className="bg-[#faf9f7] min-h-screen w-full overflow-x-hidden">
      {/* Intro Text Section */}
      <section className="py-24 px-6 md:px-12 text-center bg-[#faf9f7]">
        <motion.div
          initial={{
            opacity: 0,
            y: 20,
          }}
          whileInView={{
            opacity: 1,
            y: 0,
          }}
          viewport={{
            once: true,
          }}
          transition={{
            duration: 0.8,
          }}
          className="max-w-4xl mx-auto"
        >
          <h2 className="font-serif-display text-4xl md:text-6xl text-[#0a0a0a] leading-tight mb-8">
            Curated sanctuaries for the{' '}
            <span className="italic font-serif-text text-secondary">
              modern traveler
            </span>{' '}
            seeking solace and style.
          </h2>
        </motion.div>
      </section>

      {/* Featured Collection Grid */}
      {featured.length > 0 && (
        <section className="px-6 md:px-12 pb-24 bg-[#faf9f7]">
          <div className="flex justify-between items-end mb-12 border-b border-[#e5e5e5] pb-6">
            <h3 className="font-serif-display text-3xl text-[#0a0a0a]">
              Featured Collections
            </h3>
            <LuxuryButton
              href="/posts/page/1"
              variant="text"
              className="hidden md:block"
            >
              View All
            </LuxuryButton>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8 md:gap-12">
            {featured.map((post, index) => {
              const { slug, categories, meta, title } = post
              const { description, image: metaImage } = meta || {}
              
              const categoryTitles = categories
                ?.filter((cat): cat is NonNullable<typeof cat> => 
                  typeof cat === 'object' && cat !== null && 'title' in cat
                )
                .map((cat) => cat.title)
                .filter(Boolean) || []
              
              const subtitle = categoryTitles.length > 0 ? categoryTitles[0] : undefined
              const tags = categoryTitles.length > 1 
                ? categoryTitles.slice(1).join(' • ') 
                : undefined

              const href = `/posts/${slug}`

              return (
                <LuxuryCard
                  key={slug || index}
                  image={metaImage}
                  title={title || 'Untitled'}
                  subtitle={subtitle}
                  description={description || undefined}
                  tags={tags}
                  href={href}
                  delay={index * 0.1}
                  layoutId={slug || undefined}
                />
              )
            })}
          </div>
        </section>
      )}

      {/* Cinematic Image Section */}
      <CinematicSection
        image={featured[0]?.meta?.image || featured[0]?.heroImage}
        title="Unforgettable Moments"
        subtitle="Experience"
        ctaText="Discover Our Story"
        ctaLink="/about"
      />

      {/* Editorial Sections */}
      <EditorialSection
        image={featured[1]?.meta?.image || featured[1]?.heroImage}
        title="Southern Peninsula Escapes"
        subtitle="Cape Point • Hout Bay • Kommetjie"
        description="Discover the raw beauty of the Southern Peninsula. From the dramatic cliffs of Cape Point to the serene beaches of Kommetjie, experience a coastal lifestyle unlike any other."
        ctaText="Explore the Peninsula"
        ctaLink="/posts/page/1"
        align="left"
      />

      <EditorialSection
        image={featured[2]?.meta?.image || featured[2]?.heroImage}
        title="City Centre & Suburbs"
        subtitle="Gardens • Vredehoek • Rondebosch"
        description="Immerse yourself in the vibrant culture of Cape Town. Stay in the heart of the city, surrounded by world-class dining, art, and history, all within reach of the mountain."
        ctaText="View City Stays"
        ctaLink="/posts/page/1"
        align="right"
      />
    </main>
  )
}

