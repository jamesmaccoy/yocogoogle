'use client'

import React from 'react'
import { motion } from 'framer-motion'
import { LuxuryButton } from './ui/LuxuryButton'
import { Media } from './Media'
import type { Media as MediaType } from '@/payload-types'

interface CinematicSectionProps {
  image?: MediaType | string | null
  title: string
  subtitle?: string
  ctaText?: string
  ctaLink?: string
}

export function CinematicSection({
  image,
  title,
  subtitle,
  ctaText,
  ctaLink,
}: CinematicSectionProps) {
  return (
    <section className="relative w-full h-[80vh] overflow-hidden">
      <motion.div
        initial={{
          scale: 1.1,
        }}
        whileInView={{
          scale: 1,
        }}
        viewport={{
          once: true,
        }}
        transition={{
          duration: 1.5,
        }}
        className="absolute inset-0"
      >
        {image && typeof image === 'object' && image !== null ? (
          <Media fill resource={image} imgClassName="object-cover" />
        ) : (
          <img
            src={typeof image === 'string' ? image : ''}
            alt={title}
            className="w-full h-full object-cover"
          />
        )}
        <div className="absolute inset-0 bg-black/20" />
      </motion.div>

      <div className="absolute inset-0 flex items-center justify-center text-center px-6 z-10">
        <div className="max-w-3xl">
          {subtitle && (
            <motion.span
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.8, delay: 0.2 }}
              className="block text-white text-sm md:text-base tracking-[0.3em] uppercase mb-6"
            >
              {subtitle}
            </motion.span>
          )}
          <motion.h2
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.8, delay: 0.4 }}
            className="font-serif-display text-5xl md:text-7xl lg:text-8xl text-white leading-tight mb-8"
          >
            {title}
          </motion.h2>
          {ctaText && ctaLink && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.8, delay: 0.6 }}
            >
              <LuxuryButton variant="outline" href={ctaLink}>
                {ctaText}
              </LuxuryButton>
            </motion.div>
          )}
        </div>
      </div>
    </section>
  )
}

