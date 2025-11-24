'use client'

import React, { useEffect, useState, useMemo } from 'react'
import type { DateFieldClientProps } from 'payload'
import { useField, FieldLabel, useFormFields } from '@payloadcms/ui'
import { format } from 'date-fns'
import { Calendar } from '@/components/ui/calendar'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Button } from '@/components/ui/button'
import { CalendarIcon, Clock } from 'lucide-react'

type DateFieldWithAvailabilityProps = DateFieldClientProps & {
  fieldName?: 'fromDate' | 'toDate'
}

export const DateFieldWithAvailability: React.FC<DateFieldWithAvailabilityProps> = ({
  field,
  fieldName,
  path,
  ...props
}) => {
  // Ensure we have valid field and path
  const fieldPath = path || field?.name
  if (!field || !fieldPath) {
    // Return a simple fallback instead of null to avoid rendering issues
    return (
      <div className="field-type date">
        <FieldLabel label={field?.label || 'Date'} required={field?.required} />
        <div style={{ padding: '0.5rem', color: '#999', fontSize: '0.875rem' }}>
          Date field not configured properly
        </div>
      </div>
    )
  }

  let value: Date | string | undefined
  let setValue: ((value: any) => void) | undefined

  try {
    const fieldResult = useField<Date | string>({ 
      path: fieldPath
    })
    value = fieldResult.value
    setValue = fieldResult.setValue
  } catch (error) {
    console.error('Error initializing date field:', error)
    return (
      <div className="field-type date">
        <FieldLabel label={field.label} required={field.required} />
        <div style={{ padding: '0.5rem', color: '#dc2626', fontSize: '0.875rem' }}>
          Error loading date field
        </div>
      </div>
    )
  }
  const [unavailableDates, setUnavailableDates] = useState<string[]>([])
  const [loadingUnavailableDates, setLoadingUnavailableDates] = useState(false)
  const [unavailableDateRanges, setUnavailableDateRanges] = useState<Array<{ from: string; to: string }>>([])
  const [isCalendarOpen, setIsCalendarOpen] = useState(false)
  
  // Convert value to Date for the calendar
  const selectedDate = useMemo(() => {
    if (!value) return undefined
    try {
      return typeof value === 'string' ? new Date(value) : value instanceof Date ? value : undefined
    } catch {
      return undefined
    }
  }, [value])

  // Get the post field value - access by path like the slug component does
  let postId: string | null = null
  let currentBookingId: string | undefined = undefined

  try {
    const postFieldValue = useFormFields(([fields]) => {
      if (!fields || typeof fields !== 'object') return null
      try {
        const postField = (fields as any)?.post
        if (!postField) return null
        const fieldValue = postField.value
        if (!fieldValue) return null
        return typeof fieldValue === 'string' ? fieldValue : (fieldValue as any)?.id || null
      } catch {
        return null
      }
    })

    postId = useMemo(() => {
      if (!postFieldValue) return null
      return postFieldValue
    }, [postFieldValue]) as string | null

    // Get current booking ID (for updates) - access by path
    currentBookingId = useFormFields(([fields]) => {
      if (!fields || typeof fields !== 'object') return undefined
      try {
        const idField = (fields as any)?.id
        return idField?.value as string | undefined
      } catch {
        return undefined
      }
    }) as string | undefined
  } catch (error) {
    // Silently fail - form fields might not be available yet
    console.debug('Form fields not available:', error)
  }

  // Fetch unavailable dates when post is selected - only on client side
  useEffect(() => {
    // Ensure we're on the client side
    if (typeof window === 'undefined') return
    
    if (!postId || typeof postId !== 'string') {
      setUnavailableDates([])
      setUnavailableDateRanges([])
      return
    }

    let cancelled = false

    const fetchUnavailableDates = async () => {
      setLoadingUnavailableDates(true)
      try {
        const url = `/api/bookings/unavailable-dates?postId=${encodeURIComponent(postId)}${currentBookingId ? `&excludeBookingId=${encodeURIComponent(currentBookingId)}` : ''}`
        const response = await fetch(url, {
          credentials: 'include',
        })

        if (cancelled) return

        if (response.ok) {
          const data = await response.json()
          const dates = Array.isArray(data.unavailableDates) ? data.unavailableDates : []
          if (!cancelled) {
            setUnavailableDates(dates)

            // Group consecutive dates into ranges for better display
            if (dates.length > 0) {
              const sortedDates = [...dates].sort()
              const ranges: Array<{ from: string; to: string }> = []
              let currentRange: { from: string; to: string } | null = null

              sortedDates.forEach((dateStr) => {
                if (!dateStr) return
                try {
                  const date = new Date(dateStr)
                  if (isNaN(date.getTime())) return // Skip invalid dates
                  
                  if (!currentRange) {
                    currentRange = { from: dateStr, to: dateStr }
                  } else {
                    const prevDate = new Date(currentRange.to)
                    if (isNaN(prevDate.getTime())) {
                      currentRange = { from: dateStr, to: dateStr }
                      return
                    }
                    const daysDiff = Math.round((date.getTime() - prevDate.getTime()) / (1000 * 60 * 60 * 24))
                    if (daysDiff === 1) {
                      // Consecutive date, extend range
                      currentRange.to = dateStr
                    } else {
                      // Gap found, save current range and start new one
                      ranges.push(currentRange)
                      currentRange = { from: dateStr, to: dateStr }
                    }
                  }
                } catch {
                  // Skip invalid dates
                }
              })
              if (currentRange) {
                ranges.push(currentRange)
              }
              if (!cancelled) {
                setUnavailableDateRanges(ranges)
              }
            }
          }
        }
      } catch (error) {
        if (!cancelled) {
          console.error('Error fetching unavailable dates:', error)
        }
      } finally {
        if (!cancelled) {
          setLoadingUnavailableDates(false)
        }
      }
    }

    fetchUnavailableDates()

    return () => {
      cancelled = true
    }
  }, [postId, currentBookingId])

  return (
    <div className="field-type date">
      {/* Show unavailable dates info above the date field */}
      {postId && (
        <div
          style={{
            marginBottom: '1rem',
            padding: '0.75rem',
            backgroundColor: '#fef3c7',
            border: '1px solid #fbbf24',
            borderRadius: '4px',
            fontSize: '0.875rem',
          }}
        >
          {loadingUnavailableDates ? (
            <div style={{ color: '#92400e' }}>Loading unavailable dates...</div>
          ) : unavailableDateRanges.length > 0 ? (
            <div>
              <div style={{ fontWeight: 600, color: '#92400e', marginBottom: '0.5rem' }}>
                📅 Unavailable Dates ({unavailableDates.length} day{unavailableDates.length !== 1 ? 's' : ''}):
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
                {unavailableDateRanges.slice(0, 5).map((range, idx) => {
                  if (!range.from || !range.to) return null
                  try {
                    const fromDate = new Date(range.from)
                    const toDate = new Date(range.to)
                    if (isNaN(fromDate.getTime()) || isNaN(toDate.getTime())) return null
                    
                    const isRange = range.from !== range.to
                    return (
                      <span
                        key={idx}
                        style={{
                          display: 'inline-block',
                          padding: '0.25rem 0.5rem',
                          backgroundColor: '#fef2f2',
                          border: '1px solid #fca5a5',
                          borderRadius: '4px',
                          color: '#991b1b',
                          fontSize: '0.75rem',
                          fontWeight: 500,
                        }}
                      >
                        {isRange
                          ? `${format(fromDate, 'MMM dd')} - ${format(toDate, 'MMM dd')}`
                          : format(fromDate, 'MMM dd, yyyy')}
                      </span>
                    )
                  } catch {
                    return null
                  }
                })}
                {unavailableDateRanges.length > 5 && (
                  <span style={{ color: '#92400e', fontSize: '0.75rem', alignSelf: 'center' }}>
                    +{unavailableDateRanges.length - 5} more range{unavailableDateRanges.length - 5 !== 1 ? 's' : ''}
                  </span>
                )}
              </div>
            </div>
          ) : (
            <div style={{ color: '#059669', fontWeight: 500 }}>
              ✅ All dates are currently available for this property
            </div>
          )}
        </div>
      )}

      {/* Render the date picker with disabled unavailable dates */}
      <div style={{ marginTop: '1rem' }}>
        <FieldLabel label={field.label} required={field.required} />
        <Popover open={isCalendarOpen} onOpenChange={setIsCalendarOpen}>
          <PopoverTrigger asChild>
            <Button
              variant="outline"
              style={{
                width: '100%',
                justifyContent: 'flex-start',
                textAlign: 'left',
                fontWeight: 'normal',
              }}
            >
              <CalendarIcon style={{ marginRight: '0.5rem', height: '1rem', width: '1rem' }} />
              {selectedDate ? (
                <>
                  {format(selectedDate, 'PPP')}
                  {field.admin?.date?.pickerAppearance === 'dayAndTime' && selectedDate && (
                    <>
                      {' '}
                      <Clock style={{ marginLeft: '0.5rem', height: '0.875rem', width: '0.875rem', display: 'inline' }} />
                      {format(selectedDate, 'p')}
                    </>
                  )}
                </>
              ) : (
                <span style={{ color: '#999' }}>Select a date</span>
              )}
            </Button>
          </PopoverTrigger>
          <PopoverContent 
            className="w-auto p-0" 
            align="start"
            style={{
              backgroundColor: '#ffffff',
              border: '1px solid #e5e7eb',
              borderRadius: '8px',
              boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)',
            }}
          >
            {/* CSS override to ensure calendar visibility with proper contrast */}
            <style dangerouslySetInnerHTML={{
              __html: `
                .booking-date-calendar-wrapper .rdp,
                .booking-date-calendar-wrapper .rdp-months,
                .booking-date-calendar-wrapper .rdp-month,
                .booking-date-calendar-wrapper .rdp-table {
                  background-color: #ffffff !important;
                  color: #000000 !important;
                }
                .booking-date-calendar-wrapper .rdp-day {
                  color: #000000 !important;
                }
                .booking-date-calendar-wrapper .rdp-day:hover:not(.rdp-day_disabled) {
                  background-color: #f3f4f6 !important;
                  color: #000000 !important;
                }
                .booking-date-calendar-wrapper .rdp-day_selected {
                  background-color: #3b82f6 !important;
                  color: #ffffff !important;
                }
                .booking-date-calendar-wrapper .rdp-day_disabled {
                  color: #9ca3af !important;
                  opacity: 0.5 !important;
                }
                .booking-date-calendar-wrapper .rdp-head_cell {
                  color: #000000 !important;
                }
                .booking-date-calendar-wrapper .rdp-caption_label {
                  color: #000000 !important;
                }
                .booking-date-calendar-wrapper .rdp-button {
                  color: #000000 !important;
                }
                .booking-date-calendar-wrapper .rdp-button:hover:not(:disabled) {
                  color: #000000 !important;
                }
              `
            }} />
            <div 
              className="booking-date-calendar-wrapper"
              style={{ 
                backgroundColor: '#ffffff', 
                padding: '0.5rem',
                borderRadius: '8px',
              }}
            >
              <Calendar
                mode="single"
                selected={selectedDate}
                style={{
                  backgroundColor: '#ffffff',
                }}
                onSelect={(date) => {
                if (!setValue) return
                
                if (date) {
                  // If time picker is enabled, preserve the time or set to current time
                  let dateWithTime = date
                  if (field.admin?.date?.pickerAppearance === 'dayAndTime') {
                    if (selectedDate) {
                      // Preserve existing time
                      dateWithTime = new Date(date)
                      dateWithTime.setHours(selectedDate.getHours(), selectedDate.getMinutes(), selectedDate.getSeconds())
                    } else {
                      // Set to current time
                      const now = new Date()
                      dateWithTime = new Date(date)
                      dateWithTime.setHours(now.getHours(), now.getMinutes(), 0)
                    }
                  }
                  // Always set a valid ISO string
                  const isoString = dateWithTime.toISOString()
                  if (isoString && !isNaN(dateWithTime.getTime())) {
                    setValue(isoString)
                  }
                } else {
                  // Set undefined instead of empty string to avoid JSON parsing issues
                  setValue(undefined)
                }
                setIsCalendarOpen(false)
                }}
                disabled={(date) => {
                // Disable past dates
                const today = new Date()
                today.setHours(0, 0, 0, 0)
                const checkDate = new Date(date)
                checkDate.setHours(0, 0, 0, 0)
                if (checkDate < today) return true
                
                // Disable unavailable dates
                if (unavailableDates.length > 0) {
                  const dateStr = date.toISOString().split('T')[0]
                  return unavailableDates.some((unavailableDateStr) => {
                    const unavailableDatePart = unavailableDateStr.split('T')[0]
                    return unavailableDatePart === dateStr
                  })
                }
                return false
                }}
                initialFocus
              />
            </div>
            {field.admin?.date?.pickerAppearance === 'dayAndTime' && selectedDate && (
              <div style={{ 
                padding: '0.75rem', 
                borderTop: '1px solid #e5e7eb',
                backgroundColor: '#ffffff !important',
              }}>
                <label style={{ display: 'block', fontSize: '0.875rem', marginBottom: '0.25rem' }}>Time:</label>
                <input
                  type="time"
                  value={format(selectedDate, 'HH:mm')}
                  onChange={(e) => {
                    if (!setValue || !selectedDate) return
                    
                    if (e.target.value && selectedDate) {
                      const [hours, minutes] = e.target.value.split(':')
                      const newDate = new Date(selectedDate)
                      newDate.setHours(parseInt(hours, 10), parseInt(minutes, 10), 0)
                      const isoString = newDate.toISOString()
                      if (isoString && !isNaN(newDate.getTime())) {
                        setValue(isoString)
                      }
                    }
                  }}
                  style={{
                    width: '100%',
                    padding: '0.5rem',
                    border: '1px solid #ccc',
                    borderRadius: '4px',
                  }}
                />
              </div>
            )}
          </PopoverContent>
        </Popover>
      </div>

      {/* Show warning if selected date is unavailable */}
      {value && unavailableDates.length > 0 && postId && (
        (() => {
          try {
            const selectedDateStr = typeof value === 'string' 
              ? new Date(value).toISOString().split('T')[0]
              : value instanceof Date
              ? value.toISOString().split('T')[0]
              : null

            if (selectedDateStr && unavailableDates.includes(selectedDateStr)) {
              const dateObj = new Date(selectedDateStr)
              if (!isNaN(dateObj.getTime())) {
                return (
                  <div
                    style={{
                      marginTop: '0.5rem',
                      padding: '0.5rem',
                      backgroundColor: '#fee2e2',
                      border: '1px solid #ef4444',
                      borderRadius: '4px',
                      color: '#991b1b',
                      fontSize: '0.875rem',
                      fontWeight: 500,
                    }}
                  >
                    ⚠️ Warning: This date ({format(dateObj, 'MMM dd, yyyy')}) is already booked. Please
                    select a different date.
                  </div>
                )
              }
            }
          } catch {
            // Ignore date formatting errors
          }
          return null
        })()
      )}
    </div>
  )
}

