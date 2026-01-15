'use client'

import React, { useState, useEffect, useMemo } from 'react';
import { script } from './data';
import { Scene } from './Scene';
import type { Post, Media } from '@/payload-types';

const SCENE_DURATION_PER_TEXT = 4000; // ms per text block

interface ScriptVideoBackgroundProps {
    featuredPosts?: Post[];
}

export const ScriptVideoBackground: React.FC<ScriptVideoBackgroundProps> = ({ featuredPosts = [] }) => {
    const [currentSceneIndex, setCurrentSceneIndex] = useState(0);
    const [currentTextIndex, setCurrentTextIndex] = useState(0);

    // Merge static script with dynamic featured posts
    const activeScript = useMemo(() => {
        // Create a deep copy or map to new objects
        return script.map(scene => {
            let newSrc = scene.src;

            // Logic to inject featured posts into specific slots
            // We'll map the first 3 featured posts to scenes 6a, 6b, 6c (guitar/jam session scenes)
            if (scene.id === 'scene-6a' && featuredPosts[0]) {
                const media = featuredPosts[0].meta?.image || featuredPosts[0].heroImage;
                if (media && typeof media === 'object' && 'url' in media && media.url) {
                    newSrc = media.url;
                }
            } else if (scene.id === 'scene-6b' && featuredPosts[1]) {
                const media = featuredPosts[1].meta?.image || featuredPosts[1].heroImage;
                if (media && typeof media === 'object' && 'url' in media && media.url) {
                    newSrc = media.url;
                }
            } else if (scene.id === 'scene-6c' && featuredPosts[2]) {
                const media = featuredPosts[2].meta?.image || featuredPosts[2].heroImage;
                if (media && typeof media === 'object' && 'url' in media && media.url) {
                    newSrc = media.url;
                }
            }

            return {
                ...scene,
                src: newSrc
            };
        });
    }, [featuredPosts]);

    useEffect(() => {
        const scene = activeScript[currentSceneIndex];
        if (!scene) return;

        const textCount = scene.texts.length || 1; // Ensure at least 1 duration cycle even if no text

        const timer = setTimeout(() => {
            if (currentTextIndex < textCount - 1) {
                // Next text in same scene
                setCurrentTextIndex(prev => prev + 1);
            } else {
                // Next scene
                if (currentSceneIndex < activeScript.length - 1) {
                    setCurrentSceneIndex(prev => prev + 1);
                    setCurrentTextIndex(0);
                } else {
                    // Loop back to start
                    setCurrentSceneIndex(0);
                    setCurrentTextIndex(0);
                }
            }
        }, SCENE_DURATION_PER_TEXT);

        return () => clearTimeout(timer);
    }, [currentSceneIndex, currentTextIndex, activeScript]);

    return (
        <div className="relative w-full h-[100dvh] bg-black overflow-hidden">
            <div className="absolute top-4 right-4 z-50 mix-blend-difference text-white/50 font-mono text-sm">
                {currentSceneIndex + 1} / {activeScript.length}
            </div>

            {activeScript.map((scene, index) => (
                <Scene
                    key={`${scene.id}-${index}`} // Add index to key to force re-render if src changes
                    scene={scene}
                    isActive={index === currentSceneIndex}
                    activeTextIndex={index === currentSceneIndex ? currentTextIndex : 0}
                />
            ))}

            {/* Progress Bar */}
            <div className="absolute bottom-0 left-0 w-full h-1 bg-white/10 z-50">
                <div
                    className="h-full bg-white transition-all duration-300 ease-linear"
                    style={{
                        width: `${((currentSceneIndex + (currentTextIndex / (activeScript[currentSceneIndex]?.texts.length || 1))) / activeScript.length) * 100}%`
                    }}
                />
            </div>
        </div>
    );
};
