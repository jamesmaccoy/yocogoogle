'use client'

import { useEffect, useState } from 'react'

export function DivineLightEffect() {
  const [isVisible, setIsVisible] = useState(true)

  useEffect(() => {
    // Inject CSS keyframes
    const style = document.createElement('style')
    style.textContent = `
      @keyframes divine-shimmer {
        0%, 100% {
          opacity: 0.3;
        }
        50% {
          opacity: 0.8;
        }
      }

      @keyframes divine-float {
        0%, 100% {
          transform: translateY(0) scale(1);
          opacity: 0.6;
        }
        50% {
          transform: translateY(-20px) scale(1.2);
          opacity: 1;
        }
      }

      @keyframes divine-fade {
        0% {
          opacity: 0.8;
        }
        100% {
          opacity: 0;
        }
      }
    `
    document.head.appendChild(style)

    // Hide after animation completes
    const timer = setTimeout(() => {
      setIsVisible(false)
    }, 4000) // 4 seconds

    return () => {
      clearTimeout(timer)
      document.head.removeChild(style)
    }
  }, [])

  if (!isVisible) return null

  return (
    <div className="fixed inset-0 pointer-events-none z-50 overflow-hidden">
      {/* Central divine light */}
      <div className="absolute inset-0 flex items-center justify-center">
        <div className="relative w-96 h-96">
          {/* Main light source */}
          <div className="absolute inset-0 rounded-full bg-gradient-to-br from-yellow-200 via-yellow-100 to-white opacity-80 blur-3xl animate-pulse" />
          
          {/* Shimmering rays */}
          {[...Array(12)].map((_, i) => (
            <div
              key={i}
              className="absolute inset-0"
              style={{
                transform: `rotate(${i * 30}deg)`,
              }}
            >
              <div 
                className="absolute top-0 left-1/2 w-1 h-full bg-gradient-to-b from-yellow-300 via-transparent to-transparent opacity-60 -translate-x-1/2"
                style={{
                  animation: `divine-shimmer 3s ease-in-out infinite`,
                  animationDelay: `${i * 0.1}s`,
                }}
              />
            </div>
          ))}

          {/* Rotating light rings */}
          <div 
            className="absolute inset-0 rounded-full border-2 border-yellow-300/40 animate-spin" 
            style={{ animationDuration: '8s' }} 
          />
          <div 
            className="absolute inset-4 rounded-full border border-yellow-200/30 animate-spin" 
            style={{ animationDuration: '12s', animationDirection: 'reverse' }} 
          />
        </div>
      </div>

      {/* Floating light particles */}
      {[...Array(20)].map((_, i) => {
        const delay = Math.random() * 2
        const duration = 3 + Math.random() * 2
        const size = 4 + Math.random() * 8
        const left = Math.random() * 100
        const top = Math.random() * 100
        
        return (
          <div
            key={i}
            className="absolute rounded-full bg-yellow-200/60 blur-sm"
            style={{
              left: `${left}%`,
              top: `${top}%`,
              width: `${size}px`,
              height: `${size}px`,
              animation: `divine-float ${duration}s ease-in-out infinite`,
              animationDelay: `${delay}s`,
            }}
          />
        )
      })}

      {/* Overlay gradient */}
      <div 
        className="absolute inset-0 bg-gradient-to-b from-transparent via-yellow-50/20 to-transparent"
        style={{
          animation: 'divine-fade 4s ease-out forwards',
        }}
      />
    </div>
  )
}

