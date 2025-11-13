"use client"

import Link from 'next/link'
import type { Post } from '@/payload-types'
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Package, FileText } from 'lucide-react'
import AnnualStatementClient from '@/app/(frontend)/bookings/annual-statement/page.client'

type ManagePageClientProps = {
  posts: Post[]
  latestEstimatePostId: string | null
}

export default function ManagePageClient({ posts, latestEstimatePostId }: ManagePageClientProps) {
  return (
    <div className="container py-10">
      <h1 className="text-3xl font-bold mb-6">Manage</h1>
      
      <Tabs defaultValue="packages" className="space-y-6">
        <TabsList>
          <TabsTrigger value="packages" className="gap-2">
            <Package className="h-4 w-4" />
            <span>Packages</span>
          </TabsTrigger>
          <TabsTrigger value="statement" className="gap-2">
            <FileText className="h-4 w-4" />
            <span>Booking Statement</span>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="packages" className="space-y-6">
          {posts.length === 0 ? (
            <div className="text-gray-500">
              You have no posts yet. <Link href="/manage/posts/new" className="text-primary underline">Create your first post</Link>.
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {posts.map((post) => (
                <div key={post.id} className="border rounded-lg p-4 flex flex-col gap-2 shadow-sm">
                  <div className="font-semibold text-lg">{post.title}</div>
                  <div className="text-sm text-gray-500">Slug: {post.slug}</div>
                  <Link href={`/manage/packages/${post.id}`} className="mt-2 inline-block bg-primary text-white px-4 py-2 rounded hover:bg-primary/80 transition">
                    Manage Packages
                  </Link>
                </div>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="statement" className="space-y-6">
          <AnnualStatementClient 
            postId={latestEstimatePostId} 
            year={undefined}
          />
        </TabsContent>
      </Tabs>
    </div>
  )
}

