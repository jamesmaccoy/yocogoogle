'use client'
import { AIAssistant } from '@/components/AIAssistant/AIAssistant'
import { useHeaderTheme } from '@/providers/HeaderTheme'
import React, { useEffect } from 'react'

const PageClient: React.FC = () => {
  /* Force the header to be dark mode while we have an image behind it */
  const { setHeaderTheme } = useHeaderTheme()

  useEffect(() => {
    setHeaderTheme('light')
  }, [setHeaderTheme])
  return (
    <>
      <AIAssistant />
    </>
  )
}

export default PageClient
