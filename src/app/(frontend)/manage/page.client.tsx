"use client"

import { useState } from 'react'
import Link from 'next/link'
import type { Post } from '@/payload-types'
import { Sidebar } from './components/Sidebar'
import { PageAIAssistant } from '@/components/AIAssistant/PageAIAssistant'
import PackageDashboard from '@/app/(frontend)/manage/packages/PackageDashboard'
import AnnualStatementClient from '@/app/(frontend)/bookings/annual-statement/page.client'
import { useUserContext } from '@/context/UserContext'
import { BarChart2 } from 'lucide-react'

type ManagePageClientProps = {
  posts: Post[]
  latestEstimatePostId: string | null
}

export default function ManagePageClient({ posts, latestEstimatePostId }: ManagePageClientProps) {
  const { currentUser } = useUserContext()
  const [selectedPostId, setSelectedPostId] = useState<string | null>(
    posts.length > 0 && posts[0] ? posts[0].id : null
  )
  const [activeTab, setActiveTab] = useState<'packages' | 'statement'>('packages')

  return (
    <div className="flex min-h-screen bg-white font-sans text-slate-900">
      <Sidebar
        activeProperty={selectedPostId}
        onSelectProperty={setSelectedPostId}
        properties={posts}
        activeTab={activeTab}
        onSelectTab={setActiveTab}
        currentUser={{
          name: currentUser?.name || null,
          email: currentUser?.email || null,
        }}
      />

      <main className="flex-1 overflow-y-auto h-screen">
        <div className="max-w-5xl mx-auto px-8 py-12">
          {/* AI Assistant - Primary Tool */}
          <PageAIAssistant
            context={{
              type: 'manage',
              data: {
                posts,
                latestEstimatePostId,
                postId: selectedPostId,
              },
            }}
            variant="primary"
          />

          {/* Content based on active tab */}
          {activeTab === 'packages' && (
            <div className="border-t border-slate-100 pt-12">
              {posts.length === 0 ? (
                <div className="text-center py-16 bg-white rounded-xl border border-slate-200 p-8">
                  <div className="text-gray-500 text-lg mb-4">
                    You have no properties yet.
                  </div>
                  <Link 
                    href="/manage/posts/new" 
                    className="inline-block bg-slate-900 hover:bg-slate-800 text-white px-6 py-3 rounded-lg transition"
                  >
                    Create your first property
                  </Link>
                </div>
              ) : selectedPostId ? (
                <PackageDashboard postId={selectedPostId} />
              ) : (
                <div className="text-center py-16 bg-white rounded-xl border border-slate-200 p-8">
                  <div className="text-gray-500 text-lg mb-4">
                    Select a property from the sidebar to manage packages.
                  </div>
                </div>
              )}
            </div>
          )}

          {activeTab === 'statement' && (
            <div className="border-t border-slate-100 pt-12">
              <AnnualStatementClient
                postId={latestEstimatePostId}
                year={undefined}
              />
            </div>
          )}
        </div>
      </main>
    </div>
  )
}

