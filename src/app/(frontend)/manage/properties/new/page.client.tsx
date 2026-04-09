"use client"

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Loader2, ArrowRight } from 'lucide-react'

export default function NewPropertyOnboardingClient() {
  const router = useRouter()
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const canSubmit = title.trim().length > 0

  const handleCreate = async () => {
    if (!canSubmit || submitting) return
    setSubmitting(true)
    setError(null)

    try {
      const res = await fetch('/api/posts/draft', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: title.trim(),
          description: description.trim(),
        }),
      })

      const data = await res.json()
      if (!res.ok) {
        throw new Error(data?.error || 'Failed to create property')
      }

      const postId = data?.post?.id || data?.postId
      if (!postId) throw new Error('Draft property created but id missing')

      router.push(`/manage?postId=${encodeURIComponent(postId)}&onboard=1`)
    } catch (e: any) {
      setError(e?.message || 'Something went wrong')
      setSubmitting(false)
    }
  }

  return (
    <div className="container py-10 max-w-3xl">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-slate-900">Create a property</h1>
          <p className="text-slate-500 mt-1">
            Add a title and description first. Next, we’ll generate and assign packages.
          </p>
        </div>
        <Link href="/manage" className="text-sm text-slate-600 hover:text-slate-900">
          Back to manage
        </Link>
      </div>

      <Card className="border-2 border-slate-200 shadow-lg">
        <div className="p-8 space-y-6">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">Title</label>
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g., Seaside Cottage in Paternoster"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">Description (optional)</label>
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="A short description guests will see. You can edit later."
              className="min-h-[140px]"
            />
          </div>

          {error && (
            <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg p-3">
              {error}
            </div>
          )}

          <div className="flex items-center gap-3">
            <Button
              onClick={handleCreate}
              disabled={!canSubmit || submitting}
              className="bg-slate-900 hover:bg-slate-800 text-white"
            >
              {submitting ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Creating…
                </>
              ) : (
                <>
                  Continue to packages
                  <ArrowRight className="h-4 w-4 ml-2" />
                </>
              )}
            </Button>
          </div>
        </div>
      </Card>
    </div>
  )
}

