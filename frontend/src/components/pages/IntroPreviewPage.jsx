import React, { useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import bullLogo from '../../assets/kairon-bull.png';

const PHASE = {
    BOOT: 'boot',
    TYPE_ONE: 'type_one',
    HOLD_ONE: 'hold_one',
    ERASE_ONE: 'erase_one',
    TYPE_TWO: 'type_two',
    HOLD_TWO: 'hold_two',
    SHIFT: 'shift',
    TITLE: 'title',
};

const LINES = ['markets are chaos', "Until they're not"];
const TITLE = 'KARION';

const isTypingPhase = (phase) => (
    phase === PHASE.TYPE_ONE ||
    phase === PHASE.HOLD_ONE ||
    phase === PHASE.ERASE_ONE ||
    phase === PHASE.TYPE_TWO ||
    phase === PHASE.HOLD_TWO
);

const LivingBull = ({ className, reduceMotion = false, halo = 0.42 }) => (
    <motion.div
        className={`relative ${className}`}
        animate={reduceMotion ? {} : { y: [0, -10, 0], rotate: [0, 1.8, 0, -1.8, 0], scale: [1, 1.03, 1] }}
        transition={{ duration: 3.6, repeat: Infinity, ease: 'easeInOut' }}
    >
        <motion.div
            className="absolute inset-[-28%] rounded-full blur-3xl"
            style={{ background: `radial-gradient(circle, rgba(201,153,75,${halo}) 0%, rgba(201,153,75,0.1) 38%, transparent 76%)` }}
            animate={reduceMotion ? {} : { opacity: [0.42, 1, 0.42], scale: [0.88, 1.18, 0.88] }}
            transition={{ duration: 2.2, repeat: Infinity, ease: 'easeInOut' }}
        />
        <motion.img
            src={bullLogo}
            alt="Karion Bull"
            className="relative h-full w-full object-contain"
            animate={reduceMotion ? {} : { filter: ['drop-shadow(0 0 8px rgba(201,153,75,0.18))', 'drop-shadow(0 0 16px rgba(201,153,75,0.5))', 'drop-shadow(0 0 8px rgba(201,153,75,0.18))'] }}
            transition={{ duration: 2.2, repeat: Infinity, ease: 'easeInOut' }}
        />
        <motion.div
            className="pointer-events-none absolute inset-0"
            style={{ background: 'linear-gradient(112deg, transparent 20%, rgba(255,255,255,0.65) 50%, transparent 80%)', mixBlendMode: 'screen' }}
            animate={reduceMotion ? {} : { x: ['-135%', '145%'] }}
            transition={{ duration: 2.6, repeat: Infinity, repeatDelay: 1.1, ease: [0.22, 1, 0.36, 1] }}
        />
    </motion.div>
);

const SparkStar = ({ className, delay = 0 }) => (
    <motion.div
        className={`pointer-events-none absolute ${className}`}
        animate={{ scale: [0.8, 1.25, 0.8], opacity: [0.22, 1, 0.22] }}
        transition={{ duration: 2.3, repeat: Infinity, delay, ease: 'easeInOut' }}
    >
        <div className="absolute left-1/2 top-0 h-full w-[1px] -translate-x-1/2 bg-white/90" />
        <div className="absolute left-0 top-1/2 h-[1px] w-full -translate-y-1/2 bg-white/90" />
    </motion.div>
);

const IntroPreviewPage = () => {
    const [phase, setPhase] = useState(PHASE.BOOT);
    const [typedText, setTypedText] = useState('');
    const [sceneKey, setSceneKey] = useState(0);
    const shouldReduceMotion = useReducedMotion();
    const titleChars = useMemo(() => TITLE.split(''), []);

    useEffect(() => {
        let timeoutId;

        if (phase === PHASE.BOOT) {
            timeoutId = setTimeout(() => setPhase(PHASE.TYPE_ONE), shouldReduceMotion ? 250 : 1200);
        }

        if (phase === PHASE.TYPE_ONE) {
            if (typedText.length < LINES[0].length) {
                timeoutId = setTimeout(() => {
                    setTypedText(LINES[0].slice(0, typedText.length + 1));
                }, shouldReduceMotion ? 20 : 64);
            } else {
                timeoutId = setTimeout(() => setPhase(PHASE.HOLD_ONE), shouldReduceMotion ? 120 : 920);
            }
        }

        if (phase === PHASE.HOLD_ONE) {
            timeoutId = setTimeout(() => setPhase(PHASE.ERASE_ONE), shouldReduceMotion ? 120 : 720);
        }

        if (phase === PHASE.ERASE_ONE) {
            if (typedText.length > 0) {
                timeoutId = setTimeout(() => {
                    setTypedText(LINES[0].slice(0, typedText.length - 1));
                }, shouldReduceMotion ? 16 : 36);
            } else {
                timeoutId = setTimeout(() => setPhase(PHASE.TYPE_TWO), shouldReduceMotion ? 120 : 220);
            }
        }

        if (phase === PHASE.TYPE_TWO) {
            if (typedText.length < LINES[1].length) {
                timeoutId = setTimeout(() => {
                    setTypedText(LINES[1].slice(0, typedText.length + 1));
                }, shouldReduceMotion ? 20 : 74);
            } else {
                timeoutId = setTimeout(() => setPhase(PHASE.HOLD_TWO), shouldReduceMotion ? 120 : 980);
            }
        }

        if (phase === PHASE.HOLD_TWO) {
            timeoutId = setTimeout(() => {
                setTypedText('');
                setPhase(PHASE.SHIFT);
            }, shouldReduceMotion ? 120 : 920);
        }

        if (phase === PHASE.SHIFT) {
            timeoutId = setTimeout(() => setPhase(PHASE.TITLE), shouldReduceMotion ? 160 : 950);
        }

        return () => clearTimeout(timeoutId);
    }, [phase, shouldReduceMotion, typedText]);

    const replay = () => {
        setTypedText('');
        setPhase(PHASE.BOOT);
        setSceneKey((prev) => prev + 1);
    };

    return (
        <div className="fixed inset-0 flex items-center justify-center overflow-hidden bg-black px-6">
            <div className="pointer-events-none absolute inset-0">
                <div className="absolute inset-0 bg-[radial-gradient(120%_100%_at_50%_45%,#17110a_0%,#070707_46%,#000000_100%)]" />
                <motion.div
                    className="absolute left-1/2 top-[44%] h-[48rem] w-[48rem] -translate-x-1/2 -translate-y-1/2 rounded-full blur-[120px]"
                    style={{ background: 'radial-gradient(circle, rgba(201,153,75,0.22) 0%, rgba(201,153,75,0.05) 40%, transparent 76%)' }}
                    animate={shouldReduceMotion ? {} : { scale: [0.92, 1.1, 0.92], opacity: [0.62, 1, 0.62] }}
                    transition={{ duration: 4.8, repeat: Infinity, ease: 'easeInOut' }}
                />
                <motion.div
                    className="absolute left-1/2 top-0 h-[52vh] w-[70vw] -translate-x-1/2 blur-[60px]"
                    style={{ background: 'linear-gradient(180deg, rgba(201,153,75,0.2) 0%, rgba(201,153,75,0) 78%)' }}
                    animate={shouldReduceMotion ? {} : { opacity: [0.25, 0.6, 0.25] }}
                    transition={{ duration: 3.6, repeat: Infinity, ease: 'easeInOut' }}
                />
                <div
                    className="absolute inset-0 opacity-[0.06]"
                    style={{
                        backgroundImage: 'linear-gradient(to right, rgba(255,255,255,0.06) 1px, transparent 1px), linear-gradient(to bottom, rgba(255,255,255,0.06) 1px, transparent 1px)',
                        backgroundSize: '48px 48px',
                    }}
                />
                <div
                    className="absolute inset-0 opacity-[0.08]"
                    style={{
                        backgroundImage: 'radial-gradient(rgba(255,255,255,0.45) 0.65px, transparent 0.65px)',
                        backgroundSize: '3px 3px',
                    }}
                />
                <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_45%,rgba(0,0,0,0.68)_100%)]" />
            </div>

            <a
                href="/"
                className="absolute left-5 top-5 z-20 rounded-full border border-white/20 px-3 py-1 text-xs uppercase tracking-[0.2em] text-white/55 transition hover:border-white/40 hover:text-white"
            >
                Back
            </a>
            <button
                type="button"
                onClick={replay}
                className="absolute right-5 top-5 z-20 rounded-full border border-white/20 px-3 py-1 text-xs uppercase tracking-[0.2em] text-white/55 transition hover:border-white/40 hover:text-white"
            >
                Replay
            </button>

            <SparkStar className="left-[18%] top-[26%] h-3 w-3" delay={0.1} />
            <SparkStar className="right-[20%] top-[34%] h-2.5 w-2.5" delay={0.75} />
            <SparkStar className="left-[56%] top-[16%] h-2 w-2" delay={1.2} />

            <AnimatePresence mode="wait">
                {phase === PHASE.BOOT && (
                    <motion.div
                        key={`boot-${sceneKey}`}
                        className="relative flex items-center justify-center"
                        initial={{ opacity: 0, scale: 0.8 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, y: -14 }}
                        transition={{ duration: shouldReduceMotion ? 0.18 : 1.2, ease: [0.16, 1, 0.3, 1] }}
                    >
                        <motion.div
                            className="absolute h-56 w-56 rounded-full border border-[#d0ab68]/30"
                            animate={shouldReduceMotion ? {} : { rotate: 360 }}
                            transition={{ duration: 18, repeat: Infinity, ease: 'linear' }}
                        />
                        <LivingBull className="h-36 w-36 md:h-48 md:w-48" reduceMotion={shouldReduceMotion} halo={0.5} />
                    </motion.div>
                )}

                {isTypingPhase(phase) && (
                    <motion.div
                        key={`type-${phase}-${sceneKey}`}
                        className="relative flex max-w-[96vw] items-center justify-center gap-3 md:gap-5"
                        initial={{ opacity: 0, y: 28 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -12 }}
                        transition={{ duration: shouldReduceMotion ? 0.14 : 0.62, ease: [0.22, 1, 0.36, 1] }}
                    >
                        <div className="absolute left-1/2 top-[66%] h-[2px] w-[80vw] -translate-x-1/2 rounded-full bg-gradient-to-r from-transparent via-[#d1ac6a]/40 to-transparent" />
                        <span
                            className="min-h-[1.5em] text-center font-medium tracking-tight text-[#f8f3e8] text-[clamp(1.6rem,5.6vw,5.9rem)]"
                            style={{ fontFamily: '"Manrope", "Plus Jakarta Sans", sans-serif' }}
                        >
                            {typedText || '\u00A0'}
                        </span>
                        <LivingBull className="h-9 w-9 shrink-0 md:h-14 md:w-14" reduceMotion={shouldReduceMotion} halo={0.62} />
                    </motion.div>
                )}

                {phase === PHASE.SHIFT && (
                    <motion.div
                        key={`shift-${sceneKey}`}
                        className="relative flex h-[38vh] w-full items-center justify-center"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                    >
                        <motion.div
                            initial={{ x: 0, scale: 1.1 }}
                            animate={{ x: '24vw', scale: 0.72 }}
                            transition={{ duration: shouldReduceMotion ? 0.2 : 0.9, ease: [0.16, 1, 0.3, 1] }}
                        >
                            <LivingBull className="h-24 w-24 md:h-32 md:w-32" reduceMotion={shouldReduceMotion} halo={0.58} />
                        </motion.div>
                    </motion.div>
                )}

                {phase === PHASE.TITLE && (
                    <motion.div
                        key={`title-${sceneKey}`}
                        className="relative flex flex-col items-center gap-5"
                        initial={{ opacity: 0, y: 16, scale: 0.92 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        transition={{ duration: shouldReduceMotion ? 0.2 : 0.96, ease: [0.16, 1, 0.3, 1] }}
                    >
                        <motion.div
                            className="absolute -top-12 h-36 w-[30rem] rounded-full bg-[#c9994b]/30 blur-[72px]"
                            animate={shouldReduceMotion ? {} : { opacity: [0.26, 0.95, 0.26], scale: [0.9, 1.08, 0.9] }}
                            transition={{ duration: 2.8, repeat: Infinity, ease: 'easeInOut' }}
                        />
                        <div className="relative flex items-end justify-center gap-2.5 md:gap-4">
                            <h1
                                className="leading-none text-[clamp(2.8rem,12vw,9.4rem)] uppercase tracking-[0.17em] text-[#f9f3e7]"
                                style={{ fontFamily: '"Cinzel", "Times New Roman", serif' }}
                            >
                                {titleChars.map((char, index) => (
                                    <motion.span
                                        key={`${char}-${index}`}
                                        className="inline-block"
                                        initial={{ y: 26, opacity: 0, filter: 'blur(5px)' }}
                                        animate={{ y: 0, opacity: 1, filter: 'blur(0px)' }}
                                        transition={{ duration: shouldReduceMotion ? 0.15 : 0.58, delay: shouldReduceMotion ? 0 : index * 0.07, ease: [0.22, 1, 0.36, 1] }}
                                    >
                                        {char}
                                    </motion.span>
                                ))}
                            </h1>
                            <motion.div
                                className="mb-1 md:mb-3"
                                initial={{ x: -26, opacity: 0, scale: 0.8 }}
                                animate={{ x: 0, opacity: 1, scale: 1 }}
                                transition={{ duration: shouldReduceMotion ? 0.12 : 0.6, delay: shouldReduceMotion ? 0 : 0.42, ease: [0.22, 1, 0.36, 1] }}
                            >
                                <LivingBull className="h-12 w-12 md:h-20 md:w-20" reduceMotion={shouldReduceMotion} halo={0.66} />
                            </motion.div>
                        </div>
                        <motion.div
                            className="h-[1px] w-[min(78vw,48rem)] bg-gradient-to-r from-transparent via-[#d6b06f]/80 to-transparent"
                            initial={{ opacity: 0, scaleX: 0.6 }}
                            animate={{ opacity: 1, scaleX: 1 }}
                            transition={{ duration: shouldReduceMotion ? 0.12 : 0.7, delay: shouldReduceMotion ? 0 : 0.56, ease: [0.22, 1, 0.36, 1] }}
                        />
                        <p
                            className="px-4 text-center text-[clamp(0.74rem,1.8vw,0.98rem)] uppercase tracking-[0.26em] text-[#e9dbc0]"
                            style={{ fontFamily: '"Manrope", "Plus Jakarta Sans", sans-serif' }}
                        >
                            markets are chaos . until they&apos;re not
                        </p>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
};

export default IntroPreviewPage;
