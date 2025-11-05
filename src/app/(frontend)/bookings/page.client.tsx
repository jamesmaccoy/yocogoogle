'use client'

import { useHeaderTheme } from '@/providers/HeaderTheme'
import { useTheme } from '@/providers/Theme'
import React, { useEffect } from 'react'
import { AIAssistant } from '@/components/AIAssistant/AIAssistant'

const PageClient: React.FC = () => {
  const { theme } = useTheme()
  const { setHeaderTheme } = useHeaderTheme()

  useEffect(() => {
    if (theme) {
      setHeaderTheme(theme)
    }
  }, [theme, setHeaderTheme])

  return (
    <>
      <AIAssistant />
    </>
  )
}

export default PageClient