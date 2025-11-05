'use client'
import React, { useEffect, useState } from 'react'
import { Line } from 'react-chartjs-2'
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
} from 'chart.js'
ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip, Legend)
interface AnalyticsData {
  activeUsersNow?: number
  total30DayUsers?: number
  total30DayViews?: number
  historicalData?: Array<{
    date: string
    users: number
    views: number
  }>
}
const AnalyticsDashboard: React.FC = () => {
  const [data, setData] = useState<AnalyticsData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  // fallback data
  const fallbackData: AnalyticsData = {
    historicalData: [
      { date: '2025-03-15', users: 4, views: 5 },
      { date: '2025-03-16', users: 5, views: 6 },
      { date: '2025-03-17', users: 6, views: 7 },
      { date: '2025-03-18', users: 2, views: 3 },
      { date: '2025-03-19', users: 1, views: 2 },
      { date: '2025-03-20', users: 10, views: 15 },
      { date: '2025-03-21', users: 8, views: 12 },
      { date: '2025-03-22', users: 11, views: 13 },
      { date: '2025-03-23', users: 7, views: 9 },
      { date: '2025-03-24', users: 4, views: 5 },
      { date: '2025-03-25', users: 13, views: 15 },
      { date: '2025-03-26', users: 14, views: 16 },
      { date: '2025-03-27', users: 12, views: 14 },
      { date: '2025-03-28', users: 16, views: 18 },
      { date: '2025-03-29', users: 13, views: 15 },
      { date: '2025-03-30', users: 14, views: 17 },
      { date: '2025-03-31', users: 3, views: 4 },
      { date: '2025-04-01', users: 20, views: 24 },
    ],
  }
  const fetchAnalytics = async () => {
    try {
      const response = await fetch('/api/analytics', {
        headers: { 'Content-Type': 'application/json' },
      })

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`)
      }

      return await response.json()
    } catch (err) {
      console.error('Fetch error:', err)
      throw err instanceof Error ? err : new Error('Failed to fetch analytics')
    }
  }
  useEffect(() => {
    const loadData = async () => {
      try {
        const analyticsData = await fetchAnalytics()
        // Check if the data is empty or invalid
        const isEmptyData =
          !analyticsData ||
          (analyticsData.activeUsersNow === 0 &&
            analyticsData.total30DayUsers === 0 &&
            (!analyticsData.historicalData || analyticsData.historicalData.length === 0))

        setData(isEmptyData ? fallbackData : analyticsData)
        setError(null)
      } catch (err) {
        console.error('Error loading analytics:', err)
        setData(fallbackData) // Use fallback data on error
        setError(err instanceof Error ? err.message : 'Failed to fetch analytics')
      } finally {
        setLoading(false)
      }
    }

    loadData()
    // const interval = setInterval(loadData, 120000)
    const interval = setInterval(loadData, 3000)
    return () => clearInterval(interval)
  }, [])
  const Card = ({
    title,
    value,
    style = {},
  }: {
    title: string
    value: number
    style?: React.CSSProperties
  }) => {
    const [hovered, setHovered] = useState(false)

    return (
      <div
        style={{
          padding: '1.5rem',
          backgroundColor: 'var(--theme-elevation-50)',
          borderRadius: '8px',
          boxShadow: hovered ? '0 4px 12px rgba(0, 0, 0, 0.15)' : '0 2px 6px rgba(0,0,0,0.08)',
          border: hovered ? '1px solid var(--theme-elevation-200)' : '1px solid transparent',
          transition: 'all 0.2s ease-in-out',
          cursor: 'pointer',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          minHeight: '120px',
          ...style,
        }}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
      >
        <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 600 }}>{title}</h3>
        <p style={{ fontSize: '2rem', fontWeight: 'bold', margin: '0.5rem 0 0' }}>{value}</p>
      </div>
    )
  }
  // Determine which data to use (fallback if no data available)
  const displayData = data || fallbackData
  const chartData = displayData.historicalData || []
  return (
    <div style={{ margin: '2rem 0', padding: '0 1rem' }}>
      <h2 style={{ fontSize: '1.8rem', marginBottom: '1rem' }}>📊 Google Analytics Overview</h2>

      {loading && <div>Loading analytics data...</div>}
      {error && (
        <div
          style={{
            color: 'var(--theme-error-500)',
            backgroundColor: 'var(--theme-error-50)',
            padding: '1rem',
            borderRadius: '4px',
            marginBottom: '1rem',
          }}
        >
          {error} (using fallback data)
        </div>
      )}

      <div
        style={{
          display: 'grid',
          marginTop: '2rem',
          gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
          gap: '1.5rem',
          marginBottom: '2rem',
        }}
      >
        <Card title="Active Users Now" value={displayData.activeUsersNow || 0} />
        <Card title="Total Users 30 Days" value={displayData.total30DayUsers || 0} />
        <Card title="Total Views 30 Days" value={displayData.total30DayViews || 0} />
      </div>

      <div
        style={{
          padding: '2rem 1rem',
          backgroundColor: 'var(--theme-elevation-25)',
          borderRadius: '8px',
          boxShadow: '0 2px 6px rgba(0,0,0,0.08)',
        }}
      >
        <h3 style={{ marginTop: 0, marginBottom: '1rem' }}>📈 User Activity 30 Days</h3>

        {chartData.length > 0 ? (
          <div style={{ width: '100%', height: '400px' }}>
            <Line
              data={{
                labels: chartData.map((item) => item.date),
                datasets: [
                  {
                    label: 'Users',
                    data: chartData.map((item) => item.users),
                    borderColor: 'rgb(75, 192, 192)',
                    backgroundColor: 'rgba(75, 192, 192, 0.2)',
                    tension: 0.3,
                    fill: true,
                  },
                  {
                    label: 'Views',
                    data: chartData.map((item) => item.views),
                    borderColor: 'rgb(53, 162, 235)',
                    backgroundColor: 'rgba(53, 162, 235, 0.2)',
                    tension: 0.3,
                    fill: true,
                  },
                ],
              }}
              options={{
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                  legend: {
                    position: 'top',
                  },
                  tooltip: {
                    mode: 'index',
                    intersect: false,
                  },
                },
                scales: {
                  x: {
                    grid: {
                      display: false,
                    },
                  },
                  y: {
                    beginAtZero: true,
                  },
                },
              }}
            />
          </div>
        ) : (
          <p>No data available for the selected period.</p>
        )}
      </div>
    </div>
  )
}
export default AnalyticsDashboard
