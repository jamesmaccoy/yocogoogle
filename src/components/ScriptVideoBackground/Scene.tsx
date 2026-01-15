
import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import type { SceneData } from './data';

interface SceneProps {
    scene: SceneData;
    isActive: boolean;
    activeTextIndex: number;
}

export const Scene: React.FC<SceneProps> = ({ scene, isActive, activeTextIndex }) => {
    // Styles for sprite cropping
    const imageStyle: React.CSSProperties = scene.type === 'sprite' && scene.crop ? {
        objectFit: 'cover' as const,
        objectPosition: `${(scene.crop.x / (100 - scene.crop.width)) * 100}% ${(scene.crop.y / (100 - scene.crop.height)) * 100}%`,
        width: '100%',
        height: '100%',
        transform: 'scale(1.2)' // Slight zoom to compensate for potential borders in sprite
    } : {
        objectFit: 'cover' as const,
        width: '100%',
        height: '100%',
    };

    return (
        <div className={`absolute inset-0 w-full h-full overflow-hidden bg-black transition-opacity duration-1000 ${isActive ? 'opacity-100 z-10' : 'opacity-0 z-0'}`}>

            {/* Background Image with slight Ken Burns effect */}
            <motion.div
                className="absolute inset-0 w-full h-full"
                initial={scene.animation?.initial || { scale: 1 }}
                animate={isActive ? (scene.animation?.animate || { scale: 1.05 }) : (scene.animation?.initial || { scale: 1 })}
                transition={scene.animation?.transition || { duration: 10, ease: "linear" }}
            >
                {scene.type === 'sprite' ? (
                    <div className="w-full h-full overflow-hidden relative">
                        {/* We use a much larger image and position it absolutely to "crop" it */}
                        <img
                            src={scene.src}
                            alt=""
                            className="absolute max-w-none"
                            style={{
                                top: `-${scene.crop?.y}%`,
                                left: `-${scene.crop?.x}%`,
                                width: '400%', // Since it's a 4x2 grid roughly (based on 25% width), 400% width makes one cell 100% of container
                                height: '200%', // 2 rows -> 200% height
                                objectFit: 'cover'
                            }}
                        />
                    </div>
                ) : scene.type === 'video' ? (
                    <video
                        src={scene.src}
                        autoPlay
                        muted
                        loop
                        playsInline
                        className="w-full h-full object-cover"
                    />
                ) : (
                    <img src={scene.src} alt="" style={imageStyle} />
                )}
            </motion.div>

            {/* Dark Gradient Overlay to ensure text readability */}
            <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent" />

            {/* Overlay Image */}
            {scene.overlay && (
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-20">
                    <img
                        src={scene.overlay}
                        alt="overlay"
                        className="w-1/2 h-auto object-contain drop-shadow-2xl opacity-90"
                        style={{ transform: 'rotate(-5deg)' }}
                    />
                </div>
            )}

            {/* Text Overlay */}
            <div className="absolute inset-0 flex flex-col justify-end p-8 md:p-16 pb-24 z-30">
                <AnimatePresence mode="wait">
                    {scene.texts[activeTextIndex] && (
                        <motion.div
                            key={`${scene.id}-text-${activeTextIndex}`}
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -20 }}
                            transition={{ duration: 0.5 }}
                            className="max-w-2xl"
                        >
                            <h2 className="text-3xl md:text-5xl font-bold font-sans text-white leading-tight drop-shadow-lg whitespace-pre-line">
                                {scene.texts[activeTextIndex]}
                            </h2>
                        </motion.div>
                    )}
                </AnimatePresence>
            </div>
        </div>
    );
};
