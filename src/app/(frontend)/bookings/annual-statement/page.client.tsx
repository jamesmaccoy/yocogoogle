"use client"

import { useEffect, useMemo, useState } from "react"
import type { User } from "@/payload-types"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { formatAmountToZAR } from "@/lib/currency"
import { Loader2, AlertCircle } from "lucide-react"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"

type YocoTransactionRecord = {
  id: string
  status: "pending" | "completed" | "failed" | "cancelled"
  amount?: number
  currency?: string
  plan?: string
  entitlement?: string
  createdAt?: string
  completedAt?: string
  packageName?: string
}

type PostSummary = {
  id: string
  title: string
  authors: string[]
  createdAt?: string
  updatedAt?: string
}

type MonthlySummary = {
  key: string
  label: string
  completedAmount: number
  pendingAmount: number
  failedAmount: number
  completedCount: number
  totalCount: number
}

interface AnnualStatementClientProps {
  postId: string | null
  year?: number
}

const monthLabelFormatter = new Intl.DateTimeFormat(undefined, {
  month: "short",
  year: "numeric",
})

const formatDate = (value?: string) => {
  if (!value) return "—"
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return "—"
  return date.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  })
}

const buildAuthors = (rawAuthors: unknown): string[] => {
  if (!Array.isArray(rawAuthors)) return []

  return rawAuthors
    .map((author) => {
      if (!author) return null
      if (typeof author === "string") return author
      if (typeof author === "object" && "name" in author && typeof author.name === "string") {
        return author.name
      }
      if (typeof author === "object" && "title" in author && typeof author.title === "string") {
        return author.title
      }
      if (typeof author === "object" && "email" in author && typeof author.email === "string") {
        return author.email
      }
      return null
    })
    .filter((value): value is string => Boolean(value && value.trim()))
}

export default function AnnualStatementClient({ postId, year }: AnnualStatementClientProps) {
  const [postDetails, setPostDetails] = useState<PostSummary | null>(null)
  const [postError, setPostError] = useState<string | null>(null)
  const [postLoading, setPostLoading] = useState(false)

  const [transactions, setTransactions] = useState<YocoTransactionRecord[]>([])
  const [transactionsLoading, setTransactionsLoading] = useState(true)
  const [transactionsError, setTransactionsError] = useState<string | null>(null)

  const [beneficiaries, setBeneficiaries] = useState<User[]>([])
  const [beneficiariesLoading, setBeneficiariesLoading] = useState(true)
  const [beneficiariesError, setBeneficiariesError] = useState<string | null>(null)

  const effectiveYear = Number.isFinite(year) ? year : undefined

  useEffect(() => {
    if (!postId) {
      setPostDetails(null)
      setPostError("Provide a property reference (postId) to link this statement to a trust deed.")
      setPostLoading(false)
      return
    }

    let active = true

    const fetchPostDetails = async () => {
      setPostLoading(true)
      setPostError(null)
      try {
        const response = await fetch(`/api/posts/${postId}`)
        if (!response.ok) {
          if (response.status === 404) {
            throw new Error("Trust deed record not found for this property.")
          }
          if (response.status === 401) {
            throw new Error("Sign in to review trust deed documentation for this property.")
          }
          throw new Error("Failed to load trust deed context.")
        }

        const data = await response.json()
        const doc = data?.doc
        if (!doc) {
          throw new Error("Trust deed data missing from response.")
        }

        if (!active) return

        const authors = buildAuthors(doc.populatedAuthors ?? doc.authors)

        setPostDetails({
          id: doc.id ?? postId,
          title: doc.title ?? "Untitled property",
          authors,
          createdAt: doc.createdAt,
          updatedAt: doc.updatedAt,
        })
      } catch (error) {
        if (!active) return
        setPostDetails(null)
        setPostError(error instanceof Error ? error.message : "Failed to load trust deed context.")
      } finally {
        if (active) {
          setPostLoading(false)
        }
      }
    }

    fetchPostDetails()

    return () => {
      active = false
    }
  }, [postId])

  useEffect(() => {
    let active = true

    const fetchTransactions = async () => {
      setTransactionsLoading(true)
      setTransactionsError(null)
      try {
        const response = await fetch("/api/yoco/transactions?limit=365", {
          credentials: "include",
        })
        if (!response.ok) {
          if (response.status === 401) {
            throw new Error("Sign in to review the annual statement of account.")
          }
          throw new Error("Failed to load transactions.")
        }

        const data = await response.json()
        if (!active) return

        const docs = Array.isArray(data?.transactions) ? data.transactions : []
        setTransactions(docs)
      } catch (error) {
        if (!active) return
        setTransactions([])
        setTransactionsError(error instanceof Error ? error.message : "Unable to load transactions.")
      } finally {
        if (active) {
          setTransactionsLoading(false)
        }
      }
    }

    fetchTransactions()

    return () => {
      active = false
    }
  }, [])

  useEffect(() => {
    let active = true

    const fetchBeneficiaries = async () => {
      setBeneficiariesLoading(true)
      setBeneficiariesError(null)
      try {
        const response = await fetch("/api/guests", { credentials: "include" })
        if (!response.ok) {
          if (response.status === 401) {
            throw new Error("Sign in to view beneficiary records.")
          }
          throw new Error("Failed to load beneficiaries.")
        }

        const data = await response.json()
        if (!active) return

        setBeneficiaries(Array.isArray(data) ? data : [])
      } catch (error) {
        if (!active) return
        setBeneficiaries([])
        setBeneficiariesError(error instanceof Error ? error.message : "Unable to load beneficiaries.")
      } finally {
        if (active) {
          setBeneficiariesLoading(false)
        }
      }
    }

    fetchBeneficiaries()

    return () => {
      active = false
    }
  }, [])

  const transactionsForPeriod = useMemo(() => {
    if (!transactions.length) return []

    if (effectiveYear !== undefined) {
      return transactions.filter((transaction) => {
        if (!transaction.createdAt) return false
        const date = new Date(transaction.createdAt)
        return !Number.isNaN(date.getTime()) && date.getFullYear() === effectiveYear
      })
    }

    const now = new Date()
    const start = new Date(now.getFullYear(), now.getMonth() - 11, 1)

    return transactions.filter((transaction) => {
      if (!transaction.createdAt) return false
      const date = new Date(transaction.createdAt)
      if (Number.isNaN(date.getTime())) return false
      return date >= start && date <= now
    })
  }, [transactions, effectiveYear])

  const monthlySummary = useMemo(() => {
    const summaryMap = new Map<string, MonthlySummary>()

    const seedMonth = (date: Date) => {
      const key = `${date.getFullYear()}-${date.getMonth()}`
      if (!summaryMap.has(key)) {
        summaryMap.set(key, {
          key,
          label: monthLabelFormatter.format(date),
          completedAmount: 0,
          pendingAmount: 0,
          failedAmount: 0,
          completedCount: 0,
          totalCount: 0,
        })
      }
    }

    if (effectiveYear !== undefined) {
      for (let month = 0; month < 12; month += 1) {
        seedMonth(new Date(effectiveYear, month, 1))
      }
    } else {
      const now = new Date()
      for (let offset = 11; offset >= 0; offset -= 1) {
        seedMonth(new Date(now.getFullYear(), now.getMonth() - offset, 1))
      }
    }

    transactionsForPeriod.forEach((transaction) => {
      if (!transaction.createdAt) return
      const date = new Date(transaction.createdAt)
      if (Number.isNaN(date.getTime())) return

      const key = `${date.getFullYear()}-${date.getMonth()}`
      const entry =
        summaryMap.get(key) ??
        {
          key,
          label: monthLabelFormatter.format(date),
          completedAmount: 0,
          pendingAmount: 0,
          failedAmount: 0,
          completedCount: 0,
          totalCount: 0,
        }

      const amount = transaction.amount ?? 0
      entry.totalCount += 1

      switch (transaction.status) {
        case "completed":
          entry.completedAmount += amount
          entry.completedCount += 1
          break
        case "pending":
          entry.pendingAmount += amount
          break
        case "failed":
        case "cancelled":
          entry.failedAmount += amount
          break
        default:
          break
      }

      summaryMap.set(key, entry)
    })

    return Array.from(summaryMap.values()).sort((a, b) => {
      const [aYear, aMonth] = a.key.split("-").map(Number)
      const [bYear, bMonth] = b.key.split("-").map(Number)
      if (aYear === bYear) return aMonth - bMonth
      return aYear - bYear
    })
  }, [transactionsForPeriod, effectiveYear])

  const statementTotals = useMemo(() => {
    const completedAmount = transactionsForPeriod.reduce(
      (sum, transaction) => (transaction.status === "completed" ? sum + (transaction.amount ?? 0) : sum),
      0,
    )

    const pendingAmount = transactionsForPeriod.reduce(
      (sum, transaction) => (transaction.status === "pending" ? sum + (transaction.amount ?? 0) : sum),
      0,
    )

    const failedAmount = transactionsForPeriod.reduce(
      (sum, transaction) =>
        transaction.status === "failed" || transaction.status === "cancelled" ? sum + (transaction.amount ?? 0) : sum,
      0,
    )

    const completedCount = transactionsForPeriod.filter((transaction) => transaction.status === "completed").length
    const pendingCount = transactionsForPeriod.filter((transaction) => transaction.status === "pending").length

    return {
      completedAmount,
      pendingAmount,
      failedAmount,
      completedCount,
      pendingCount,
      totalCount: transactionsForPeriod.length,
    }
  }, [transactionsForPeriod])

  const trustAuthors = postDetails?.authors?.length ? postDetails.authors.join(", ") : null
  const showGlobalSpinner = transactionsLoading && beneficiariesLoading && (postLoading || Boolean(postId))

  return (
    <div className="container py-10">
      <h1 className="mb-2 text-4xl font-bold tracking-tight text-foreground">
        {effectiveYear !== undefined ? `Annual booking statement ${effectiveYear}` : "12-month booking statement"}
      </h1>
      <p className="mb-6 text-sm text-muted-foreground">
        Review the annual short-term rental income and supporting trust documentation for compliance purposes.
      </p>

      <Alert className="mb-6 border-amber-500/40 bg-amber-500/5">
        <AlertTitle>Adverse note on short-term rentals</AlertTitle>
        <AlertDescription>
          Sustained short-term letting can expose the trust to liquidity and compliance risk. Use this statement to
          demonstrate where income flowed and which beneficiaries received it over the past 12 months.
        </AlertDescription>
      </Alert>

      {postLoading && (
        <div className="mb-6 flex items-center gap-2 rounded-lg border border-border bg-muted/40 p-4 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading trust deed context...
        </div>
      )}

      {!postLoading && postError && (
        <div className="mb-6 flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
          <AlertCircle className="h-4 w-4 mt-0.5" />
          <span>{postError}</span>
        </div>
      )}

      {!postLoading && !postError && postDetails && (
        <Card className="mb-6 border-primary/40 bg-primary/5">
          <CardHeader>
            <CardTitle>{postDetails.title}</CardTitle>
            <CardDescription>
              {trustAuthors ? `Trust deed compiled by ${trustAuthors}` : "No author details recorded for this trust."}
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 text-sm md:grid-cols-2">
            <div>
              <p className="text-muted-foreground">Created</p>
              <p className="font-medium text-foreground">{formatDate(postDetails.createdAt)}</p>
            </div>
            <div>
              <p className="text-muted-foreground">Last updated</p>
              <p className="font-medium text-foreground">{formatDate(postDetails.updatedAt)}</p>
            </div>
            <div className="md:col-span-2">
              <p className="text-muted-foreground">Trust reference</p>
              <p className="font-medium text-foreground">{postDetails.id}</p>
            </div>
          </CardContent>
        </Card>
      )}

      {showGlobalSpinner && (
        <div className="mb-8 flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Compiling transactions and beneficiary records...
        </div>
      )}

      {transactionsError && (
        <div className="mb-6 flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
          <AlertCircle className="h-4 w-4 mt-0.5" />
          <span>{transactionsError}</span>
        </div>
      )}

      <div className="mb-8 grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="space-y-1">
            <CardTitle className="text-sm font-medium text-muted-foreground">Completed income</CardTitle>
            <Badge className="w-fit bg-green-100 text-green-800">Settled</Badge>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold text-foreground">
              {formatAmountToZAR(statementTotals.completedAmount)}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              {statementTotals.completedCount} completed transaction
              {statementTotals.completedCount === 1 ? "" : "s"}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="space-y-1">
            <CardTitle className="text-sm font-medium text-muted-foreground">Pending clearance</CardTitle>
            <Badge className="w-fit bg-amber-100 text-amber-800">Outstanding</Badge>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold text-foreground">
              {formatAmountToZAR(statementTotals.pendingAmount)}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              {statementTotals.pendingCount} pending transaction
              {statementTotals.pendingCount === 1 ? "" : "s"}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="space-y-1">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total reviews</CardTitle>
            <Badge className="w-fit bg-primary/10 text-primary">12-month scope</Badge>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold text-foreground">{statementTotals.totalCount}</p>
            <p className="mt-1 text-xs text-muted-foreground">Transactions analysed</p>
          </CardContent>
        </Card>
      </div>

      <Card className="mb-8 border-border">
        <CardHeader>
          <CardTitle>12-month transaction summary</CardTitle>
          <CardDescription>
            Consolidated statement of account covering the last 12 months of short-term rental activity.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {monthlySummary.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-xs uppercase tracking-wide text-muted-foreground">
                  <tr>
                    <th className="py-2 text-left">Month</th>
                    <th className="py-2 text-right">Completed</th>
                    <th className="py-2 text-right">Pending</th>
                    <th className="py-2 text-right">Failed / Cancelled</th>
                    <th className="py-2 text-right">Completed count</th>
                    <th className="py-2 text-right">Total count</th>
                  </tr>
                </thead>
                <tbody>
                  {monthlySummary.map((month) => (
                    <tr key={month.key} className="border-t border-border/70">
                      <td className="py-2 font-medium text-foreground">{month.label}</td>
                      <td className="py-2 text-right text-foreground">{formatAmountToZAR(month.completedAmount)}</td>
                      <td className="py-2 text-right text-muted-foreground">{formatAmountToZAR(month.pendingAmount)}</td>
                      <td className="py-2 text-right text-muted-foreground">{formatAmountToZAR(month.failedAmount)}</td>
                      <td className="py-2 text-right text-foreground">{month.completedCount}</td>
                      <td className="py-2 text-right text-foreground">{month.totalCount}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              No transaction history available for the selected period.
            </p>
          )}
        </CardContent>
      </Card>

      {beneficiariesError && (
        <div className="mb-6 flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
          <AlertCircle className="h-4 w-4 mt-0.5" />
          <span>{beneficiariesError}</span>
        </div>
      )}

      <Card className="border-border">
        <CardHeader>
          <CardTitle>Beneficiary ledger</CardTitle>
          <CardDescription>
            Records which beneficiaries were linked to bookings that generated short-term income.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {beneficiariesLoading ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading beneficiary records...
            </div>
          ) : beneficiaries.length > 0 ? (
            <ul className="space-y-3">
              {beneficiaries.map((beneficiary) => (
                <li
                  key={beneficiary.id}
                  className="flex flex-col gap-1 rounded-md border border-border/60 p-3 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div>
                    <p className="text-sm font-semibold text-foreground">
                      {beneficiary.name || "Unnamed beneficiary"}
                    </p>
                    <p className="text-xs text-muted-foreground">{beneficiary.email || "No email on record"}</p>
                  </div>
                  <div className="text-xs text-muted-foreground sm:text-right">
                    <p>Bank details: pending capture</p>
                    <p>Income allocation pending</p>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">
              No beneficiaries recorded yet. Once bookings include guests, their details will appear here for auditing.
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

