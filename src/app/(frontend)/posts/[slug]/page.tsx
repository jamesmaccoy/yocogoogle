import type { Metadata } from 'next'

import { RelatedPosts } from '@/blocks/RelatedPosts/Component'
import { PayloadRedirects } from '@/components/PayloadRedirects'
import configPromise from '@payload-config'
import { getPayload } from 'payload'
import { draftMode } from 'next/headers'
import React, { cache, Suspense } from 'react'
import RichText from '@/components/RichText'
import { SmartEstimateBlock } from '@/blocks/EstimateBlock/SmartEstimateBlock'

import type { Post } from '@/payload-types'

import { PostHeroWrapper } from '@/heros/PostHero/PostHeroWrapper'
import { generateMeta } from '@/utilities/generateMeta'
import PageClient from './page.client'
import { LivePreviewListener } from '@/components/LivePreviewListener'

export async function generateStaticParams() {
  const payload = await getPayload({ config: configPromise })
  const posts = await payload.find({
    collection: 'posts',
    draft: false,
    limit: 1000,
    overrideAccess: false,
    pagination: false,
    select: {
      slug: true,
    },
  })

  const params = posts.docs.map(({ slug }) => {
    return { slug }
  })

  return params
}

type Args = {
  params: Promise<{
    slug?: string
  }>
}

export default async function Post({ params: paramsPromise }: Args) {
  const { isEnabled: draft } = await draftMode()
  const { slug = '' } = await paramsPromise
  const url = '/posts/' + slug
  const post = await queryPostBySlug({ slug })

  if (!post || !post.id) return <PayloadRedirects url={url} />

  // Type guard: post is guaranteed to have id at this point
  const postWithId: Post = post

  return (
    <article className="pt-16 pb-16">
      <PageClient post={postWithId as any} />

      {/* Allows redirects for valid pages too */}
      <PayloadRedirects disableNotFound url={url} />

      {draft && <LivePreviewListener />}

      <PostHeroWrapper post={postWithId} />

      <div className="flex flex-col items-center gap-4 pt-8">
        <div className="container">
        <Suspense fallback={<div className="w-full max-w-2xl mx-auto p-4">Loading booking assistant...</div>}>
          <SmartEstimateBlock 
            postId={postWithId.id} 
            baseRate={typeof postWithId.baseRate === 'number' ? postWithId.baseRate : 0}
            postTitle={postWithId.title}
            postDescription={postWithId.meta?.description || ''}
          />
        </Suspense>
          <div className="text-center py-8">
            <h2 className="text-2xl font-semibold mb-4">Article Content Available in AI Assistant</h2>
            <p className="text-muted-foreground">
              Use the AI Assistant (bottom right) to interact with this article content. 
              Ask questions, get summaries, or explore specific topics from the article.
            </p>
          </div>
          {postWithId.relatedPosts && postWithId.relatedPosts.length > 0 && (
            <RelatedPosts
              className="mt-12 max-w-[52rem] lg:grid lg:grid-cols-subgrid col-start-1 col-span-3 grid-rows-[2fr]"
              docs={postWithId.relatedPosts.filter((post) => typeof post === 'object')}
            />
          )}
        </div>
      </div>
    </article>
  )
}

export async function generateMetadata({ params: paramsPromise }: Args): Promise<Metadata> {
  const { slug = '' } = await paramsPromise
  const post = await queryPostBySlug({ slug })

  if (!post || !post.id) {
    return {
      title: 'Post not found',
      description: 'The requested post could not be found.',
    }
  }

  return generateMeta({ doc: post })
}

const queryPostBySlug = cache(async ({ slug }: { slug: string }) => {
  const { isEnabled: draft } = await draftMode()

  const payload = await getPayload({ config: configPromise })

  const result = await payload.find({
    collection: 'posts',
    draft,
    depth: 2,
    limit: 1,
    overrideAccess: draft,
    pagination: false,
    where: {
      slug: {
        equals: slug,
      },
    },
  })

  const post = result.docs?.[0]
  
  // Ensure post has required fields before returning
  if (!post || !post.id) {
    return null
  }

  return post
})
