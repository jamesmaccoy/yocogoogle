"use client"

import { useState } from 'react'
import Link from 'next/link'
import type { Post } from '@/payload-types'
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Package, FileText, Sparkles } from 'lucide-react'
import AnnualStatementClient from '@/app/(frontend)/bookings/annual-statement/page.client'
import { PageAIAssistant } from '@/components/AIAssistant/PageAIAssistant'
import PackageDashboard from '@/app/(frontend)/manage/packages/PackageDashboard'

type ManagePageClientProps = {
  posts: Post[]
  latestEstimatePostId: string | null
}

export default function ManagePageClient({ posts, latestEstimatePostId }: ManagePageClientProps) {
  const [selectedPostId, setSelectedPostId] = useState<string | null>(
    posts.length > 0 && posts[0] ? posts[0].id : null
  )

  return (
    <div className="min-h-screen bg-slate-50/50">
      <div className="container py-10">
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
              <div className="text-center py-16 bg-white rounded-xl border border-slate-200 p-8">
                <div className="text-gray-500 text-lg mb-4">
                  You have no posts yet.
                </div>
                <Link 
                  href="/manage/posts/new" 
                  className="inline-block bg-slate-900 hover:bg-slate-800 text-white px-6 py-3 rounded-lg transition"
                >
                  Create your first post
                </Link>
              </div>
            ) : (
              <>
                {posts.length > 1 && (
                  <div className="bg-white rounded-xl border border-slate-200 p-4">
                    <label className="text-sm font-medium text-slate-700 mb-2 block">
                      Select Property
                    </label>
                    <Select
                      value={selectedPostId || ''}
                      onValueChange={setSelectedPostId}
                    >
                      <SelectTrigger className="w-full max-w-md">
                        <SelectValue placeholder="Select a property" />
                      </SelectTrigger>
                      <SelectContent>
                        {posts.map((post) => (
                          <SelectItem key={post.id} value={post.id}>
                            {post.title}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}
                {selectedPostId && (
                  <PackageDashboard postId={selectedPostId} />
                )}
              </>
            )}
          </TabsContent>

          <TabsContent value="statement" className="space-y-6">
            <AnnualStatementClient
              postId={latestEstimatePostId}
              year={undefined}
            />
          </TabsContent>
        </Tabs>

        {/* AI Assistant */}
        <div className="mt-12 border-t border-primary/20 pt-12">
          <div className="max-w-3xl mx-auto">
            <div className="text-center mb-8">
              <div className="inline-flex h-12 w-12 items-center justify-center bg-primary rounded-xl mb-4 shadow-sm">
                <Sparkles className="h-6 w-6 text-primary-foreground" />
              </div>
              <h2 className="text-2xl font-semibold text-foreground mb-2">
                AI Assistant
              </h2>
              <p className="text-muted-foreground">
                Ask about packages, statements, or management features
              </p>
            </div>

            <PageAIAssistant
              context={{
                type: 'manage',
                data: {
                  posts,
                  latestEstimatePostId,
                },
              }}
            />
          </div>
        </div>
      </div>
    </div>
  )
}

