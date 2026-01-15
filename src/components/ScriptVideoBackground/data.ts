
export interface SceneData {
    id: string;
    type: 'image' | 'sprite' | 'video';
    src: string;
    texts: string[];
    overlay?: string;
    // For sprite cropping (percentages)
    crop?: {
        x: number;
        y: number;
        width: number;
        height: number;
    };
    // Custom animation override
    animation?: {
        initial: { scale: number; x: string | number; y: string | number };
        animate: { scale: number; x: string | number; y: string | number };
        transition: { duration: number; ease: "linear" | "easeIn" | "easeOut" | "easeInOut" | "circIn" | "circOut" | "circInOut" | "backIn" | "backOut" | "backInOut" | "anticipate" };
    };
}

const ASSET_PREFIX = '/ad-movie';

export const script: SceneData[] = [
    {
        id: 'scene-intro-1',
        type: 'video',
        src: `${ASSET_PREFIX}/video1.mp4`,
        texts: [
            "Experience the vibe\nin motion."
        ]
    },
    {
        id: 'scene-intro-2',
        type: 'video',
        src: `${ASSET_PREFIX}/video2.mp4`,
        texts: [
            "See the details\ncome to life."
        ]
    },
    {
        id: 'scene-1',
        type: 'image',
        src: `${ASSET_PREFIX}/2.png`,
        animation: {
            initial: { scale: 1.0, x: '0%', y: '0%' },
            animate: { scale: 1.15, x: '-5%', y: '0%' },
            transition: { duration: 15, ease: "linear" }
        },
        texts: [
            "I always set\nthe alarm off, and\ncan never remember\nthe pin code.",
            "Closing the door to arm\nis super standard."
        ]
    },
    {
        id: 'scene-2',
        type: 'image',
        src: `${ASSET_PREFIX}/Gallery_Gathering.png`,
        texts: [
            "No Electricity or water,\nno problem.",
            "Just order a Hike, and you have a response to a solution.",
            "10l water backup in\nthe utility."
        ]
    },
    {
        id: 'scene-3',
        type: 'image',
        src: `${ASSET_PREFIX}/Img_2023_10_12_18_07_19~2 (1).png`,
        texts: [
            "The estimate said there\nwere enough tokens\nleft until spring.",
            "Rescheduling is instantly\nreflected in that\nclubhouse I read."
        ]
    },
    {
        id: 'scene-4',
        type: 'image',
        src: `${ASSET_PREFIX}/ocean.jpg`,
        texts: [
            "The South Easter\nis blowing.\nLogically I wouldn't start\nbraaing, and of course\nI would leave an open\nflame while I went to\nthe beach, duh."
        ]
    },
    {
        id: 'scene-5',
        type: 'image',
        src: `${ASSET_PREFIX}/studio_ticket.png`,
        texts: [
            "Security is pretty\ntight, but don't carry any\ncash or leave our shit\non the lawn.\nPeople will steal it."
        ]
    },
    {
        id: 'scene-6a',
        type: 'image',
        src: `${ASSET_PREFIX}/guitar_1.jpg`,
        texts: [
            "Nothing beats a\nSunday jam session."
        ]
    },
    {
        id: 'scene-6b',
        type: 'image',
        src: `${ASSET_PREFIX}/guitar_2.jpg`,
        texts: [
            "Good vibes and\ngreat company."
        ]
    },
    {
        id: 'scene-6c',
        type: 'image',
        src: `${ASSET_PREFIX}/guitar_3.jpg`,
        texts: [
            "Making memories."
        ]
    },
    {
        id: 'scene-6d',
        type: 'image',
        src: `${ASSET_PREFIX}/guitar_4.jpg`,
        texts: [
            "Lifestyle at its best."
        ]
    },
    {
        id: 'scene-7',
        type: 'video',
        src: `${ASSET_PREFIX}/video1.mp4`,
        texts: [],
        overlay: `${ASSET_PREFIX}/studio_ticket.png`
    },
    {
        id: 'scene-8',
        type: 'video',
        src: `${ASSET_PREFIX}/video2.mp4`,
        texts: [],
        overlay: `${ASSET_PREFIX}/studio_ticket.png`
    }
];
