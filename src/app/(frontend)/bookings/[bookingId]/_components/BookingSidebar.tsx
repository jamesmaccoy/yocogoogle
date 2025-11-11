'use client'

import { useCallback, useMemo } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Clock } from 'lucide-react'
import { format } from 'date-fns'

interface BookingSidebarProps {
  history?: {
    role: 'user' | 'assistant'
    content: string
    timestamp: number
    threadId: number
  }[]
  onClearHistory?: () => void
}

export function BookingSidebar({ history = [], onClearHistory }: BookingSidebarProps) {
  const trimmedHistory = useMemo(() => history.slice(-8), [history])

  const sanitizeContent = useCallback((content: string) => {
    if (!content) return ''
    return content.replace(/<[^>]+>/g, '').replace(/&nbsp;/gi, ' ').trim()
  }, [])

  return (
    <aside className="flex flex-col gap-6">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle className="text-base">Recent AI Activity</CardTitle>
            <p className="text-xs text-muted-foreground">Latest prompts and responses</p>
          </div>
          {trimmedHistory.length > 0 && onClearHistory ? (
            <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={onClearHistory}>
              Clear
            </Button>
          ) : null}
        </CardHeader>
        <CardContent className="text-xs">
          {trimmedHistory.length > 0 ? (
            <ScrollArea className="max-h-48 pr-2">
              <div className="space-y-3">
                {trimmedHistory
                  .slice()
                  .reverse()
                  .map((entry, index) => (
                    <div key={`${entry.timestamp}-${index}`} className="space-y-1 rounded-md border border-dashed p-2">
                      <div className="flex items-center justify-between text-[0.68rem] uppercase tracking-wide text-muted-foreground">
                        <span>{entry.role === 'user' ? 'You' : 'Assistant'}</span>
                        <span className="flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          {format(new Date(entry.timestamp), 'MMM dd, HH:mm')}
                        </span>
                      </div>
                      <p className="whitespace-pre-wrap leading-snug text-foreground">
                        {sanitizeContent(entry.content) || '…'}
                      </p>
                    </div>
                  ))}
              </div>
            </ScrollArea>
          ) : (
            <div className="rounded-md border border-dashed p-4 text-center text-xs text-muted-foreground">
              Start a conversation with the assistant to see your history here.
            </div>
          )}
        </CardContent>
      </Card>
    </aside>
  )
}

export default BookingSidebar

