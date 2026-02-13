import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Sun, Moon } from 'lucide-react';
import { useTheme } from '../../contexts/ThemeContext';
import { cn } from '../../lib/utils';

const ThemeToggle = ({ className, size = 'md' }) => {
    const { isDark, toggleTheme } = useTheme();

    const sizes = {
        sm: { button: 'w-8 h-8', icon: 'w-4 h-4' },
        md: { button: 'w-10 h-10', icon: 'w-5 h-5' },
        lg: { button: 'w-12 h-12', icon: 'w-6 h-6' },
    };

    const { button, icon } = sizes[size] || sizes.md;

    return (
        <motion.button
            onClick={toggleTheme}
            className={cn(
                button,
                "relative flex items-center justify-center rounded-xl",
                "transition-all duration-300",
                isDark
                    ? "bg-white/5 hover:bg-white/10 border border-white/10 hover:border-[#00D9A5]/30"
                    : "bg-slate-100 hover:bg-slate-200 border border-slate-200 hover:border-[#00A37A]/30",
                className
            )}
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            title={isDark ? 'Passa a Light Mode' : 'Passa a Dark Mode'}
        >
            <AnimatePresence mode="wait" initial={false}>
                {isDark ? (
                    <motion.div
                        key="moon"
                        initial={{ opacity: 0, rotate: -90, scale: 0.5 }}
                        animate={{ opacity: 1, rotate: 0, scale: 1 }}
                        exit={{ opacity: 0, rotate: 90, scale: 0.5 }}
                        transition={{ duration: 0.2 }}
                    >
                        <Moon className={cn(icon, "text-yellow-400")} />
                    </motion.div>
                ) : (
                    <motion.div
                        key="sun"
                        initial={{ opacity: 0, rotate: 90, scale: 0.5 }}
                        animate={{ opacity: 1, rotate: 0, scale: 1 }}
                        exit={{ opacity: 0, rotate: -90, scale: 0.5 }}
                        transition={{ duration: 0.2 }}
                    >
                        <Sun className={cn(icon, "text-amber-500")} />
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Glow effect */}
            <motion.div
                className={cn(
                    "absolute inset-0 rounded-xl opacity-0",
                    isDark ? "bg-yellow-400/20" : "bg-amber-400/20"
                )}
                whileHover={{ opacity: 1 }}
                transition={{ duration: 0.2 }}
            />
        </motion.button>
    );
};

export default ThemeToggle;
