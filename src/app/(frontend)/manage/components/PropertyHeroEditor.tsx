"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import Image from "next/image"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { ImagePlus, Loader2, X } from "lucide-react"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import type { Media } from "@/payload-types"

type PropertyHeroEditorProps = {
  postId: string
}

async function uploadMedia(file: File, alt: string): Promise<string> {
  const fd = new FormData()
  fd.append("file", file)
  fd.append(
    "_payload",
    JSON.stringify({
      alt: (alt || "Property listing hero").slice(0, 200),
    }),
  )

  const res = await fetch("/api/media", {
    method: "POST",
    body: fd,
    credentials: "include",
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    const msg =
      (typeof data?.message === "string" && data.message) ||
      data?.errors?.[0]?.message ||
      data?.error ||
      "Image upload failed"
    throw new Error(msg)
  }
  const id = data?.doc?.id ?? data?.id
  if (!id || typeof id !== "string") {
    throw new Error("Upload succeeded but media id was not returned")
  }
  return id
}

export function PropertyHeroEditor({ postId }: PropertyHeroEditorProps) {
  const router = useRouter()
  const fileRef = useRef<HTMLInputElement>(null)
  const [postTitle, setPostTitle] = useState("")
  const [heroMedia, setHeroMedia] = useState<Media | null>(null)
  const [heroPreviewUrl, setHeroPreviewUrl] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const loadPost = useCallback(async () => {
    if (!postId) return
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/posts/${postId}`)
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data?.error || "Failed to load listing")
      setPostTitle(String(data?.doc?.title || ""))
      const nextHero =
        data?.doc?.heroImage && typeof data.doc.heroImage === "object"
          ? (data.doc.heroImage as Media)
          : null
      setHeroMedia(nextHero)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to load listing")
    } finally {
      setLoading(false)
    }
  }, [postId])

  useEffect(() => {
    void loadPost()
  }, [loadPost])

  const clearPreview = () => {
    if (heroPreviewUrl) URL.revokeObjectURL(heroPreviewUrl)
    setHeroPreviewUrl(null)
  }

  const onFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0] ?? null
    e.target.value = ""
    if (!file) return

    setError(null)
    setUploading(true)
    const preview = URL.createObjectURL(file)
    setHeroPreviewUrl(preview)

    try {
      const mediaId = await uploadMedia(file, postTitle)
      const patchRes = await fetch(`/api/posts/${postId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ heroImage: mediaId }),
      })
      const patchData = await patchRes.json().catch(() => ({}))
      if (!patchRes.ok) {
        throw new Error(patchData?.error || "Failed to save hero image")
      }
      const updatedHero =
        patchData?.doc?.heroImage && typeof patchData.doc.heroImage === "object"
          ? (patchData.doc.heroImage as Media)
          : null
      setHeroMedia(updatedHero)
      URL.revokeObjectURL(preview)
      setHeroPreviewUrl(null)
      router.refresh()
    } catch (err: unknown) {
      URL.revokeObjectURL(preview)
      setHeroPreviewUrl(null)
      setError(err instanceof Error ? err.message : "Failed to update hero image")
    } finally {
      setUploading(false)
    }
  }

  const imageSrc =
    heroPreviewUrl ||
    (heroMedia?.sizes?.large?.url || heroMedia?.url
      ? (heroMedia.sizes?.large?.url || heroMedia.url) as string
      : null)

  const handleDelete = async () => {
    setError(null)
    setDeleting(true)
    try {
      const res = await fetch(`/api/posts/${postId}`, {
        method: "DELETE",
        credentials: "include",
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        throw new Error(data?.error || "Failed to delete listing")
      }

      setConfirmDeleteOpen(false)
      router.push("/manage")
      router.refresh()
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to delete listing")
    } finally {
      setDeleting(false)
    }
  }

  return (
    <section
      className="sticky top-0 z-20 -mx-6 px-6 py-4 mb-6 border-b border-slate-200 bg-white/95 backdrop-blur supports-[backdrop-filter]:bg-white/80 shadow-sm"
      aria-label="Listing hero image"
    >
      <div className="flex flex-col sm:flex-row sm:items-center gap-4">
        <div className="relative h-24 w-40 sm:h-28 sm:w-44 flex-shrink-0 rounded-lg overflow-hidden border border-slate-200 bg-slate-100">
          {loading ? (
            <div className="absolute inset-0 flex items-center justify-center text-slate-400 text-xs">
              Loading…
            </div>
          ) : imageSrc ? (
            <Image
              src={imageSrc}
              alt={heroMedia?.alt || "Listing hero"}
              fill
              className="object-cover"
              unoptimized
            />
          ) : (
            <div className="absolute inset-0 flex flex-col items-center justify-center text-slate-500 p-2 text-center">
              <ImagePlus className="h-6 w-6 text-slate-400 mb-1" />
              <span className="text-[11px] leading-tight">No cover photo</span>
            </div>
          )}
        </div>

        <div className="flex-1 min-w-0">
          <h2 className="text-sm font-semibold text-slate-900">Listing cover photo</h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Shown as the main hero image on your property listing. Upload or replace anytime.
          </p>
          {error ? <p className="text-xs text-red-600 mt-2">{error}</p> : null}
        </div>

        <div className="flex flex-wrap items-center gap-2 flex-shrink-0">
          <Input
            ref={fileRef}
            type="file"
            accept="image/jpeg,image/png,image/webp,image/gif"
            className="sr-only"
            onChange={onFileChange}
          />
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="border-slate-300"
            disabled={uploading || loading}
            onClick={() => fileRef.current?.click()}
          >
            {uploading ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Uploading…
              </>
            ) : (
              <>
                <ImagePlus className="h-4 w-4 mr-2" />
                {heroMedia ? "Change photo" : "Upload photo"}
              </>
            )}
          </Button>
          {heroPreviewUrl ? (
            <Button type="button" variant="ghost" size="sm" onClick={clearPreview}>
              <X className="h-4 w-4 mr-1" />
              Cancel preview
            </Button>
          ) : null}
          <Button
            type="button"
            variant="destructive"
            size="sm"
            disabled={uploading || deleting || loading}
            onClick={() => setConfirmDeleteOpen(true)}
          >
            Delete listing
          </Button>
        </div>
      </div>

      <Dialog open={confirmDeleteOpen} onOpenChange={setConfirmDeleteOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete this property listing?</DialogTitle>
            <DialogDescription>
              This will permanently delete the listing{postTitle ? ` “${postTitle}”` : ""}. This cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setConfirmDeleteOpen(false)}
              disabled={deleting}
            >
              Cancel
            </Button>
            <Button type="button" variant="destructive" onClick={() => void handleDelete()} disabled={deleting}>
              {deleting ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Deleting…
                </>
              ) : (
                "Yes, delete"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  )
}
